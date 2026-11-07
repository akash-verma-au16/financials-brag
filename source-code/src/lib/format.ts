/** Number/date formatting. One place, so locale and currency rules stay consistent. */

const LOCALE = "en-CA";

const money0 = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyCompact = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "CAD", notation: "compact", maximumFractionDigits: 1 });
const pct1 = new Intl.NumberFormat(LOCALE, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 4 });

export type MoneyStyle = "whole" | "cents" | "compact";

export function formatMoney(x: number, style: MoneyStyle = "whole"): string {
  // Avoid "-$0" for tiny negatives.
  const v = Math.abs(x) < (style === "cents" ? 0.005 : 0.5) ? 0 : x;
  return (style === "cents" ? money2 : style === "compact" ? moneyCompact : money0).format(v);
}

export const formatPct = (x: number) => pct1.format(x);
export const formatNumber = (x: number) => num.format(x);

const dateFmt = new Intl.DateTimeFormat(LOCALE, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat(LOCALE, { year: "numeric", month: "short", timeZone: "UTC" });

export const formatDate = (iso: string) => (iso ? dateFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : "—");
export const formatMonth = (yyyyMm: string) => monthFmt.format(new Date(`${yyyyMm}-01T00:00:00Z`));

/** Whole days between two ISO dates (b − a). */
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
