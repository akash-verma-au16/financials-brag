import { readFile } from "node:fs/promises";

/**
 * Prints the LAYOUT of a statement PDF without its contents, so a parser can be designed
 * without exposing transactions: digits → 9, and every word not in a small list of generic
 * statement vocabulary is replaced by a placeholder (W5 = a 5-letter word).
 *
 *   node tools/pdf-structure.ts <file.pdf> [more.pdf…]
 */

const VOCAB = new Set(
  (
    "jan feb mar apr may jun jul aug sep sept oct nov dec january february march april june july august september october november december " +
    "date dates trans transaction transactions post posted posting description details amount amounts balance balances previous new opening closing " +
    "statement period from to of the and on in at for your you account card number credit debit payment payments received thank interest charges charge " +
    "fees fee total totals subtotal minimum due available limit purchases purchase returns return cash advance advances adjustments other " +
    "page continued reference ref no cr dr withdrawals withdrawal deposits deposit cheque cheques rate annual percentage summary activity " +
    "points rewards scene visa mastercard amex scotiabank scotia rbc cibc td bmo cad usd $"
  ).split(" "),
);

function maskToken(t: string): string {
  if (/^[\d$,.\-()/+%*#:]+$/.test(t)) return t.replace(/\d/g, "9");
  const word = t.replace(/[^A-Za-z]/g, "");
  if (word && VOCAB.has(word.toLowerCase())) return t.replace(/\d/g, "9");
  if (!word) return t.replace(/\d/g, "9");
  return `W${word.length}${/\d/.test(t) ? "+9" : ""}`;
}

async function dump(file: string) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await readFile(file)), useSystemFonts: true, isEvalSupported: false }).promise;
  console.log(`\n=== ${file.split(/[\\/]/).pop()} · ${doc.numPages} page(s) ===`);
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const byY = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]! / 2) * 2;
      (byY.get(y) ?? byY.set(y, []).get(y)!).push({ x: Math.round(it.transform[4]!), s: it.str });
    }
    console.log(`--- page ${p} (${byY.size} lines) ---`);
    for (const y of [...byY.keys()].sort((a, b) => b - a)) {
      const items = byY.get(y)!.sort((a, b) => a.x - b.x);
      const text = items.map((i) => i.s.split(/\s+/).filter(Boolean).map(maskToken).join(" ")).join(" | ");
      console.log(`x${String(items[0]!.x).padStart(3)} ${text}`);
    }
  }
  await doc.destroy();
}

for (const f of process.argv.slice(2)) await dump(f);
