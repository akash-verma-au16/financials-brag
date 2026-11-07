import { formatMonth } from "@/lib/format";

/**
 * Month selections ("YYYY-MM" strings, any set of months — not necessarily contiguous) and the
 * month-level projections used by the Spending pages.
 */

export function addMonths(m: string, n: number): string {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Every month from `a` to `b` inclusive (either order). */
export function monthsBetween(a: string, b: string): string[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export const lastDayOf = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
export const daysIn = (m: string) => Number(lastDayOf(m).slice(8, 10));

export const sortMonths = (sel: Iterable<string>) => [...new Set(sel)].sort();

/** [first day, last day] covering a selection. */
export function spanOf(sel: string[]): [string, string] {
  const s = sortMonths(sel);
  return s.length ? [`${s[0]}-01`, lastDayOf(s.at(-1)!)] : ["", ""];
}

/** Number of calendar months from the first to the last selected month. */
export const spanLength = (sel: string[]) => (sel.length ? monthsBetween(sortMonths(sel)[0]!, sortMonths(sel).at(-1)!).length : 0);

/** The same shape of selection moved back by its own span (Mar–May → Dec–Feb; one month → the month before). */
export function previousMonths(sel: string[]): string[] {
  const n = spanLength(sel);
  return sortMonths(sel.map((m) => addMonths(m, -n)));
}

export const yearEarlier = (sel: string[]) => sortMonths(sel.map((m) => addMonths(m, -12)));

/** Move a selection by `n` of its own spans (‹ / › buttons). */
export const shiftMonths = (sel: string[], n: number) => sortMonths(sel.map((m) => addMonths(m, n * spanLength(sel))));

/** Human label: "Oct 2026", "Jan – Mar 2026", "2025", "Nov 2025 – Feb 2026", "3 months in 2025–2026". */
export function describeMonths(sel: string[]): string {
  const s = sortMonths(sel);
  if (!s.length) return "No months selected";
  const [first, last] = [s[0]!, s.at(-1)!];
  const contiguous = s.length === spanLength(s);
  const y1 = first.slice(0, 4);
  const y2 = last.slice(0, 4);
  if (s.length === 1) return formatMonth(first);
  if (contiguous) {
    if (y1 === y2 && first.endsWith("-01") && last.endsWith("-12")) return y1;
    if (first.endsWith("-01") && last.endsWith("-12")) return `${y1} – ${y2}`;
    if (y1 === y2) return `${formatMonth(first).split(" ")[0]} – ${formatMonth(last)}`;
    return `${formatMonth(first)} – ${formatMonth(last)}`;
  }
  return `${s.length} months in ${y1 === y2 ? y1 : `${y1}–${y2}`}`;
}

/** The last `n` complete months before `today`'s month. */
export const lastFullMonths = (today: string, n: number) => monthsBetween(addMonths(today.slice(0, 7), -n), addMonths(today.slice(0, 7), -1));

// ── Projections ───────────────────────────────────────────────────────────────

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/**
 * Expected total for `month`, from complete months before `asOf` (the current month):
 * the average of the trailing 6-month average and the same month a year earlier (seasonality:
 * December, insurance renewals, travel), or just the trailing average without last year.
 */
export function expectedMonth(history: Map<string, number>, month: string, asOf: string): number {
  const trailing = monthsBetween(addMonths(asOf, -6), addMonths(asOf, -1)).filter((m) => history.has(m)).map((m) => history.get(m)!);
  const base = mean(trailing);
  const ly = history.get(addMonths(month, -12));
  return ly === undefined || !trailing.length ? (trailing.length ? base : (ly ?? 0)) : (base + ly) / 2;
}

/** The current month: what's been spent so far plus the expected amount for the days left. */
export function monthPace(spentSoFar: number, expected: number, today: string): number {
  const m = today.slice(0, 7);
  const left = Math.max(0, daysIn(m) - Number(today.slice(8, 10))) / daysIn(m);
  return spentSoFar + expected * left;
}

/**
 * Projected per-month totals for a whole calendar year: actual for complete months, pace for the
 * current month, expected for the rest. `null` for months with neither (before any history).
 */
export function projectYear(history: Map<string, number>, year: number, today: string): { month: string; value: number; projected: boolean }[] {
  const now = today.slice(0, 7);
  return monthsBetween(`${year}-01`, `${year}-12`).map((m) => {
    if (m < now) return { month: m, value: history.get(m) ?? 0, projected: false };
    const expected = expectedMonth(history, m, now);
    if (m === now) return { month: m, value: monthPace(history.get(m) ?? 0, expected, today), projected: true };
    return { month: m, value: expected, projected: true };
  });
}
