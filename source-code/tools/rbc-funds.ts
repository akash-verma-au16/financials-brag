import { countryCode, type FundHoldings, type FundRow } from "./fund-holdings.ts";

/**
 * RBC Global Asset Management (RBC, PH&N and BlueBay funds), common in Canadian group pension
 * plans. rbcgam.com publishes, per fund: the full quarterly holdings list, asset mix, country and
 * sector splits, MER and NAV. Funds of funds (e.g. PH&N LifeTime) list their underlying RBC funds,
 * which are looked up the same way, down to the companies.
 *
 * Symbols for these funds are "RBC:<fund code>" (e.g. RBC:RBF1234).
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const DAY = 86_400_000;

export interface RbcFund {
  code: string;
  name: string;
  series: string;
  mer: number | null;
  managementFees: number | null;
  nav: number | null;
  assetClass: string | null;
}

let list: { at: number; value: Promise<RbcFund[]> } | null = null;

export function rbcList(): Promise<RbcFund[]> {
  if (list && Date.now() - list.at < DAY) return list.value;
  const value = fetch("https://www.rbcgam.com/api/vtl/mf-list-fds", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) })
    .then((r) => r.text())
    .then((t) => {
      const j = JSON.parse(t.trim()) as { fundData: Record<string, any>[] };
      return j.fundData.map((f) => ({
        code: String(f.rbcFundCode),
        name: String(f.fundName?.en ?? f.fundName ?? ""),
        series: String(f.series ?? ""),
        mer: typeof f.mer === "number" ? f.mer : null,
        managementFees: typeof f.managementFees === "number" ? f.managementFees : null,
        nav: typeof f.navpu === "number" ? f.navpu : null,
        assetClass: f.assetClass?.en ?? null,
      }));
    });
  value.catch(() => (list = null));
  list = { at: Date.now(), value };
  return value;
}

/** "Phillips, Hager & North LifeTime 2045 Fund - Series O", "PH&N LifeTime 2045 O" → "phnlifetime2045". */
export const rbcKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s+-\s+series\s+\w+$/, "")
    .replace(/\s+(series\s+)?(a|d|f|o|n|t5|ft5|pz|sr\s*\w+)$/i, "")
    .replace(/phillips,?\s*hager\s*&\s*north/g, "ph&n")
    .replace(/\bfund\b/g, "")
    .replace(/[^a-z0-9]/g, "");

/** The RBC fund with this name (any series: they hold the same portfolio), preferring series O. */
export async function findRbc(name: string): Promise<RbcFund | null> {
  const key = rbcKey(name);
  if (key.length < 6) return null;
  const all = (await rbcList()).filter((f) => rbcKey(f.name) === key);
  return all.find((f) => f.series === "O") ?? all.find((f) => f.series === "F") ?? all[0] ?? null;
}

export async function searchRbc(q: string): Promise<RbcFund[]> {
  const words = q.toLowerCase().replace(/phillips,?\s*hager\s*&\s*north/g, "ph&n").split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  return (await rbcList())
    .filter((f) => words.every((w) => f.name.toLowerCase().replace(/phillips,?\s*hager\s*&\s*north/g, "ph&n").includes(w)))
    .sort((a, b) => (a.series === "O" ? -1 : b.series === "O" ? 1 : 0))
    .filter((f) => !seen.has(f.name) && seen.add(f.name))
    .slice(0, 8);
}

