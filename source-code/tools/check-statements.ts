import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pdfLines, parsePdf } from "./pdf-profiles.ts";

/**
 * Verifies statement parsing without printing any amounts or descriptions: per file, the format
 * detected, transaction count, statement period, and whether totals matched (ok / MISMATCH).
 *
 *   node tools/check-statements.ts <folder>
 */

const dir = resolve(process.argv[2] ?? "statements");
const files: string[] = [];
async function walk(d: string) {
  for (const e of await readdir(d, { withFileTypes: true })) {
    if (e.isDirectory()) await walk(join(d, e.name));
    else if (/\.pdf$/i.test(e.name)) files.push(join(d, e.name));
  }
}
await walk(dir);

let ok = 0;
for (const f of files.sort()) {
  const r = await parsePdf(await readFile(f), { institution: "?", type: "credit" }, f);
  // Which side differs, never by how much.
  const status = r.check === "ok" ? "ok" : r.check ? `MISMATCH (${r.check.replace(/ by \$[\d.,]+/g, "")})` : "unchecked";
  if (status === "ok") ok++;
  const credits = r.txns.filter((t) => t.amount > 0).length;
  console.log(`${f.slice(dir.length + 1).padEnd(40)} ${r.format.padEnd(14)} ${String(r.txns.length).padStart(3)} txns (${credits} credits)  ${r.period?.join(" → ") ?? "no period"}  ${status}`);
  if (status !== "ok" && r.gaps) {
    // Does the gap equal one parsed transaction (or twice one)? Print only that line's masked shape.
    const mask = (s: string) => s.replace(/\d/g, "9").replace(/[A-Za-z]{2,}/g, (w) => (/^(PAYMENT|FROM|INTEREST|FEE|CASH|ADVANCE|BALANCE|CREDIT|REFUND|RETURN)$/i.test(w) ? w : `W${w.length}`));
    for (const [side, gap] of Object.entries(r.gaps)) {
      if (!gap) continue;
      const hits = r.txns.filter((t) => [1, 2].some((k) => Math.round(Math.abs(t.amount) * 100) * k === Math.abs(gap)));
      console.log(`    ${side}: ${gap > 0 ? "parsed more" : "parsed less"} than the statement; ${hits.length ? hits.map((t) => `${Math.round(Math.abs(t.amount) * 100) * 2 === Math.abs(gap) ? "2×" : "1×"} ${t.amount > 0 ? "credit" : "debit"} "${mask(t.description)}"`).join(", ") : "no single line explains it"}`);
    }
  }
  if (process.env.SHAPES && status !== "ok") {
    // Masked shapes of lines that look like transactions but weren't parsed (layout debugging only).
    for (const l of await pdfLines(await readFile(f)))
      if (/^\d{3}\s+[A-Z][a-z]{2}\s+\d/.test(l.text)) console.log("   ", l.x, l.text.replace(/\d/g, "9").replace(/[A-Za-z]{4,}/g, (w) => `W${w.length}`));
  }
}
console.log(`\n${ok}/${files.length} statements match their own totals.`);
