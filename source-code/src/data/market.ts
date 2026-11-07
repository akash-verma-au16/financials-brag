import { useEffect, useState } from "react";
import { DEMO_ONLY } from "@/lib/demo-only";
import { getAccessToken } from "@/lib/google-auth";
import { hashKey } from "../../tools/hash.ts";
import type { Instrument } from "./model";

/**
 * Public market data (quotes, fundamentals, fund holdings, price history, news, Bank of Canada
 * rates) from the local server's /api/market proxy (tools/market.ts). Only symbols are sent.
 */

export interface FundHolding {
  symbol: string | null;
  name: string;
  weight: number;
}

export interface Profile {
  symbol: string;
  name: string;
  quoteType: string | null;
  exchange: string | null;
  currency: string | null;
  price: number | null;
  change: number | null;
  changePct: number | null;
  marketTime: number | null;
  marketCap: number | null;
  previousClose: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  low52: number | null;
  high52: number | null;
  avg50: number | null;
  avg200: number | null;
  volume: number | null;
  avgVolume: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  pegRatio: number | null;
  eps: number | null;
  forwardEps: number | null;
  beta: number | null;
  dividendYield: number | null;
  dividendRate: number | null;
  payoutRatio: number | null;
  exDividendDate: string | null;
  fiveYearAvgDividendYield: number | null;
  expenseRatio: number | null;
  turnover: number | null;
  /** Sales charges as fractions (mutual funds). */
  frontLoad: number | null;
  deferredLoad: number | null;
  bid: number | null;
  ask: number | null;
  totalAssets: number | null;
  ytdReturn: number | null;
  threeYearReturn: number | null;
  fiveYearReturn: number | null;
  fundFamily: string | null;
  category: string | null;
  legalType: string | null;
  inceptionDate: string | null;
  morningstarRating: number | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  city: string | null;
  website: string | null;
  employees: number | null;
  summary: string | null;
  fund: {
    stock: number | null;
    bond: number | null;
    cash: number | null;
    other: number | null;
    preferred: number | null;
    convertible: number | null;
    holdings: FundHolding[];
    sectors: Record<string, number>;
    bondRatings: Record<string, number>;
    pe: number | null;
    pb: number | null;
    medianMarketCap: number | null;
    duration: number | null;
    maturity: number | null;
  } | null;
  analysts: {
    key: string | null;
    mean: number | null;
    count: number | null;
    targetLow: number | null;
    targetMean: number | null;
    targetHigh: number | null;
    trend: { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }[];
  } | null;
  financials: {
    currency: string | null;
    revenue: number | null;
    revenueGrowth: number | null;
    earningsGrowth: number | null;
    grossMargin: number | null;
    operatingMargin: number | null;
    profitMargin: number | null;
    roe: number | null;
    roa: number | null;
    debtToEquity: number | null;
    currentRatio: number | null;
    freeCashflow: number | null;
    totalCash: number | null;
    totalDebt: number | null;
    yearly: { year: number; revenue: number | null; earnings: number | null }[];
  } | null;
  nextEarnings: string | null;
  /** Returns vs the benchmark, from a plan fact sheet (fractions; over 1 year annualised). */
  trailing: { label: string; fund: number | null; index: number | null }[] | null;
  benchmark: string | null;
  riskLevel: string | null;
}

export interface PricePoint {
  d: string;
  /** Close adjusted for dividends and splits (total return). */
  c: number;
  /** Plain close. */
  p: number;
}

export interface History {
  symbol: string;
  currency: string | null;
  interval: string;
  points: PricePoint[];
  dividends: { d: string; amount: number }[];
}

export interface NewsItem {
  title: string;
  link: string;
  publisher: string | null;
  at: string;
}

export interface MacroValue {
  value: number;
  date: string;
  yearAgo: number | null;
}
export type Macro = Record<"policyRate" | "bond10y" | "cpi" | "usdcad", MacroValue | null>;

/** One position of a fund (tools/fund-holdings.ts). */
export interface FundRow {
  n: string;
  t: string | null;
  w: number;
  /** ISO country code. */
  c: string | null;
  s: string | null;
  k: "stock" | "fund" | "bond" | "cash" | "other";
}

export interface FundHoldings {
  symbol: string;
  source: "iShares" | "SEC N-PORT" | "RBC GAM" | "Sun Life";
  sourceName: string;
  asOf: string | null;
  proxy: string | null;
  rows: FundRow[];
  /** Fund-level splits when published: stocks by country and sector (fractions), asset mix. */
  countries?: Record<string, number>;
  sectors?: Record<string, number>;
  mix?: { stock: number; bond: number; cash: number; other: number };
}