export async function rbcDetail(code: string): Promise<Record<string, any> | null> {
  const res = await fetch("https://www.rbcgam.com/api/content/_search", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `+contentType:FdsMfDetailsData +FdsMfDetailsData.fundCode:${code}`, limit: 1, depth: 0 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { entity?: { jsonObjectView?: { contentlets?: Record<string, any>[] } }; contentlets?: Record<string, any>[] };
  const d = (j.entity?.jsonObjectView?.contentlets ?? j.contentlets)?.[0]?.jsonFDSFundData;
  return d ? (typeof d === "string" ? JSON.parse(d) : d) : null;
}

const SECTOR: Record<string, string> = {
  "Information Technology": "technology",
  Financials: "financial_services",
  "Health Care": "healthcare",
  "Consumer Discretionary": "consumer_cyclical",
  "Consumer Staples": "consumer_defensive",
  Industrials: "industrials",
  "Communication Services": "communication_services",
  Energy: "energy",
  Materials: "basic_materials",
  "Real Estate": "realestate",
  Utilities: "utilities",
};

const pct = (o: Record<string, number> | null | undefined) => Object.entries(o ?? {}).filter(([, v]) => typeof v === "number" && v > 0);

/** Asset mix as fractions, from RBC's categories ("U.S. Equities", "Fixed Income", "Cash"…). */
export function rbcMix(d: Record<string, any>) {
  const mix = { stock: 0, bond: 0, cash: 0, other: 0 };
  for (const [k, v] of pct(d.assetMix)) {
    const w = v / 100;
    if (/equit|real estate/i.test(k)) mix.stock += w;
    else if (/fixed|bond|mortgage/i.test(k)) mix.bond += w;
    else if (/cash|money/i.test(k)) mix.cash += w;
    else mix.other += w;
  }
  return mix;
}

export function rbcSectors(d: Record<string, any>): Record<string, number> {
  const out: Record<string, number> = {};
  const rows = pct(d.equitySectorAllocation);
  const sum = rows.reduce((s, [, v]) => s + v, 0) || 1;
  for (const [k, v] of rows) if (SECTOR[k]) out[SECTOR[k]] = (out[SECTOR[k]] ?? 0) + v / sum;
  return out;
}

/** Holdings of an RBC fund. `ticker` resolves non-RBC ETFs it holds (e.g. "Vanguard Real Estate ETF" → VNQ). */
export async function rbcHoldings(code: string, ticker: (name: string) => Promise<string | null>): Promise<FundHoldings | null> {
  const d = await rbcDetail(code);
  if (!d) return null;
  const raw = pct(Object.keys(d.topHoldingsQuarterly ?? {}).length >= Object.keys(d.topHoldings ?? {}).length ? d.topHoldingsQuarterly : d.topHoldings);
  if (!raw.length) return null;
  const funds = await rbcList();
  const rows: FundRow[] = [];
  for (const [name, w] of raw) {
    const isFund = /\b(fund|etf|trust)\b/i.test(name);
    let t: string | null = null;
    if (isFund) {
      const key = rbcKey(name);
      const series = / - Series (\w+)$/.exec(name)?.[1];
      const match = funds.filter((f) => rbcKey(f.name) === key);
      const f = match.find((x) => x.series === series) ?? match.find((x) => x.series === "O") ?? match[0];
      t = f ? `RBC:${f.code}` : await ticker(name).catch(() => null);
    }
    rows.push({ n: name.replace(/\s+-\s+Series \w+$/, ""), t, w: w / 100, c: null, s: null, k: isFund ? "fund" : "stock" });
  }
  rows.sort((a, b) => b.w - a.w);
  // Country split of the fund's stocks (normalised to 1).
  const countries: Record<string, number> = {};
  const geo = pct(d.countryAllocation);
  const geoSum = geo.reduce((s, [, v]) => s + v, 0) || 1;
  for (const [k, v] of geo) {
    const c = countryCode(k);
    if (c) countries[c] = (countries[c] ?? 0) + v / geoSum;
  }
  const name = String(d.fundName?.en ?? code);
  return {
    symbol: `RBC:${code}`,
    source: "RBC GAM",
    sourceName: `RBC GAM data for ${name}`,
    asOf: d.analysisDate?.topHoldingsQuarterly ?? d.analysisDate?.topHoldings ?? null,
    proxy: null,
    rows,
    countries,
    sectors: rbcSectors(d),
    mix: rbcMix(d),
  };
}
