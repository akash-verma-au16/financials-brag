import type { StatementAccountMeta, StatementTxn } from "../src/data/statement-types.ts";

/**
 * Statement parsing that runs anywhere (Node and the browser): dates, amounts, CSV, merging.
 * Node-only parts (reading folders, YAML) live in statements.ts.
 */

/**
 * Combines files that may overlap (e.g. a yearly CSV and monthly PDFs). A row repeated across
 * files is kept once, but genuine repeats within one file (two identical coffees) are all kept:
 * for each date+amount+description we keep the highest count seen in any single file.
 */
export function mergeFiles(files: StatementTxn[][]): StatementTxn[] {
  const kept = new Map<string, StatementTxn[]>();
  for (const txns of files) {
    const local = new Map<string, StatementTxn[]>();
    for (const t of txns) {
      const k = `${t.date}|${t.amount.toFixed(2)}|${t.description.toUpperCase().replace(/\s+/g, " ")}`;
      (local.get(k) ?? local.set(k, []).get(k)!).push(t);
    }
    for (const [k, rows] of local) if (rows.length > (kept.get(k)?.length ?? 0)) kept.set(k, rows);
  }
  return [...kept.values()].flat();
}

// ── Dates & amounts ───────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

export function parseDate(s: string, order: StatementAccountMeta["dateFormat"] = "MDY", fallbackYear?: number): string | null {
  const t = s.trim().replace(/\./g, "");
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2]!)}-${pad(+m[3]!)}`;
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    let [a, b] = [+m[1]!, +m[2]!];
    const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    if (order === "DMY" || a > 12) [a, b] = [b, a];
    return a >= 1 && a <= 12 && b >= 1 && b <= 31 ? `${y}-${pad(a)}-${pad(b)}` : null;
  }
  m = t.match(/^(\d{1,2})\/(\d{1,2})$/); // 09/12 (year from the statement)
  if (m && fallbackYear) {
    let [a, b] = [+m[1]!, +m[2]!];
    if (order === "DMY" || a > 12) [a, b] = [b, a];
    return a >= 1 && a <= 12 && b >= 1 && b <= 31 ? `${fallbackYear}-${pad(a)}-${pad(b)}` : null;
  }
  m = t.match(/^([A-Za-z]{3,4})[a-z]*\s+(\d{1,2})(?:,?\s+(\d{4}))?$/); // Sep 12[, 2026]
  if (m && MONTHS[m[1]!.toLowerCase()]) {
    const y = m[3] ? +m[3] : fallbackYear;
    return y ? `${y}-${pad(MONTHS[m[1]!.toLowerCase()]!)}-${pad(+m[2]!)}` : null;
  }
  m = t.match(/^(\d{1,2})[\s-]([A-Za-z]{3,4})[a-z]*(?:[\s-](\d{2,4}))?$/); // 12 Sep [2026] / 12-Sep-26
  if (m && MONTHS[m[2]!.toLowerCase()]) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : fallbackYear;
    return y ? `${y}-${pad(MONTHS[m[2]!.toLowerCase()]!)}-${pad(+m[1]!)}` : null;
  }
  return null;
}

export function parseAmount(s: string | undefined): number | null {
  if (s === undefined) return null;
  let t = s.trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/CR$/i.test(t)) { neg = !neg; t = t.replace(/CR$/i, ""); }
  if (t.endsWith("-")) { neg = !neg; t = t.slice(0, -1); }
  t = t.replace(/[$,\s]|CAD/gi, "");
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1); }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const v = Number(t);
  return neg ? -v : v;
}

// ── CSV ───────────────────────────────────────────────────────────────────────

export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const H = {
  date: /^(transaction date|trans(\.|action)? ?date|date|posted date|posting date|date posted)$/i,
  desc: /^(description( ?1| ?2)?|merchant|payee|details|memo|transaction details|name)$/i,
  amount: /^(amount|cad\$|amount \(cad\)|cad|transaction amount)$/i,
  debit: /^(debit|debits|withdrawals?|money out|charges?|amount debited)$/i,
  credit: /^(credit|credits|deposits?|money in|payments?|amount credited)$/i,
};

/** Header cell as matched against H: trimmed, "transaction_date" read as "transaction date". */
const headerText = (c: string) => c.trim().replace(/_+/g, " ");

export function parseCsv(text: string, meta: StatementAccountMeta, file: string): StatementTxn[] {
  const rows = csvRows(text.replace(/^ï»¿/, ""));
  const headerIdx = rows.findIndex((r) => r.some((c) => H.date.test(headerText(c))) && r.some((c) => H.amount.test(headerText(c)) || H.debit.test(headerText(c))));
  const out: StatementTxn[] = [];
  const sign = meta.flipSign ? -1 : 1;
  const push = (date: string | null, description: string, amount: number | null) => {
    if (date && amount !== null && amount !== 0) out.push({ date, description: description.replace(/\s+/g, " ").trim(), amount: Math.round(sign * amount * 100) / 100, file });
  };

  if (headerIdx >= 0) {
    const h = rows[headerIdx]!.map(headerText);
    const dateCols = h.map((c, i) => (H.date.test(c) ? i : -1)).filter((i) => i >= 0);
    const dateCol = dateCols.find((i) => /trans/i.test(h[i]!)) ?? dateCols[0]!;
    const descCols = h.map((c, i) => (H.desc.test(c) ? i : -1)).filter((i) => i >= 0);
    const amountCol = h.findIndex((c) => H.amount.test(c));
    const debitCol = h.findIndex((c) => H.debit.test(c));
    const creditCol = h.findIndex((c) => H.credit.test(c));
    for (const r of rows.slice(headerIdx + 1)) {
      const description = descCols.map((i) => r[i] ?? "").filter(Boolean).join(" ");
      const amount = amountCol >= 0 ? parseAmount(r[amountCol]) : (parseAmount(r[creditCol]) ?? 0) - (parseAmount(r[debitCol]) ?? 0);
      push(parseDate(r[dateCol] ?? "", meta.dateFormat), description, amount);
    }
    return out;
  }

  // Headerless: date, description, debit, credit[, card] (CIBC), or date, description, amount.
  for (const r of rows) {
    const date = parseDate(r[0] ?? "", meta.dateFormat);
    if (!date) continue;
    if (r.length >= 4) push(date, r[1] ?? "", (parseAmount(r[3]) ?? 0) - (parseAmount(r[2]) ?? 0));
    else push(date, r[1] ?? "", parseAmount(r[2]));
  }
  return out;
}
