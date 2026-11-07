import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { LedgerFileResult } from "../src/data/statement-types.ts";
import { csvRows, parseDate } from "./parse-core.ts";

/**
 * Yearly CSV ledgers: for accounts whose bank only offers "everything so far" CSV exports
 * (e.g. the Wealthsimple credit card), the folder keeps one master file per year, <YYYY>.csv.
 * Any other CSV dropped into the folder (or uploaded from the app) is an export: its rows are
 * merged into the masters, then the export is deleted.
 *
 * Merging never changes what a master already holds. Per year, with the master's last date D:
 *   - rows dated before D are already covered and are skipped;
 *   - rows dated D are matched one-for-one (so two identical purchases that day stay two);
 *   - rows dated after D are added.
 * Rows that aren't settled yet (status "Pending" etc.) are skipped; the next export brings them.
 * Opt in with `ledger: yearly` in the folder's account.yaml.
 */

export type { LedgerFileResult };
type LedgerYearResult = LedgerFileResult["years"][number];

export interface LedgerMergeResult extends Pick<LedgerFileResult, "years" | "pending" | "unreadable"> {
  /** Changed or new masters: year → full CSV text. */
  masters: Map<string, string>;
}

const MASTER = /^(\d{4})\.csv$/;
export const isLedgerMaster = (name: string) => MASTER.test(name);

const norm = (h: string) => h.trim().toLowerCase().replace(/[_\s]+/g, " ");
const DATE = /^(transaction date|trans date|date|posted date|posting date)$/;
const SETTLED = /^(completed|complete|posted|settled|cleared)$/i;

interface Sheet {
  header: string[];
  rows: string[][];
}

function readSheet(text: string): Sheet | null {
  const rows = csvRows(text.replace(/^﻿/, ""));
  if (!rows.length) return null;
  return { header: rows[0]!.map((h) => h.trim()), rows: rows.slice(1) };
}

const col = (header: string[], test: RegExp | string) =>
  header.findIndex((h) => (typeof test === "string" ? norm(h) === test : test.test(norm(h))));

/** Identity of a row for same-day matching: every column, by name, normalised. */
const keyOf = (header: string[], row: string[]) =>
  header.map((h, i) => `${norm(h)}=${(row[i] ?? "").trim().toUpperCase().replace(/\s+/g, " ")}`).sort().join("|");