export type Range = "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y" | "10y" | "max";

// ── Fetching ────────────────────────────────────────────────────────────────

const cache = new Map<string, Promise<unknown>>();

/** Public demo: market data is a snapshot bundled with the build, one file per request. */
export const demoMarketFile = (url: string) => `demo-market/${hashKey(url)}.json`;

function get<T>(url: string): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    const token = getAccessToken();
    const req = DEMO_ONLY ? fetch(`${import.meta.env.BASE_URL}${demoMarketFile(url)}`) : fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    p = req.then(async (res) => {
      // Static hosts answer a missing file with 404 or with the app's own page: neither is data.
      if (DEMO_ONLY && (!res.ok || !res.headers.get("content-type")?.includes("json"))) throw new Error("Not in the public demo's market snapshot.");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `Market data unavailable (${res.status})`);
      return body as T;
    });
    // Failures aren't cached, so a later visit retries.
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

export type Loaded<T> = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: T };

function useGet<T>(url: string | null): Loaded<T> {
  const [state, setState] = useState<{ url: string | null; value: Loaded<T> }>({ url: null, value: { status: "loading" } });
  useEffect(() => {
    if (!url) return;
    let live = true;
    get<T>(url).then(
      (data) => live && setState({ url, value: { status: "ready", data } }),
      (e: Error) => live && setState({ url, value: { status: "error", error: e.message } }),
    );
    return () => {
      live = false;
    };
  }, [url]);
  return state.url === url ? state.value : { status: "loading" };
}

async function batch<T>(endpoint: "profile" | "holdings" | "fees", symbols: string[], size: number): Promise<Map<string, T | null>> {
  const list = [...new Set(symbols)].sort();
  const parts: string[][] = [];
  for (let i = 0; i < list.length; i += size) parts.push(list.slice(i, i + size));
  const out = new Map<string, T | null>();
  for (const part of await Promise.all(parts.map((b) => get<Record<string, T | { error: string } | null>>(`/api/market/${endpoint}?symbols=${encodeURIComponent(b.join(","))}`))))
    for (const [s, v] of Object.entries(part)) out.set(s, v && !("error" in (v as object)) ? (v as T) : null);
  return out;
}

/** Profiles for many symbols (null = Yahoo has no data for it). */
export function useProfiles(symbols: string[]): Loaded<Map<string, Profile | null>> {
  const key = [...new Set(symbols)].sort().join(",");
  const [state, setState] = useState<{ key: string; value: Loaded<Map<string, Profile | null>> }>({ key: "", value: { status: "loading" } });
  useEffect(() => {
    if (!key) return;
    let live = true;
    batch<Profile>("profile", key.split(","), 40).then(
      (m) => live && setState({ key, value: { status: "ready", data: m } }),
      (e: Error) => live && setState({ key, value: { status: "error", error: e.message } }),
    );
    return () => {
      live = false;
    };
  }, [key]);
  if (!key) return { status: "ready", data: new Map() };
  return state.key === key ? state.value : { status: "loading" };
}

export interface MarketData {
  profiles: Map<string, Profile | null>;
  funds: Map<string, FundHoldings | null>;
}

/**
 * Profiles and complete holdings for the given symbols, then for the funds those funds hold, and
 * so on (up to 4 levels: XEQT → XTOT → ITOT → stocks).
 */
export function useMarketTree(symbols: string[], childrenOf: (d: MarketData) => string[]): Loaded<MarketData> {
  const key = [...new Set(symbols)].sort().join(",");
  const [state, setState] = useState<{ key: string; value: Loaded<MarketData> }>({ key: "", value: { status: "loading" } });
  useEffect(() => {
    if (!key) return;
    let live = true;
    (async () => {
      const data: MarketData = { profiles: new Map(), funds: new Map() };
      let want = key.split(",");
      for (let depth = 0; depth < 4 && want.length; depth++) {
        const [p, f] = await Promise.all([batch<Profile>("profile", want, 40), batch<FundHoldings>("holdings", want, 30)]);
        for (const [k, v] of p) data.profiles.set(k, v);
        for (const [k, v] of f) data.funds.set(k, v);
        want = childrenOf(data).filter((s) => !data.profiles.has(s));
      }
      return data;
    })().then(
      (data) => live && setState({ key, value: { status: "ready", data } }),
      (e: Error) => live && setState({ key, value: { status: "error", error: e.message } }),
    );
    return () => {
      live = false;
    };
    // childrenOf is a pure function of the data.
  }, [key]);
  if (!key) return { status: "ready", data: { profiles: new Map(), funds: new Map() } };
  return state.key === key ? state.value : { status: "loading" };
}

