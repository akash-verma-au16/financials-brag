import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hashKey } from "./hash.ts";

/**
 * Records the market-data snapshot the public demo build ships with (demo/market/). Takes the
 * /api/market requests the app made while browsing demo mode (one per line in demo/market-urls.txt),
 * fetches each from the dev server (which serves market data without sign-in) and saves it under
 * the name the app looks for (src/data/market.ts → demoMarketFile). Demo symbols only: public data.
 * News and search aren't kept.
 *
 *   npm run dev            # in another terminal
 *   node tools/demo-market.ts [http://localhost:3000]
 */

export const keep = (url: string) => url.startsWith("/api/market/") && !/^\/api\/market\/(news|search)\b/.test(url);

if (import.meta.main) {
  const origin = process.argv[2] ?? "http://localhost:3000";
  const urls = [...new Set((await readFile("demo/market-urls.txt", "utf8")).split(/\r?\n/).map((l) => l.trim()).filter(keep))];
  await rm("demo/market", { recursive: true, force: true });
  await mkdir("demo/market", { recursive: true });
  let saved = 0;
  for (const url of urls) {
    const res = await fetch(origin + url);
    if (!res.ok) {
      console.log(`skip ${res.status} ${url}`);
      continue;
    }
    await writeFile(join("demo/market", `${hashKey(url)}.json`), JSON.stringify(await res.json()));
    saved++;
  }
  console.log(`${saved} of ${urls.length} responses saved to demo/market/`);
}
