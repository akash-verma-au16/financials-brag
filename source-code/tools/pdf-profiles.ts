import type { StatementAccountMeta, StatementTxn } from "../src/data/statement-types.ts";
import { parseAmount, parseDate } from "./parse-core.ts";

/**
 * Statement PDFs → transactions. Each bank/product layout is a "profile", detected from the
 * statement text; unknown layouts fall back to a generic line reader. Profiles that can, also
 * cross-check their output against the statement's own totals (check = "ok" or what differs).
 *
 * Adding a bank: dump the masked layout with `node tools/pdf-structure.ts file.pdf`, write a
 * profile below, add it to PROFILES, and add a test with synthetic lines.
 */

export interface PdfLine {
  page: number;
  x: number;
  text: string;
  /** The text pieces with their x positions (for column-based layouts). */
  items?: { x: number; s: string }[];
}

export interface PdfResult {
  format: string;
  txns: StatementTxn[];
  period?: [string, string];
  last4?: string;
  closingBalance?: number;
  check?: string;
  /** Cents differences found by the check (for tools/check-statements.ts diagnostics only). */
  gaps?: { credits: number; debits: number };
}

interface Profile {
  id: string;
  matches(lines: PdfLine[]): boolean;
  parse(lines: PdfLine[], meta: StatementAccountMeta, file: string): PdfResult;
}

/** The bits of a pdf.js document we use (Node's legacy build and the browser build both fit). */
export interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>;
  destroy(): Promise<void>;
}

/** Node: text lines of a PDF (pdf.js legacy build). */
export async function pdfLines(buf: Uint8Array): Promise<PdfLine[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false }).promise;
  return linesOf(doc as unknown as PdfDoc);
}

/** Groups a document's text items into lines (top to bottom), keeping each piece's x position. */
export async function linesOf(doc: PdfDoc): Promise<PdfLine[]> {
  const lines: PdfLine[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const byY = new Map<number, { x: number; s: string }[]>();
    for (const raw of content.items) {
      const it = raw as { str?: string; transform?: number[] };
      if (typeof it.str !== "string" || !it.str.trim() || !it.transform) continue;
      const y = Math.round(it.transform[5]! / 2) * 2; // merge items within 2pt vertically
      (byY.get(y) ?? byY.set(y, []).get(y)!).push({ x: it.transform[4]!, s: it.str });
    }
    for (const y of [...byY.keys()].sort((a, b) => b - a)) {
      const items = byY.get(y)!.sort((a, b) => a.x - b.x);
      lines.push({
        page: p,
        x: Math.round(items[0]!.x),
        text: items.map((i) => i.s).join(" ").replace(/\s+/g, " ").trim(),
        items: items.map((i) => ({ x: Math.round(i.x), s: i.s.trim() })),
      });
    }
  }
  await doc.destroy();
  return lines;
}

export async function parsePdf(buf: Uint8Array, meta: StatementAccountMeta, file: string): Promise<PdfResult> {
  return parseLines(await pdfLines(buf), meta, file);
}

/** Picks the matching bank layout (or the generic reader) and parses. */
export function parseLines(lines: PdfLine[], meta: StatementAccountMeta, file: string): PdfResult {
  const profile = PROFILES.find((p) => p.matches(lines));
  if (profile) return profile.parse(lines, meta, file);
  return { format: "generic-pdf", txns: parsePdfLines(lines.map((l) => l.text), meta, file) };
}

/** Which bank and product a layout belongs to (for routing uploads to the right folder). */
export const PROFILE_ACCOUNT: Record<string, { institution: string; type: "credit" | "bank" }> = {
  "scotia-credit": { institution: "Scotiabank", type: "credit" },
  "scotia-bank": { institution: "Scotiabank", type: "bank" },
  "rbc-credit": { institution: "RBC", type: "credit" },
};

