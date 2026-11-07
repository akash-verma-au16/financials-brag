import { resolve } from "node:path";
import { consolidateLedgers } from "./ledger.ts";

/**
 * Merges CSV exports sitting in yearly-ledger folders (account.yaml `ledger: yearly`) into their
 * <YYYY>.csv masters and deletes them — what the server does on its own whenever the app loads.
 * Prints counts only, never amounts or descriptions. Doesn't commit.
 *
 *   node tools/merge-ledgers.ts [statements-folder]
 */

const results = await consolidateLedgers(resolve(process.argv[2] ?? "statements"));
if (!results.length) console.log("No exports to merge.");
for (const r of results) {
  if (r.error) {
    console.log(`${r.folder}/${r.file}: NOT merged (${r.error}) — left in place`);
    continue;
  }
  const years = r.years.map((y) => `${y.year}: +${y.added} new, ${y.alreadyThere} already there${y.olderSkipped ? `, ${y.olderSkipped} older rows left out` : ""}`).join("; ");
  console.log(`${r.folder}/${r.file} → ${years}${r.pending ? `; ${r.pending} pending skipped` : ""} (export deleted)`);
}
