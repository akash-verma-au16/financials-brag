import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { StatementAccount, StatementAccountMeta, StatementBundle, StatementTxn } from "../src/data/statement-types.ts";
import { mergeFiles, parseCsv } from "./parse-core.ts";
import { parsePdf } from "./pdf-profiles.ts";

/**
 * Parses statements/<account-folder>/{account.yaml, *.csv, *.pdf} into transactions.
 * Folder reading runs in Node (dev server and CI build); the parsers themselves (parse-core.ts,
 * pdf-profiles.ts) also run in the browser to check uploads before they're saved.
 *
 * CSV: header row detected by column names (date / description / amount or debit+credit);
 *      headerless CIBC-style files (date, description, debit, credit[, card]) are supported.
 * PDF: text lines that start with a date and end with an amount (credit-card style), or end with
 *      amount + running balance (bank-account style, sign taken from the balance change).
 *      PDF layouts vary by bank — check the per-file counts on the Data page.
 * Ledger folders (`ledger: yearly`) hold <YYYY>.csv masters; exports in them are merged first
 * by tools/ledger.ts (the server does that before parsing).
 */

export async function parseStatementsDir(dir: string): Promise<StatementBundle> {
  const bundle: StatementBundle = { accounts: [], errors: [] };
  const folders = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const f of folders) {
    if (!f.isDirectory() || f.name.startsWith(".")) continue;
    const folder = join(dir, f.name);
    let meta: StatementAccountMeta;
    try {
      meta = normaliseMeta(parseYaml(await readFile(join(folder, "account.yaml"), "utf8")));
    } catch (e) {
      bundle.errors.push(`${f.name}: missing or invalid account.yaml (${(e as Error).message})`);
      continue;
    }
    const account: StatementAccount = { folder: f.name, meta, txns: [], files: [] };
    const perFile: StatementTxn[][] = [];
    let latest: { date: string; balance: number } | undefined;
    for (const file of await listStatementFiles(folder)) {
      const rel = `${f.name}/${file}`;
      try {
        const buf = await readFile(join(folder, file));
        if (file.toLowerCase().endsWith(".pdf")) {
          const r = await parsePdf(buf, meta, rel);
          perFile.push(r.txns);
          account.files.push({ file: rel, parsed: r.txns.length, format: r.format, check: r.check, period: r.period });
          if (r.last4 && !account.detectedLast4) account.detectedLast4 = r.last4;
          if (r.closingBalance !== undefined && r.period && (!latest || r.period[1] > latest.date)) latest = { date: r.period[1], balance: r.closingBalance };
        } else {
          const txns = parseCsv(buf.toString("utf8"), meta, rel);
          perFile.push(txns);
          account.files.push({ file: rel, parsed: txns.length, format: "csv" });
        }
      } catch (e) {
        account.files.push({ file: rel, parsed: 0, error: (e as Error).message });
      }
    }
    if (latest) account.latestBalance = latest;
    account.txns = mergeFiles(perFile).sort((a, b) => b.date.localeCompare(a.date));
    bundle.accounts.push(account);
  }
  return bundle;
}

function normaliseMeta(raw: unknown): StatementAccountMeta {
  const m = (raw ?? {}) as Record<string, unknown>;
  if (typeof m.institution !== "string" || typeof m.type !== "string") throw new Error("institution and type are required");
  return {
    institution: m.institution,
    type: m.type.toLowerCase(),
    name: typeof m.name === "string" ? m.name : undefined,
    last4: m.last4 !== undefined && m.last4 !== null ? String(m.last4).padStart(4, "0").slice(-4) : undefined,
    balance: typeof m.balance === "number" ? m.balance : undefined,
    balanceDate: typeof m.balance_date === "string" ? m.balance_date : undefined,
    flipSign: m.flip_sign === true,
    dateFormat: m.date_format === "DMY" || m.date_format === "YMD" ? m.date_format : "MDY",
    openingBalance: typeof m.opening_balance === "number" ? m.opening_balance : undefined,
    ledger: m.ledger === "yearly" ? "yearly" : undefined,
    pending: m.pending === true || undefined,
  };
}

/** Statement files in an account folder, including year sub-folders; "_"-prefixed folders are skipped. */
async function listStatementFiles(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(join(dir, prefix), { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name.startsWith("_")) continue;
    if (e.isDirectory()) out.push(...(await listStatementFiles(dir, `${prefix}${e.name}/`)));
    else if (/\.(csv|pdf)$/i.test(e.name)) out.push(`${prefix}${e.name}`);
  }
  return out.sort();
}

export { csvRows, mergeFiles, parseAmount, parseCsv, parseDate } from "./parse-core.ts";
export { parsePdfLines } from "./pdf-profiles.ts";