const MON: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");
const money = (s: string) => Number(s.replace(/[$,\s]/g, ""));
const cents = (x: number) => Math.round(x * 100);
const fmt = (x: number) => `$${(Math.abs(x) / 100).toFixed(2)}`;

// ── Scotiabank credit cards ───────────────────────────────────────────────────
//
// Transaction line:  REF#  Mon DD  Mon DD  DETAILS…  AMOUNT[-]     ("-" = payment/credit)
// Descriptions can wrap onto following indented lines. Year comes from "Statement Period".
// Totals on page 1: Previous balance, Payments/credits, Purchases/charges, Interest, New Balance.

// Greedy description, so the LAST amount on the line is taken; prose from the right-hand column
// that shares the row ("… 12.34 See back for details.") is allowed after it.
const SCOTIA_TXN = /^(\d{3})\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+(.+)\s+([\d,]+\.\d{2})\s*(-)?(?:\s+[A-Za-z][A-Za-z .,'()]*)?$/;
const SCOTIA_PERIOD = /Statement Period\s+([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})\s+-\s+([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})/;
const SCOTIA_ROW_START = /\b\d{3}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s/;
// Some older statements print only the end of the period on that line.
const SCOTIA_PERIOD_END = /Statement Period\s*-\s*([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})/;
const PHONE = /\b\d{3}-\d{3}-\d{4}\b/g;

export const scotiaCredit: Profile = {
  id: "scotia-credit",
  matches: (lines) =>
    lines.some((l) => /Scotiabank/i.test(l.text)) &&
    lines.some((l) => /REF\.#/.test(l.text)) &&
    lines.some((l) => SCOTIA_PERIOD.test(l.text) || SCOTIA_PERIOD_END.test(l.text)),
  parse(lines, meta, file) {
    let start: string;
    let end: string;
    const p = lines.map((l) => l.text.match(SCOTIA_PERIOD)).find(Boolean);
    if (p) {
      start = `${p[3]}-${pad(MON[p[1]!]!)}-${pad(+p[2]!)}`;
      end = `${p[6]}-${pad(MON[p[4]!]!)}-${pad(+p[5]!)}`;
    } else {
      const e = lines.map((l) => l.text.match(SCOTIA_PERIOD_END)).find(Boolean)!;
      end = `${e[3]}-${pad(MON[e[1]!]!)}-${pad(+e[2]!)}`;
      start = new Date(Date.parse(`${end}T00:00:00Z`) - 34 * 86_400_000).toISOString().slice(0, 10); // ~1 cycle back
    }
    // A "Mon DD" belongs to the start year if it falls on/after the period start, else the end year.
    const dateOf = (mon: string, day: string) => {
      const md = `${pad(MON[mon]!)}-${pad(+day)}`;
      return md >= start.slice(5) || start.slice(0, 4) === end.slice(0, 4) ? `${start.slice(0, 4)}-${md}` : `${end.slice(0, 4)}-${md}`;
    };

    const txns: StatementTxn[] = [];
    let open: StatementTxn | null = null;
    let openX = 0;
    for (const l of lines) {
      // Some rows share their line with a printing code in the left margin: start at the REF#.
      const at = l.text.search(SCOTIA_ROW_START);
      const text = at > 0 ? l.text.slice(at) : l.text;
      const m = text.match(SCOTIA_TXN);
      if (m && MON[m[2]!] && MON[m[4]!]) {
        const credit = m[8] === "-" || /-$/.test(m[7]!);
        const amount = money(m[7]!) * (credit ? 1 : -1); // card POV: purchases are money out
        open = { date: dateOf(m[2]!, m[3]!), description: m[6]!, amount: meta.flipSign ? -amount : amount, file };
        openX = at > 0 ? 80 : l.x;
        txns.push(open);
        continue;
      }
      // Wrapped description: indented further than the transaction line, short, not a header/footer.
      if (open && l.x > openX + 40 && l.text.length < 60 && !/REF\.#|TRANS\.|Continued|Statement|Page \d/i.test(l.text)) {
        open.description = `${open.description} ${l.text}`;
        continue;
      }
      open = null;
    }
    for (const t of txns) t.description = t.description.replace(PHONE, "").replace(/\s+/g, " ").trim();

    // Totals from the account summary, to check the parse.
    const find = (re: RegExp) => {
      for (const l of lines) {
        const m = l.text.match(re);
        if (m) return money(m[1]!);
      }
      return undefined;
    };
    const nb = lines.map((l) => l.text.match(/New Balance\s*=?\s*(-?)\$([\d,]+\.\d{2})\s*(CR)?/i)).find(Boolean);
    const newBalance = nb ? money(nb[2]!) * (nb[1] || nb[3] ? -1 : 1) : undefined; // CR / minus = credit balance
    const credits = find(/Payments\/credits\s*-?\s*\$([\d,]+\.\d{2})/i);
    const charges = find(/Purchases\/charges\s*\+?\s*\$([\d,]+\.\d{2})/i);
    // Optional summary items that may or may not be listed as separate transaction lines.
    const extras = [
      find(/^Interest\s*\+?\s*\$([\d,]+\.\d{2})/i),
      find(/^Fees\s*\+?\s*\$([\d,]+\.\d{2})/i),
      find(/^Cash advances\s*\+?\s*\$([\d,]+\.\d{2})/i),
    ].filter((x): x is number => x !== undefined && x > 0);

    const gotCredits = txns.filter((t) => t.amount > 0).reduce((s, t) => s + cents(t.amount), 0);
    const gotDebits = txns.filter((t) => t.amount < 0).reduce((s, t) => s - cents(t.amount), 0);
    const problems: string[] = [];
    if (credits !== undefined && gotCredits !== cents(credits)) problems.push(`credits differ by ${fmt(gotCredits - cents(credits))}`);
    if (charges !== undefined) {
      // Purchases/charges plus any combination of interest, fees and cash advances.
      const want = new Set<number>();
      for (let mask = 0; mask < 1 << extras.length; mask++)
        want.add(cents(charges) + extras.reduce((s, x, i) => s + (mask & (1 << i) ? cents(x) : 0), 0));
      if (!want.has(gotDebits)) problems.push(`charges differ by ${fmt(gotDebits - cents(charges))}`);
    }
    // Fallback: per-card SUB-TOTAL lines (credits marked "-"), the direct total of the table.
    const subs = lines.flatMap((l) => [...l.text.matchAll(/SUB-TOTAL.*?\$([\d,]+\.\d{2})\s*(-)?/g)]);
    if (problems.length && subs.length) {
      const subCredits = subs.filter((m) => m[2]).reduce((s, m) => s + cents(money(m[1]!)), 0);
      const subDebits = subs.filter((m) => !m[2]).reduce((s, m) => s + cents(money(m[1]!)), 0);
      if (gotCredits === subCredits && gotDebits === subDebits) problems.length = 0;
    }
    const last4 = lines.map((l) => l.text.match(/Account #\s*\d{4}\s+\S+\s+\S+\s+(\d{4})/)).find(Boolean)?.[1];
    return {
      format: "scotia-credit",
      txns,
      period: [start, end],
      last4,
      closingBalance: newBalance,
      gaps: { credits: credits === undefined ? 0 : gotCredits - cents(credits), debits: charges === undefined ? 0 : gotDebits - cents(charges) },
      check: credits === undefined && charges === undefined ? "no totals found" : problems.length ? problems.join("; ") : "ok",
    };
  },
};

// ── Scotiabank chequing / savings ("Your … account summary") ──────────────────
//
// Row:  Mon DD  DESCRIPTION  AMOUNT  BALANCE     (one amount, in the Withdrawn or Deposited column)
// The second description line ("Credit Card", payee…) sits indented below. Margin codes can be
// merged into a row. Direction comes from the running balance, cross-checked with the column.
// Summary: Opening Balance on <Month DD, YYYY>, total withdrawals, total deposits, Closing Balance.

const FULL_MON: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};
const BANK_ROW = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(.+?)\s+([\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s*$/;
const BANK_ROW_NO_BAL = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(.+?)\s+([\d,]+\.\d{2})()\s*$/;
const BAL_ON = (word: string) => new RegExp(`${word} Balance on ([A-Z][a-z]+) (\\d{1,2}), (\\d{4})\\s*\\$?(-?[\\d,]+\\.\\d{2})`);

export const scotiaBank: Profile = {
  id: "scotia-bank",
  matches: (lines) =>
    lines.some((l) => /total withdrawals/i.test(l.text)) &&
    lines.some((l) => /Balance \(\$\)/.test(l.text)) &&
    lines.some((l) => BAL_ON("Opening").test(l.text)),
  parse(lines, meta, file) {
    const o = lines.map((l) => l.text.match(BAL_ON("Opening"))).find(Boolean)!;
    const c = lines.map((l) => l.text.match(BAL_ON("Closing"))).find(Boolean);
    const start = `${o[3]}-${pad(FULL_MON[o[1]!]!)}-${pad(+o[2]!)}`;
    const end = c ? `${c[3]}-${pad(FULL_MON[c[1]!]!)}-${pad(+c[2]!)}` : start;
    const opening = money(o[4]!);
    const closing = c ? money(c[4]!) : undefined;
    const dateOf = (mon: string, d: string) => {
      const md = `${pad(MON[mon]!)}-${pad(+d)}`;
      return md >= start.slice(5) || start.slice(0, 4) === end.slice(0, 4) ? `${start.slice(0, 4)}-${md}` : `${end.slice(0, 4)}-${md}`;
    };

    // Column positions from the header row "Date | Transactions | Withdrawn ($) | Deposited ($) | Balance ($)".
    const header = lines.find((l) => /Balance \(\$\)/.test(l.text) && /Transactions/.test(l.text));
    const money$ = header?.items?.filter((i) => /\(\$\)/.test(i.s)) ?? [];
    const outX = money$[0]?.x;
    const inX = money$[1]?.x;

    const txns: StatementTxn[] = [];
    let balance = opening;
    let open: StatementTxn | null = null;
    let disagreements = 0;
    // The table ends where the right-hand sidebar begins; sidebar text can share a row's line.
    const balX = header?.items?.find((i) => /Balance \(\$\)/.test(i.s))?.x;
    const tableEnd = balX !== undefined ? balX + 50 : Infinity;
    for (const l of lines) {
      const tableText = l.items ? l.items.filter((i) => i.x < tableEnd).map((i) => i.s).join(" ").replace(/\s+/g, " ").trim() : l.text;
      // Rows carry the balance only on the last row of a day; earlier rows have just the amount.
      const m = tableText.match(BANK_ROW) ?? tableText.match(BANK_ROW_NO_BAL);
      if (m && !/Opening Balance|Closing Balance/.test(m[3]!)) {
        const amount = money(m[4]!);
        const newBalance = m[5] ? money(m[5]) : undefined;
        // Column of the amount (nearest header), as a cross-check.
        const amtItem = l.items?.filter((i) => i.s.replace(/\s/g, "") === m[4]).at(0) ?? l.items?.find((i) => i.s.includes(m[4]!));
        // Amounts are right-aligned under their heading: anything starting at/after the Deposited heading is a deposit.
        const byColumn = amtItem && outX !== undefined && inX !== undefined ? (amtItem.x >= inX ? 1 : -1) : 0;
        let byBalance = 0;
        if (newBalance !== undefined) {
          const diff = Math.round((newBalance - balance) * 100) / 100;
          byBalance = Math.abs(Math.abs(diff) - amount) < 0.005 ? Math.sign(diff) : 0;
        }
        const sign = byBalance || byColumn || -1;
        if (byBalance && byColumn && byBalance !== byColumn) disagreements++;
        balance = newBalance ?? Math.round((balance + sign * amount) * 100) / 100;
        const description = m[3]!.replace(/\|/g, " ").trim();
        open = { date: dateOf(m[1]!, m[2]!), description, amount: (meta.flipSign ? -1 : 1) * sign * amount, file };
        txns.push(open);
        continue;
      }
      // Second description line: indented (x ≈ 113), no amounts, not a header/footer.
      if (open && l.x >= 100 && l.x < 300 && !/[\d,]+\.\d{2}/.test(l.text) && !/continued|Page \d|Amounts|Balance \(\$\)/i.test(l.text)) {
        open.description = `${open.description} ${l.text}`;
        continue;
      }
      if (l.x < 60) continue; // margin codes don't end a row's description
      open = null;
    }
    for (const t of txns) t.description = t.description.replace(/\s+/g, " ").trim();

    const totalOut = lines.map((l) => l.text.match(/total withdrawals\s*\$?([\d,]+\.\d{2})/i)).find(Boolean);
    const totalIn = lines.map((l) => l.text.match(/total deposits\s*\$?([\d,]+\.\d{2})/i)).find(Boolean);
    const gotOut = txns.filter((t) => t.amount < 0).reduce((s, t) => s - cents(t.amount), 0);
    const gotIn = txns.filter((t) => t.amount > 0).reduce((s, t) => s + cents(t.amount), 0);
    const problems: string[] = [];
    if (totalOut && gotOut !== cents(money(totalOut[1]!))) problems.push(`withdrawals differ by ${fmt(gotOut - cents(money(totalOut[1]!)))}`);
    if (totalIn && gotIn !== cents(money(totalIn[1]!))) problems.push(`deposits differ by ${fmt(gotIn - cents(money(totalIn[1]!)))}`);
    if (closing !== undefined && cents(opening) + gotIn - gotOut !== cents(closing)) problems.push("balance doesn't roll forward");
    if (disagreements) problems.push(`${disagreements} row(s) where balance and column disagree`);

    const acct = lines.map((l) => l.text.match(/account number:?\s*\|?\s*\d{3,5}\s*\|?\s*([\d ]{6,})/i)).find(Boolean);
    const digits = acct?.[1]?.replace(/\D/g, "");
    return {
      format: "scotia-bank",
      txns,
      period: [start, end],
      last4: digits && digits.length >= 4 ? digits.slice(-4) : undefined,
      closingBalance: closing,
      gaps: { credits: totalIn ? gotIn - cents(money(totalIn[1]!)) : 0, debits: totalOut ? gotOut - cents(money(totalOut[1]!)) : 0 },
      check: !totalOut && !totalIn ? "no totals found" : problems.length ? problems.join("; ") : "ok",
    };
  },
};

// ── RBC credit cards ──────────────────────────────────────────────────────────
//
// Row:  MON DD  MON DD  DESCRIPTION  $AMOUNT  (credits: -$AMOUNT)
// Below each row: a 23-digit reference number, sometimes an extra description line.
// "STATEMENT FROM AUG 08 TO SEP 07, 2026" (start year implied). A right-hand sidebar (points,
// balance summary) shares lines with the table, so only the table area is read.
// Totals: Previous Account Balance, Payments & credits, Purchases & debits, Cash advances,
// Interest, Fees, NEW BALANCE.

const RBC_PERIOD = /STATEMENT FROM ([A-Z]{3}) (\d{1,2})(?:, (\d{4}))? TO ([A-Z]{3}) (\d{1,2}), (\d{4})/;
const RBC_ROW = /^([A-Z]{3}) (\d{1,2}) ([A-Z]{3}) (\d{1,2}) (.+?) (-?)\$([\d,]+\.\d{2})$/;
const UPPER_MON: Record<string, number> = Object.fromEntries(Object.entries(MON).map(([k, v]) => [k.toUpperCase(), v]));

export const rbcCredit: Profile = {
  id: "rbc-credit",
  matches: (lines) => lines.some((l) => RBC_PERIOD.test(l.text)) && lines.some((l) => /\bRBC\b/.test(l.text)),
  parse(lines, meta, file) {
    const p = lines.map((l) => l.text.match(RBC_PERIOD)).find(Boolean)!;
    const endYear = Number(p[6]);
    const sm = UPPER_MON[p[1]!]!;
    const em = UPPER_MON[p[4]!]!;
    const startYear = p[3] ? Number(p[3]) : sm > em ? endYear - 1 : endYear;
    const start = `${startYear}-${pad(sm)}-${pad(+p[2]!)}`;
    const end = `${endYear}-${pad(em)}-${pad(+p[5]!)}`;
    const dateOf = (mon: string, day: string) => `${UPPER_MON[mon]! >= sm && startYear !== endYear ? startYear : endYear}-${pad(UPPER_MON[mon]!)}-${pad(+day)}`;

    // Table columns end where the sidebar begins (x ≈ 390).
    const SIDEBAR_X = 380;
    const txns: StatementTxn[] = [];
    let open: StatementTxn | null = null;
    for (const l of lines) {
      const table = (l.items ?? [{ x: l.x, s: l.text }]).filter((i) => i.x < SIDEBAR_X);
      const text = table.map((i) => i.s).join(" ").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const m = text.match(RBC_ROW);
      if (m && UPPER_MON[m[1]!] && UPPER_MON[m[3]!]) {
        const amount = money(m[7]!) * (m[6] === "-" ? 1 : -1); // card POV: purchases out, credits in
        open = { date: dateOf(m[1]!, m[2]!), description: m[5]!, amount: meta.flipSign ? -amount : amount, file };
        txns.push(open);
        continue;
      }
      // Continuation under a row (x ≈ 128): skip the 23-digit reference, keep extra description text.
      if (open && l.x >= 110 && l.x < 300) {
        if (/^\d{15,}$/.test(text.replace(/\s/g, ""))) continue;
        if (!/\$[\d,]+\.\d{2}|TOTAL ACCOUNT BALANCE|continued/i.test(text)) open.description = `${open.description} ${text}`;
        continue;
      }
      open = null;
    }
    for (const t of txns) t.description = t.description.replace(/\s+/g, " ").trim();

    const find = (re: RegExp) => {
      for (const l of lines) {
        const m = l.text.match(re);
        if (m) return money(m[1]!);
      }
      return undefined;
    };
    const credits = find(/Payments & credits\s*-?\$([\d,]+\.\d{2})/i);
    const charges = find(/Purchases & debits\s*\$([\d,]+\.\d{2})/i);
    const extras = [find(/Cash advances\s*\$([\d,]+\.\d{2})/i), find(/(?:^|\s)Interest\s*\$([\d,]+\.\d{2})/i), find(/(?:^|\s)Fees\s*\$([\d,]+\.\d{2})/i)].filter(
      (x): x is number => x !== undefined && x > 0,
    );
    const newBalance = find(/NEW BALANCE\s*\$([\d,]+\.\d{2})/);
    const gotCredits = txns.filter((t) => t.amount > 0).reduce((s, t) => s + cents(t.amount), 0);
    const gotDebits = txns.filter((t) => t.amount < 0).reduce((s, t) => s - cents(t.amount), 0);
    const problems: string[] = [];
    if (credits !== undefined && gotCredits !== cents(credits)) problems.push(`credits differ by ${fmt(gotCredits - cents(credits))}`);
    if (charges !== undefined) {
      const want = new Set<number>();
      for (let mask = 0; mask < 1 << extras.length; mask++)
        want.add(cents(charges) + extras.reduce((s, x, i) => s + (mask & (1 << i) ? cents(x) : 0), 0));
      if (!want.has(gotDebits)) problems.push(`charges differ by ${fmt(gotDebits - cents(charges))}`);
    }
    const last4 = lines.map((l) => l.text.match(/\d{4} \d{2}\*\* \*{4} (\d{4})/)).find(Boolean)?.[1];
    return {
      format: "rbc-credit",
      txns,
      period: [start, end],
      last4,
      closingBalance: newBalance,
      gaps: { credits: credits === undefined ? 0 : gotCredits - cents(credits), debits: charges === undefined ? 0 : gotDebits - cents(charges) },
      check: credits === undefined && charges === undefined ? "no totals found" : problems.length ? problems.join("; ") : "ok",
    };
  },
};

const PROFILES: Profile[] = [scotiaCredit, scotiaBank, rbcCredit];

// ── Generic fallback ──────────────────────────────────────────────────────────

const DATE_TOKEN = String.raw`(?:\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}(?:/\d{2,4})?|[A-Za-z]{3,4}\.? \d{1,2}(?:, \d{4})?|\d{1,2} [A-Za-z]{3,4}(?: \d{4})?)`;
const AMOUNT_TOKEN = String.raw`-?\(?\$?-?[\d,]+\.\d{2}\)?(?: ?CR|-)?`;
const LINE = new RegExp(String.raw`^(${DATE_TOKEN})(?:\s+(${DATE_TOKEN}))?\s+(.+?)\s+(${AMOUNT_TOKEN})(?:\s+(${AMOUNT_TOKEN}))?$`);

/** Lines that start with a date and end with an amount (cards), or amount + running balance (banks). */
export function parsePdfLines(lines: string[], meta: StatementAccountMeta, file: string): StatementTxn[] {
  // Closing date = latest full date on the statement (e.g. "Statement period ... to Sep 22, 2026").
  const closing =
    lines
      .flatMap((l) => [...l.matchAll(/[A-Za-z]{3,9}\.? \d{1,2}, \d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/g)].map((m) => parseDate(m[0], meta.dateFormat)))
      .filter((d): d is string => !!d)
      .sort()
      .at(-1) ?? new Date().toISOString().slice(0, 10);
  const closingYear = Number(closing.slice(0, 4));
  const closingMonth = Number(closing.slice(5, 7));
  const isBank = !/credit|visa|mastercard|amex/i.test(meta.type);
  const out: StatementTxn[] = [];
  let prevBalance: number | null = null;

  for (const line of lines) {
    // Opening balance lines seed the running balance for bank statements.
    const ob = line.match(/(opening|previous|starting) balance.*?(-?\$?[\d,]+\.\d{2})/i);
    if (ob) prevBalance = parseAmount(ob[2]);
    const m = line.match(LINE);
    if (!m) continue;
    let date = parseDate(m[1]!, meta.dateFormat, closingYear);
    if (!date) continue;
    // Dates without a year: a month after the closing month belongs to the previous year (Dec on a Jan statement).
    if (!/\d{4}/.test(m[1]!) && Number(date.slice(5, 7)) > closingMonth) date = `${closingYear - 1}${date.slice(4)}`;
    const description = m[3]!.trim();
    if (/^(balance|total|subtotal|opening|closing|previous|new balance)/i.test(description)) continue;
    let amount = parseAmount(m[4]);
    const balance = parseAmount(m[5]);
    if (amount === null) continue;
    if (isBank && balance !== null && prevBalance !== null) {
      amount = Math.sign(balance - prevBalance || 1) * Math.abs(amount);
      prevBalance = balance;
    } else if (isBank && balance !== null) {
      prevBalance = balance;
    } else if (!isBank) {
      // Card statements list purchases as positive and payments/credits as negative or CR.
      amount = -amount;
    }
    out.push({ date, description, amount: Math.round((meta.flipSign ? -amount : amount) * 100) / 100, file });
  }
  return out;
}
