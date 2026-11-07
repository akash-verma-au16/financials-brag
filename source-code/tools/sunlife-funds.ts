import { countryCode, type FundHoldings, type FundRow } from "./fund-holdings.ts";
import { findRbc } from "./rbc-funds.ts";

/**
 * Sun Life group plan funds (segregated funds), from the Morningstar fact sheets Sun Life links
 * to from its member site. Each page embeds the fund's data as XML: asset mix, sector and country
 * splits, the underlying funds with weights, and returns against the benchmark.
 *
 * Symbols are "SLF:<Morningstar id>" (e.g. SLF:F0000ABCDE). Underlying funds are resolved to RBC
 * fund codes, or to iShares funds tracking the same index (BlackRock Canada's index funds).
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
export const SUNLIFE_ID = /^[A-Z0-9]{10}$/;
export const sunLifeUrl = (id: string) => `https://00440.mps30ebd.eas.morningstar.com/Sun%20Life/Factsheets/Sun%20Life%20HTML%20EN/${id}.html`;

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
const block = (xml: string, tag: string) => new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`).exec(xml)?.[0] ?? "";
const nodes = (xml: string) => [...xml.matchAll(/<n\s[^>]*>/g)].map((m) => m[0]);

const SECTOR: Record<string, string> = {
  "Basic Materials": "basic_materials",
  "Consumer Cyclical": "consumer_cyclical",
  "Financial Services": "financial_services",
  "Real Estate": "realestate",
  "Communication Services": "communication_services",
  Energy: "energy",
  Industrials: "industrials",
  Technology: "technology",
  "Consumer Defensive": "consumer_defensive",
  HealthCare: "healthcare",
  Utilities: "utilities",
};

export interface SunLifeFund {
  id: string;
  name: string;
  firm: string | null;
  underlying: string | null;
  type: string | null;
  risk: string | null;
  inception: string | null;
  asOf: string | null;
  mix: { stock: number; bond: number; cash: number; other: number };
  sectors: Record<string, number>;
  countries: Record<string, number>;
  holdings: { name: string; country: string | null; weight: number }[];
  /** Annualised beyond 1 year; fractions. */
  returns: { label: string; fund: number | null; index: number | null }[];
  benchmark: string | null;
}

export function parseSunLife(id: string, html: string): SunLifeFund | null {
  const name = /<fundName>([^<]*)<\/fundName>/.exec(html)?.[1];
  if (!name) return null;
  const summary = block(html, "summary");
  const mix = { stock: 0, bond: 0, cash: 0, other: 0 };
  for (const n of nodes(block(html, "assetAllocation"))) {
    const label = attr(n, "label") ?? "";
    const w = Number(attr(n, "net")) / 100;
    if (!Number.isFinite(w)) continue;
    if (/equity/i.test(label)) mix.stock += w;
    else if (/fixed|bond/i.test(label)) mix.bond += w;
    else if (/cash/i.test(label)) mix.cash += w;
    else mix.other += w;
  }
  const sectors: Record<string, number> = {};
  const sec = nodes(block(block(html, "exposure"), "sector")).filter((n) => SECTOR[attr(n, "label") ?? ""]);
  const secSum = sec.reduce((s, n) => s + Number(attr(n, "value")), 0) || 1;
  for (const n of sec) sectors[SECTOR[attr(n, "label")!]!] = Number(attr(n, "value")) / secSum;
  const countries: Record<string, number> = {};
  const geo = nodes(block(block(html, "exposure"), "country"));
  const geoSum = geo.reduce((s, n) => s + (Number(attr(n, "value")) || 0), 0) || 1;
  for (const n of geo) {
    const c = countryCode(decode(attr(n, "label") ?? ""));
    if (c) countries[c] = (countries[c] ?? 0) + (Number(attr(n, "value")) || 0) / geoSum;
  }
  const hold = block(html, "holdings");
  const holdings = [...hold.matchAll(/<n name="([^"]+)" country="([^"]*)" weight="([^"]+)"/g)].map((m) => ({ name: decode(m[1]!), country: countryCode(decode(m[2]!)), weight: Number(m[3]) / 100 }));
  const returns = [...block(html, "trailingReturns").matchAll(/<n label="([^"]+)"[^>]*>\s*<fund monthly="([^"]*)"[^>]*><\/fund>\s*<index monthly="([^"]*)"/g)].map((m) => ({
    label: m[1]!,
    fund: m[2] ? Number(m[2]) / 100 : null,
    index: m[3] ? Number(m[3]) / 100 : null,
  }));
  return {
    id,
    name: decode(name),
    firm: decode(attr(/<firmName[^>]*>/.exec(summary)?.[0] ?? "", "value") ?? "") || null,
    underlying: decode(attr(/<underlyingFund[^>]*>/.exec(summary)?.[0] ?? "", "value") ?? "") || null,
    type: /<fundType[^>]*>([^<]*)</.exec(summary)?.[1] ?? null,
    risk: /<investmentRisk[^>]*>([^<]*)</.exec(html)?.[1] ?? null,
    inception: attr(/<inceptionDate[^>]*>/.exec(summary)?.[0] ?? "", "value"),
    asOf: attr(/<date [^>]*>/.exec(hold)?.[0] ?? "", "value"),
    mix,
    sectors,
    countries,
    holdings,
    returns: returns.filter((r) => r.fund !== null && Number.isFinite(r.fund)),
    benchmark: decode(/<benchmarkName[^>]*>([^<]*)</.exec(summary)?.[1] ?? "") || null,
  };
}

export async function loadSunLife(id: string): Promise<SunLifeFund | null> {
  if (!SUNLIFE_ID.test(id)) return null;
  const res = await fetch(sunLifeUrl(id), { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return null;
  return parseSunLife(id, await res.text());
}

/** BlackRock Canada index funds → an iShares fund tracking the same index (which publishes holdings). */
const BLACKROCK_INDEX: [RegExp, string][] = [
  [/universe bond/i, "XBB.TO"],
  [/long bond/i, "XLB.TO"],
  [/short term bond|short bond/i, "XSB.TO"],
  [/(cdn|canadian)\s+us equity|u\.?s\.? equity index|s&p 500/i, "IVV"],
  [/canadian equity index|tsx/i, "XIC.TO"],
  [/msci eafe/i, "EFA"],
  [/emerging/i, "IEMG"],
  [/glo?b?a?l dev(eloped)? real est|global real estate/i, "REET"],
  [/acwi|all country/i, "ACWI"],
];

/** Underlying fund name → a symbol the app can look into. */
async function resolve(name: string, ticker: (name: string) => Promise<string | null>): Promise<string | null> {
  const rbc = await findRbc(name).catch(() => null);
  if (rbc) return `RBC:${rbc.code}`;
  if (/blackrock/i.test(name)) for (const [re, sym] of BLACKROCK_INDEX) if (re.test(name)) return sym;
  return ticker(name).catch(() => null);
}

export async function sunLifeHoldings(id: string, ticker: (name: string) => Promise<string | null>): Promise<FundHoldings | null> {
  const f = await loadSunLife(id);
  if (!f?.holdings.length) return null;
  const rows: FundRow[] = [];
  for (const h of f.holdings) rows.push({ n: h.name, t: await resolve(h.name, ticker), w: h.weight, c: null, s: null, k: "fund" });
  return {
    symbol: `SLF:${id}`,
    source: "Sun Life",
    sourceName: `Sun Life fact sheet for ${f.name}`,
    asOf: f.asOf,
    proxy: null,
    rows,
    countries: f.countries,
    sectors: f.sectors,
    mix: f.mix,
  };
}
