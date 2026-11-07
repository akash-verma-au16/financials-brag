import { CATEGORY_BY_ID, parentOf } from "./categories";
import { inRange, isIncomeCategory, isSpendCategory, merchantKey, monthOf, type ScopedTxn } from "./cashflow";

/**
 * Expense analysis over household flows (card, chequing, savings, cash accounts). Amounts are
 * positive for spending; returns from a merchant reduce that merchant's/category's total.
 */

export const spendValue = (t: ScopedTxn) => (t.kind === "flow" && isSpendCategory(t.category) ? -t.amount * t.share : 0);
export const isSpend = (t: ScopedTxn) => t.kind === "flow" && isSpendCategory(t.category);

export interface Total {
  key: string;
  total: number;
  count: number;
}

export function totalsBy(txns: ScopedTxn[], range: [string, string], key: (t: ScopedTxn) => string): Total[] {
  const m = new Map<string, Total>();
  for (const t of txns) {
    if (!isSpend(t) || !inRange(t, range)) continue;
    const k = key(t);
    const row = m.get(k) ?? { key: k, total: 0, count: 0 };
    row.total += spendValue(t);
    row.count++;
    m.set(k, row);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

export const byParent = (t: ScopedTxn) => parentOf(t.category).id;
export const byCategoryId = (t: ScopedTxn) => t.category ?? "uncategorised";
const merchantCache = new Map<string, string>();
export const byMerchant = (t: ScopedTxn) => {
  let k = merchantCache.get(t.description);
  if (k === undefined) merchantCache.set(t.description, (k = merchantKey(t.description)));
  return k;
};

// ── Leaving things out ("what if I hadn't taken that trip?") ─────────────────

/** Keys a spending transaction can be left out by: its area, category, merchant or itself. */
export const exclusionKeys = (t: ScopedTxn) => [`p:${byParent(t)}`, `c:${byCategoryId(t)}`, `m:${byMerchant(t)}`, `t:${t.id}`];

/** Spending left out by `ex`, ignoring the keys in `ignore` (so a list can still show its own unticked rows). */
export function isLeftOut(t: ScopedTxn, ex: ReadonlySet<string>, ...ignore: string[]): boolean {
  if (!ex.size || !isSpend(t)) return false;
  return exclusionKeys(t).some((k) => ex.has(k) && !ignore.includes(k));
}

/** Spending per month ("YYYY-MM" → total). */
export function spendByMonth(txns: ScopedTxn[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of txns) if (isSpend(t)) m.set(monthOf(t.date), (m.get(monthOf(t.date)) ?? 0) + spendValue(t));
  return m;
}

// ── Merchants ─────────────────────────────────────────────────────────────────

export interface MerchantRow {
  merchant: string;
  category: string;
  total: number;
  count: number;
  average: number;
  last: string;
  months: number;
  /** Spending per month ("YYYY-MM"). */
  byMonth: Record<string, number>;
}

export function merchants(txns: ScopedTxn[], range: [string, string]): MerchantRow[] {
  const m = new Map<string, { rows: ScopedTxn[]; cats: Map<string, number> }>();
  for (const t of txns) {
    if (!isSpend(t) || !inRange(t, range)) continue;
    const k = byMerchant(t);
    const e = m.get(k) ?? { rows: [] as ScopedTxn[], cats: new Map<string, number>() };
    e.rows.push(t);
    e.cats.set(t.category ?? "uncategorised", (e.cats.get(t.category ?? "uncategorised") ?? 0) + 1);
    m.set(k, e);
  }
  return [...m.entries()]
    .map(([merchant, e]) => {
      const total = e.rows.reduce((s, t) => s + spendValue(t), 0);
      const purchases = e.rows.filter((t) => spendValue(t) > 0);
      const byMonth: Record<string, number> = {};
      for (const t of e.rows) byMonth[monthOf(t.date)] = (byMonth[monthOf(t.date)] ?? 0) + spendValue(t);
      return {
        merchant,
        category: [...e.cats.entries()].sort((a, b) => b[1] - a[1])[0]![0],
        total,
        count: purchases.length,
        average: purchases.length ? purchases.reduce((s, t) => s + spendValue(t), 0) / purchases.length : 0,
        last: e.rows.map((t) => t.date).sort().at(-1)!,
        months: new Set(e.rows.map((t) => monthOf(t.date))).size,
        byMonth,
      };
    })
    .sort((a, b) => b.total - a.total);
}

// ── Recurring payments ────────────────────────────────────────────────────────

export interface Recurring {
  merchant: string;
  category: string;
  /** Typical charge (median). */
  amount: number;
  frequency: "weekly" | "bi-weekly" | "monthly" | "quarterly" | "yearly";
  monthlyCost: number;
  annualCost: number;
  last: string;
  occurrences: number;
  /** Still active: last charge within ~1.5 cycles of `asOf`. */
  active: boolean;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

const CYCLES: { id: Recurring["frequency"]; days: number; perYear: number }[] = [
  { id: "weekly", days: 7, perYear: 52 },
  { id: "bi-weekly", days: 14, perYear: 26 },
  { id: "monthly", days: 30.4, perYear: 12 },
  { id: "quarterly", days: 91, perYear: 4 },
  { id: "yearly", days: 365, perYear: 1 },
];

/**
 * Charges that repeat on a regular cycle with a similar amount (subscriptions, rent, insurance,
 * car payments, phone bills…). Needs ≥ 3 occurrences (≥ 2 for yearly), gaps within ±25% of a
 * cycle, and amounts within ±20% of the median.
 */
export function recurring(txns: ScopedTxn[], asOf: string): Recurring[] {
  const groups = new Map<string, ScopedTxn[]>();
  for (const t of txns) {
    if (!isSpend(t) || spendValue(t) <= 0) continue;
    const k = merchantKey(t.description);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
  }
  const out: Recurring[] = [];
  for (const [merchant, rows] of groups) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length < 2) continue;
    const gaps = sorted.slice(1).map((t, i) => day(t.date) - day(sorted[i]!.date)).filter((g) => g > 2);
    if (!gaps.length) continue;
    const g = median(gaps);
    const cycle = CYCLES.find((c) => Math.abs(g - c.days) <= c.days * 0.25);
    if (!cycle) continue;
    const need = cycle.id === "yearly" ? 2 : 3;
    const amounts = sorted.map(spendValue);
    const typical = median(amounts);
    const steady = amounts.filter((a) => Math.abs(a - typical) <= typical * 0.2).length / amounts.length;
    const regular = gaps.filter((x) => Math.abs(x - cycle.days) <= cycle.days * 0.25).length / gaps.length;
    if (sorted.length < need || steady < 0.7 || regular < 0.6) continue;
    const last = sorted.at(-1)!.date;
    out.push({
      merchant,
      category: sorted.at(-1)!.category ?? "uncategorised",
      amount: typical,
      frequency: cycle.id,
      monthlyCost: (typical * cycle.perYear) / 12,
      annualCost: typical * cycle.perYear,
      last,
      occurrences: sorted.length,
      active: day(asOf) - day(last) <= cycle.days * 1.5,
    });
  }
  return out.sort((a, b) => Number(b.active) - Number(a.active) || b.annualCost - a.annualCost);
}

// ── Review list ───────────────────────────────────────────────────────────────

/** Categories that mean "we couldn't tell" — worth a quick look. */
export const REVIEW_CATEGORIES = new Set(["uncategorised", "in-store", "online-purchase", "refunds", "other-income"]);

export function needsReview(txns: ScopedTxn[], range: [string, string]): MerchantRow[] {
  const rows = txns.filter((t) => t.kind === "flow" && inRange(t, range) && REVIEW_CATEGORIES.has(t.category ?? "uncategorised"));
  const m = new Map<string, MerchantRow>();
  for (const t of rows) {
    const k = merchantKey(t.description);
    const e = m.get(k) ?? { merchant: k, category: t.category ?? "uncategorised", total: 0, count: 0, average: 0, last: t.date, months: 0, byMonth: {} };
    e.total += Math.abs(t.amount * t.share);
    e.count++;
    if (t.date > e.last) e.last = t.date;
    m.set(k, e);
  }
  return [...m.values()].map((e) => ({ ...e, average: e.total / e.count })).sort((a, b) => b.total - a.total);
}

// ── Period helpers ────────────────────────────────────────────────────────────

/** The period just before `range`: the same number of whole months when it spans whole months, else the same number of days. */
export function previousRange([from, to]: [string, string]): [string, string] {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const lastOfMonth = (s: string) => iso(new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)), 0)));
  if (from.endsWith("-01") && to === lastOfMonth(to)) {
    const months = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
    const start = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1 - months, 1));
    const end = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, 0));
    return [iso(start), iso(end)];
  }
  const len = day(to) - day(from);
  const end = new Date((day(from) - 1) * 86_400_000).toISOString().slice(0, 10);
  const start = new Date((day(from) - 1 - len) * 86_400_000).toISOString().slice(0, 10);
  return [start, end];
}

/** Same dates one year earlier. */
export const lastYearRange = ([from, to]: [string, string]): [string, string] => [
  `${Number(from.slice(0, 4)) - 1}${from.slice(4)}`,
  `${Number(to.slice(0, 4)) - 1}${to.slice(4)}`,
];

export const incomeOf = (txns: ScopedTxn[], range: [string, string]) =>
  txns.filter((t) => t.kind === "flow" && inRange(t, range) && isIncomeCategory(t.category)).reduce((s, t) => s + t.amount * t.share, 0);

export const categoryLabel = (id: string) => CATEGORY_BY_ID.get(id)?.label ?? id;