export interface FundFees {
  management: number | null;
  mer: number | null;
  ter: number | null;
  source: string;
}

/** Published fees (management fee, MER, TER) where a provider publishes them; null otherwise. */
export function useFees(symbols: string[]): Loaded<Map<string, FundFees | null>> {
  const key = [...new Set(symbols)].sort().join(",");
  const [state, setState] = useState<{ key: string; value: Loaded<Map<string, FundFees | null>> }>({ key: "", value: { status: "loading" } });
  useEffect(() => {
    if (!key) return;
    let live = true;
    batch<FundFees>("fees", key.split(","), 40).then(
      (m) => live && setState({ key, value: { status: "ready", data: m } }),
      (e: Error) => live && setState({ key, value: { status: "error", error: e.message } }),
    );
    return () => {
      live = false;
    };
  }, [key]);
  if (!key) return { status: "ready", data: new Map() };
  return state.key === key ? state.value : { status: "loading" };
}

export const useHistory = (symbol: string | null, range: Range) =>
  useGet<{ history: History | null }>(symbol ? `/api/market/history?symbol=${encodeURIComponent(symbol)}&range=${range}` : null);

/** Several histories at once; symbols without data are left out. */
export function useHistories(symbols: string[], range: Range): Loaded<Map<string, History>> {
  const list = [...new Set(symbols)].sort();
  const key = `${range}|${list.join(",")}`;
  const [state, setState] = useState<{ key: string; value: Loaded<Map<string, History>> }>({ key: "", value: { status: "loading" } });
  useEffect(() => {
    if (!list.length) return;
    let live = true;
    Promise.all(
      list.map((s) =>
        get<{ history: History | null }>(`/api/market/history?symbol=${encodeURIComponent(s)}&range=${range}`).then(
          (r) => r.history,
          () => null,
        ),
      ),
    ).then((hs) => {
      const m = new Map<string, History>();
      hs.forEach((h, i) => h && h.points.length > 1 && m.set(list[i]!, h));
      if (live) setState({ key, value: list.length && !m.size ? { status: "error", error: "No price history available." } : { status: "ready", data: m } });
    });
    return () => {
      live = false;
    };
  }, [key]);
  if (!list.length) return { status: "ready", data: new Map() };
  return state.key === key ? state.value : { status: "loading" };
}

export const useNews = (symbol: string | null, name: string) =>
  useGet<{ news: NewsItem[] }>(symbol ? `/api/market/news?symbol=${encodeURIComponent(symbol)}&name=${encodeURIComponent(name.slice(0, 80))}` : null);

export const useSymbolSearch = (q: string) =>
  useGet<{ results: { symbol: string; name: string; type: string | null; exchange: string | null }[] }>(
    q.trim().length >= 2 ? `/api/market/search?q=${encodeURIComponent(q.trim())}` : null,
  );

export const useMacro = () => useGet<Macro>("/api/market/macro");

// ── Symbols ─────────────────────────────────────────────────────────────────

/**
 * Yahoo's spelling of a Wealthica symbol: share classes use "-" (BRK.B → BRK-B, RCI.B.TO → RCI-B.TO)
 * and TSX US-dollar listings are "-U.TO" (DLR.U → DLR-U.TO).
 */
export function toYahoo(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  const m = /^(.+?)(\.(TO|V|NE|CN))?$/.exec(s)!;
  let base = m[1]!;
  const suffix = m[2] ?? "";
  if (/\.U$/.test(base)) return `${base.slice(0, -2).replace(/\./g, "-")}-U${suffix || ".TO"}`;
  base = base.replace(/\.([A-Z])$/, "-$1");
  return base + suffix;
}

/** The symbol to look up for an instrument: the user's link first, else its own ticker. Null for cash. */
export function marketSymbol(i: Instrument, links: Record<string, string>): string | null {
  if (links[i.key]) return links[i.key]!;
  if (i.vehicle === "cash" || !i.symbol) return null;
  return toYahoo(i.symbol);
}

/** Yahoo symbol for converting USD prices to CAD. */
export const USDCAD = "CAD=X";