const quote = (s: string) => (/[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s);
const toCsv = (s: Sheet) => [s.header, ...s.rows].map((r) => r.map((c) => quote(c ?? "")).join(",")).join("\n") + "\n";

/** Merges one export into the yearly masters (given as year → CSV text). Pure. */
export function mergeLedger(masters: Map<string, string>, exportText: string): LedgerMergeResult {
  const incoming = readSheet(exportText);
  if (!incoming) throw new Error("The CSV is empty.");
  const dateCol = col(incoming.header, DATE);
  if (dateCol < 0) throw new Error("No date column in the CSV header.");
  const statusCol = col(incoming.header, "status");

  const out: LedgerMergeResult = { masters: new Map(), years: [], pending: 0, unreadable: 0 };
  const byYear = new Map<string, { date: string; row: string[] }[]>();
  for (const row of incoming.rows) {
    if (statusCol >= 0 && (row[statusCol] ?? "").trim() && !SETTLED.test((row[statusCol] ?? "").trim())) {
      out.pending++;
      continue;
    }
    const date = parseDate(row[dateCol] ?? "", "YMD");
    if (!date) {
      out.unreadable++;
      continue;
    }
    const y = date.slice(0, 4);
    (byYear.get(y) ?? byYear.set(y, []).get(y)!).push({ date, row });
  }

  for (const [year, rows] of [...byYear].sort(([a], [b]) => a.localeCompare(b))) {
    const prev = masters.has(year) ? readSheet(masters.get(year)!) : null;
    // The master's columns win; columns new in the export are appended.
    const header = prev ? [...prev.header] : [...incoming.header];
    for (const h of incoming.header) if (col(header, norm(h)) < 0) header.push(h);
    const align = (from: string[], row: string[]) => header.map((h) => row[col(from, norm(h))] ?? "");
    const master: Sheet = { header, rows: prev ? prev.rows.map((r) => align(prev.header, r)) : [] };
    const mDate = col(header, DATE);

    const masterDates = master.rows.map((r) => parseDate(r[mDate] ?? "", "YMD") ?? "");
    const last = masterDates.reduce((a, b) => (b > a ? b : a), "");
    const onLast = new Map<string, number>();
    master.rows.forEach((r, i) => {
      if (masterDates[i] === last) onLast.set(keyOf(header, r), (onLast.get(keyOf(header, r)) ?? 0) + 1);
    });
    const older = new Set(master.rows.filter((_, i) => masterDates[i]! < last).map((r) => keyOf(header, r)));

    const res: LedgerYearResult = { year, added: 0, alreadyThere: 0, olderSkipped: 0 };
    const added: { date: string; row: string[] }[] = [];
    for (const { date, row } of rows) {
      const aligned = align(incoming.header, row);
      const k = keyOf(header, aligned);
      if (last && date < last) {
        if (older.has(k)) res.alreadyThere++;
        else res.olderSkipped++;
      } else if (date === last && (onLast.get(k) ?? 0) > 0) {
        onLast.set(k, onLast.get(k)! - 1);
        res.alreadyThere++;
      } else {
        added.push({ date, row: aligned });
        res.added++;
      }
    }
    out.years.push(res);
    if (!res.added && prev && prev.header.length === header.length) continue;

    // Oldest first; the master's own order is kept within a day, new rows go after it.
    const all = [...master.rows.map((row, i) => ({ date: masterDates[i]!, row })), ...added.sort((a, b) => a.date.localeCompare(b.date))];
    all.sort((a, b) => a.date.localeCompare(b.date));
    out.masters.set(year, toCsv({ header, rows: all.map((x) => x.row) }));
  }
  return out;
}

// ── Folders ───────────────────────────────────────────────────────────────────

/** Is this statements folder a yearly ledger (account.yaml has `ledger: yearly`)? */
export async function isLedgerFolder(folder: string): Promise<boolean> {
  try {
    const meta = parseYaml(await readFile(join(folder, "account.yaml"), "utf8")) as { ledger?: unknown } | null;
    return meta?.ledger === "yearly";
  } catch {
    return false;
  }
}

/**
 * Merges every export sitting in a ledger folder into its yearly masters and deletes it.
 * `dir` is the statements folder; `only` limits it to one account folder.
 */
export async function consolidateLedgers(dir: string, only?: string): Promise<LedgerFileResult[]> {
  const results: LedgerFileResult[] = [];
  const folders = (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory() && !e.name.startsWith(".") && (!only || e.name === only));
  for (const f of folders) {
    const folder = join(dir, f.name);
    if (!(await isLedgerFolder(folder))) continue;
    const names = (await readdir(folder)).filter((n) => /\.csv$/i.test(n)).sort();
    const exports = names.filter((n) => !isLedgerMaster(n));
    for (const file of exports) {
      const rel = (n: string) => `statements/${f.name}/${n}`;
      const masters = new Map<string, string>();
      for (const n of (await readdir(folder)).filter(isLedgerMaster)) masters.set(n.slice(0, 4), await readFile(join(folder, n), "utf8"));
      try {
        const r = mergeLedger(masters, await readFile(join(folder, file), "utf8"));
        const changed: string[] = [];
        for (const [year, text] of r.masters) {
          await writeFile(join(folder, `${year}.csv`), text);
          changed.push(rel(`${year}.csv`));
        }
        await rm(join(folder, file));
        changed.push(rel(file));
        results.push({ folder: f.name, file, years: r.years, pending: r.pending, unreadable: r.unreadable, changed });
      } catch (e) {
        // Left in place so nothing is lost; the Data page lists it with the error.
        results.push({ folder: f.name, file, years: [], pending: 0, unreadable: 0, changed: [], error: (e as Error).message });
      }
    }
  }
  return results;
}
