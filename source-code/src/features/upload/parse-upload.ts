import type { LedgerFileResult, StatementAccount, StatementAccountMeta, StatementTxn } from "@/data/statement-types";
import { parseCsv } from "../../../tools/parse-core.ts";
import { PROFILE_ACCOUNT, linesOf, parseLines, type PdfDoc, type PdfResult } from "../../../tools/pdf-profiles.ts";

/**
 * Reads an uploaded statement in the browser with the same parsers the build uses, so you see
 * what it contains (layout, period, card digits, transactions, total check) before it's saved,
 * and it can be routed to the right account folder automatically.
 */

export interface Parsed {
  kind: "pdf" | "csv";
  format?: string;
  period?: [string, string];
  last4?: string;
  check?: string;
  txns: StatementTxn[];
  error?: string;
}

let pdfjsReady: Promise<typeof import("pdfjs-dist")> | null = null;
function pdfjs() {
  pdfjsReady ??= (async () => {
    const [lib, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  })();
  return pdfjsReady;
}

const GENERIC: StatementAccountMeta = { institution: "", type: "" };

export async function parseUpload(file: File, meta: StatementAccountMeta = GENERIC): Promise<Parsed> {
  try {
    if (/\.csv$/i.test(file.name)) {
      const text = await file.text();
      const txns = parseCsv(text, meta, file.name);
      return { kind: "csv", format: csvFormat(text), txns, error: txns.length ? undefined : "No transactions recognised in this CSV." };
    }
    if (!/\.pdf$/i.test(file.name)) return { kind: "pdf", txns: [], error: "Only PDF and CSV statements are supported." };
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const r: PdfResult = parseLines(await linesOf(doc as unknown as PdfDoc), meta, file.name);
    return { kind: "pdf", format: r.format, period: r.period, last4: r.last4, check: r.check, txns: r.txns, error: r.txns.length ? undefined : "No transactions recognised." };
  } catch (e) {
    return { kind: "pdf", txns: [], error: (e as Error).message };
  }
}

/** Wealthsimple's credit card export has its own header; anything else is a plain bank CSV. */
const WS_CARD_HEADER = /^\s*transaction_date,transaction_type,status,merchant,amount/i; // \s also skips a byte-order mark
const csvFormat = (text: string) => (WS_CARD_HEADER.test(text) ? "wealthsimple-card-csv" : "csv");

const BANK_TYPES = new Set(["chequing", "savings", "bank", "cash"]);

/**
 * The account folder a parsed statement belongs to: same card/account digits first, then the
 * only folder for that bank and product (credit card vs bank account).
 */
export function guessFolder(p: Parsed, accounts: StatementAccount[], fileName: string): string | null {
  const last4 = (a: StatementAccount) => a.meta.last4 ?? a.detectedLast4;
  if (p.last4) {
    const hit = accounts.find((a) => last4(a) === p.last4);
    if (hit) return hit.folder;
  }
  const want = p.format === "wealthsimple-card-csv" ? { institution: "Wealthsimple", type: "credit" } : p.format ? PROFILE_ACCOUNT[p.format] : undefined;
  if (want) {
    const same = accounts.filter(
      (a) => a.meta.institution.toLowerCase().startsWith(want.institution.toLowerCase().slice(0, 4)) && (want.type === "credit" ? a.meta.type === "credit" : BANK_TYPES.has(a.meta.type)),
    );
    if (same.length === 1) return same[0]!.folder;
  }
  // Last resort: the file name mentions a folder name.
  const n = fileName.toLowerCase();
  return accounts.find((a) => n.includes(a.folder.toLowerCase()))?.folder ?? null;
}

/** Statement month ("YYYY-MM"): the statement's closing date, else the latest transaction, else the file name. */
export function guessMonth(p: Parsed, fileName: string): string | null {
  if (p.period) return p.period[1].slice(0, 7);
  const last = p.txns.map((t) => t.date).sort().at(-1);
  if (last) return last.slice(0, 7);
  const m = fileName.match(/(20\d{2})[-_. ]?(0[1-9]|1[0-2])/) ?? fileName.match(/(?:^|\D)(0?[1-9]|1[0-2])[-_](\d{2})(?:\D|$)/);
  if (!m) return null;
  return m[1]!.length === 4 ? `${m[1]}-${m[2]}` : `20${m[2]}-${m[1]!.padStart(2, "0")}`;
}

/** One line on what merging an export into a yearly ledger did, e.g. "2026.csv: 12 new, 40 already there". */
export function describeMerge(r: LedgerFileResult): string {
  if (r.error) return `${r.file}: not merged (${r.error}). It was kept in the folder.`;
  const years = r.years.map((y) => {
    const parts = [`${y.added} new`, `${y.alreadyThere} already there`];
    if (y.olderSkipped) parts.push(`${y.olderSkipped} older ${y.olderSkipped === 1 ? "row" : "rows"} not in the file left out`);
    return `${y.year}.csv: ${parts.join(", ")}`;
  });
  if (r.pending) years.push(`${r.pending} pending skipped (the next export brings them)`);
  return years.join(" · ") || "nothing to merge";
}

/** Where a file goes: statements/<folder>/<YYYY>/<YYYY-MM>.pdf (PDF), statements/<folder>/<name>.csv (CSV). */
export function targetPath(folder: string, month: string | null, file: File): string | null {
  if (/\.csv$/i.test(file.name)) return `statements/${folder}/${file.name.replace(/[^\w.-]+/g, "-")}`;
  return month ? `statements/${folder}/${month.slice(0, 4)}/${month}.pdf` : null;
}
