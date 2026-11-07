import { CATEGORY_BY_ID } from "./categories";
import type { Transaction } from "./model";

/**
 * Household cash flow from "flow" transactions (transfers between own accounts are already
 * excluded) and investment income. Amounts are multiplied by the person's account share.
 */

export type Period = "12m" | "ytd" | "last-year" | "all";

export const PERIOD_LABEL: Record<Period, string> = {
  "12m": "Last 12 months",
  ytd: "This year",
  "last-year": "Last year",
  all: "All time",
};

export type ScopedTxn = Transaction & { share: number };

export const monthOf = (iso: string) => iso.slice(0, 7);

/** [from, to] inclusive ISO dates for a period, relative to `today`. */
export function periodRange(period: Period, today: string, earliest: string): [string, string] {
  const y = Number(today.slice(0, 4));
  switch (period) {
    case "12m": {
      // The 12 most recent months including the current (partial) one.
      const m = Number(today.slice(5, 7));
      const start = new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 10);
      return [start, today];
    }
    case "ytd":
      return [`${y}-01-01`, today];
    case "last-year":
      return [`${y - 1}-01-01`, `${y - 1}-12-31`];
    case "all":
      return [earliest, today];
  }
}

export function inRange(t: { date: string }, [from, to]: [string, string]) {
  return t.date >= from && t.date <= to;
}

export const isIncomeCategory = (c?: string) => CATEGORY_BY_ID.get(c ?? "")?.group === "income";
/** Counts as spending (not income, not a transfer such as a card payment). */
export const isSpendCategory = (c?: string) => (CATEGORY_BY_ID.get(c ?? "")?.group ?? "expense") === "expense";

export interface MonthFlow {
  month: string;
  income: number;
  /** Positive number: money spent (net of refunds). */
  spending: number;
  net: number;
  investmentIncome: number;
  contributions: number;
}

/** Every month from the first to the last in range, including empty ones. */
export function months([from, to]: [string, string]): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const end = monthOf(to);
  for (;;) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    if (k > end) break;
    out.push(k);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function monthly(txns: ScopedTxn[], range: [string, string]): MonthFlow[] {
  const byMonth = new Map(months(range).map((m) => [m, { month: m, income: 0, spending: 0, net: 0, investmentIncome: 0, contributions: 0 }]));
  for (const t of txns) {
    if (!inRange(t, range)) continue;
    const row = byMonth.get(monthOf(t.date));
    if (!row) continue;
    const v = t.amount * t.share;
    if (t.kind === "flow") {
      if (isIncomeCategory(t.category)) row.income += v;
      else if (isSpendCategory(t.category)) row.spending -= v;
      // transfer categories (card payments, moves to investments) are neither
    } else if (t.kind === "investment-income" || t.kind === "tax") row.investmentIncome += v;
    else if (t.kind === "contribution") row.contributions += v;
  }
  for (const r of byMonth.values()) r.net = r.income - r.spending;
  return [...byMonth.values()];
}

export interface CategoryTotal {
  category: string;
  total: number; // positive = spent (expense) or earned (income)
  count: number;
}

export function byCategory(txns: ScopedTxn[], range: [string, string], group: "income" | "expense"): CategoryTotal[] {
  const m = new Map<string, CategoryTotal>();
  for (const t of txns) {
    if (t.kind !== "flow" || !inRange(t, range)) continue;
    const isIncome = isIncomeCategory(t.category);
    if (group === "income" ? !isIncome : !isSpendCategory(t.category)) continue;
    const key = t.category ?? "uncategorised";
    const row = m.get(key) ?? { category: key, total: 0, count: 0 };
    row.total += (isIncome ? 1 : -1) * t.amount * t.share;
    row.count++;
    m.set(key, row);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

export interface Totals {
  income: number;
  spending: number;
  net: number;
  savingsRate: number | null;
  investmentIncome: number;
  contributions: number;
}

export function totals(rows: MonthFlow[]): Totals {
  const income = rows.reduce((s, r) => s + r.income, 0);
  const spending = rows.reduce((s, r) => s + r.spending, 0);
  return {
    income,
    spending,
    net: income - spending,
    savingsRate: income > 0 ? (income - spending) / income : null,
    investmentIncome: rows.reduce((s, r) => s + r.investmentIncome, 0),
    contributions: rows.reduce((s, r) => s + r.contributions, 0),
  };
}

/** Monthly sums split by a key (e.g. per card, per holding). Series sorted by absolute total. */
export function monthlyBy<T extends { date: string }>(
  rows: T[],
  range: [string, string],
  key: (r: T) => string,
  value: (r: T) => number,
): { months: string[]; series: { key: string; values: number[]; total: number }[] } {
  const ms = months(range);
  const idx = new Map(ms.map((m, i) => [m, i]));
  const by = new Map<string, number[]>();
  for (const r of rows) {
    const i = idx.get(monthOf(r.date));
    if (i === undefined || !inRange(r, range)) continue;
    const k = key(r);
    const arr = by.get(k) ?? by.set(k, new Array<number>(ms.length).fill(0)).get(k)!;
    arr[i]! += value(r);
  }
  const series = [...by.entries()].map(([k, values]) => ({ key: k, values, total: values.reduce((s, v) => s + v, 0) }));
  return { months: ms, series: series.sort((a, b) => Math.abs(b.total) - Math.abs(a.total)) };
}

// Generic banking words at the start of a description that say nothing about who was paid.
const GENERIC_PREFIX = /^(?:DEPOSIT|WITHDRAWAL|MISC\.? PAYMENT|POINT OF SALE (?:PURCHASE|REFUND)|DEBIT(?: CARD)?(?: PURCHASE)?|PURCHASE|BILL PAYMENT|PRE-AUTHORIZED(?: DEBIT)?|PAD|MB-|PC-|INTERAC(?: PURCHASE)?|OPOS|POS)\s+/i;

/**
 * Merchant-ish key from a description, used for grouping and rules: generic banking prefixes and
 * reference numbers are dropped ("DEPOSIT 0012345 ACME CORP" → "ACME CORP"), and the text is cut
 * at the first store/reference number ("LOBLAWS #1042 TORONTO" → "LOBLAWS").
 */
export function merchantKey(description: string): string {
  let s = description.toUpperCase().replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) s = s.replace(GENERIC_PREFIX, "");
  const tokens = s.split(" ");
  while (tokens.length && /\d{2,}/.test(tokens[0]!)) tokens.shift(); // leading reference numbers
  const head = tokens.join(" ").split(/[#*]|\s\S*\d{2,}/)[0]!.replace(/[,.\-–]+$/, "").trim();
  if (head.length >= 3) return head.slice(0, 40);
  const fallback = description.trim().slice(0, 40);
  return fallback.toUpperCase();
}
