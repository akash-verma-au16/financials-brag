import type { CellValue } from "@/lib/sheets";
import { detectHeaderRow } from "@/lib/inspect";

/** A sheet tab read by header name, so column order in the export doesn't matter. */
export interface Table {
  headers: string[];
  rows: CellValue[][];
  has(header: string): boolean;
  str(row: CellValue[], header: string): string;
  num(row: CellValue[], header: string): number | null;
}

const norm = (h: string) => h.trim().toLowerCase();

export function toTable(raw: CellValue[][]): Table {
  const headerIdx = detectHeaderRow(raw);
  const headers = (raw[headerIdx] ?? []).map((h) => String(h ?? ""));
  const index = new Map(headers.map((h, i) => [norm(h), i]));
  const rows = raw.slice(headerIdx + 1).filter((r) => r.some((v) => v !== "" && v !== null && v !== undefined));
  const cell = (row: CellValue[], header: string) => {
    const i = index.get(norm(header));
    return i === undefined ? undefined : row[i];
  };
  return {
    headers,
    rows,
    has: (h) => index.has(norm(h)),
    str: (row, h) => {
      const v = cell(row, h);
      return v === undefined || v === null ? "" : String(v).trim();
    },
    num: (row, h) => {
      const v = cell(row, h);
      if (typeof v === "number") return Number.isFinite(v) ? v : null;
      if (typeof v !== "string" || v.trim() === "") return null;
      const n = Number(v.replace(/[$,\s]/g, ""));
      return Number.isFinite(n) ? n : null;
    },
  };
}

export type ExportKind = "balances" | "positions" | "transactions";

/** Identifies a Wealthica export from its headers. */
export function detectKind(t: Table): ExportKind | null {
  if (t.has("trade date") && t.has("type") && t.has("currency amount")) return "transactions";
  if (t.has("market value") && t.has("account number")) return "positions";
  if (t.has("balance") && t.has("account number") && t.has("account type")) return "balances";
  return null;
}
