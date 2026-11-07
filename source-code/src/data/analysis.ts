import type { Holding } from "./holdings";
import { classifyInstrument, isCanadianListing } from "./instruments";
import { marketSymbol, type History, type MarketData, type PricePoint, type Profile } from "./market";
import type { Account, Region } from "./model";

/**
 * Portfolio analysis from holdings + public market data: look-through exposure (what the funds
 * actually own), fees, income, valuation, risk from price history, overlap and plain-language
 * insights. Pure functions; the pages only lay the results out.
 */

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface Row {
  h: Holding;
  /** Market-data symbol (linked or the holding's own), null for cash / unlinked funds. */
  symbol: string | null;
  profile: Profile | null;
  /**
   * The data describes another fund the holding was linked to (the fund a pension plan's units
   * invest in, or a fund tracking the same mix): its make-up applies, its price and fee don't.
   */
  linked: boolean;
  /** The fee you pay, entered by you. */
  feeOverride: number | null;
}

export function rowsFor(hs: Holding[], profiles: Map<string, Profile | null>, links: Record<string, string>, fees: Record<string, number> = {}): Row[] {
  return hs.map((h) => {
    const symbol = marketSymbol(h.instrument, links);
    return { h, symbol, profile: symbol ? (profiles.get(symbol) ?? null) : null, linked: !!links[h.instrument.key], feeOverride: fees[h.instrument.key] ?? null };
  });
}

export const isFundProfile = (p: Profile | null | undefined) => !!p && (p.quoteType === "ETF" || p.quoteType === "MUTUALFUND" || !!p.fund);
const FUND_NAME = /\b(ETF|FUND|INDEX|PORTFOLIO|TRUST)\b|ISHARES|VANGUARD|SPDR|BMO |INVESCO/i;

/** Funds held by funds (XEQT → XTOT, XIC…): their data is needed to look through them. */
export function childFundSymbols(d: MarketData): string[] {
  const out = new Set<string>();
  for (const [sym, p] of d.profiles) {
    const full = d.funds.get(sym);
    if (full) {
      for (const r of full.rows) if (r.k === "fund" && r.t && r.w >= 0.005) out.add(r.t.toUpperCase());
    } else for (const c of p?.fund?.holdings ?? []) if (c.symbol && c.weight >= 0.03 && FUND_NAME.test(c.name)) out.add(c.symbol.toUpperCase());
  }
  return [...out];
}

// ── Countries ───────────────────────────────────────────────────────────────

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
export const countryName = (code: string) => {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
};
const CODE_BY_NAME = (() => {
  const m = new Map<string, string>();
  for (let a = 65; a <= 90; a++)
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = countryName(code);
      if (name !== code && !m.has(name.toUpperCase())) m.set(name.toUpperCase(), code);
    }
  m.set("SOUTH KOREA", "KR");
  m.set("KOREA", "KR");
  m.set("UNITED STATES OF AMERICA", "US");
  return m;
})();
export const countryCode = (name: string | null) => (name ? (CODE_BY_NAME.get(name.trim().toUpperCase()) ?? null) : null);

const EMERGING = new Set(["CN", "IN", "TW", "BR", "KR", "MX", "ZA", "ID", "TH", "SA", "MY", "PH", "CL", "TR", "PL", "PE", "CO", "EG", "QA", "AE", "KW", "GR", "HU", "CZ", "VN", "PK", "AR", "RU"]);
export const regionOf = (code: string): Region => (code === "US" ? "US" : code === "CA" ? "CA" : EMERGING.has(code) ? "emerging" : "intl");
export function regionOfCountry(country: string | null): Region {
  const c = countryCode(country);
  return c ? regionOf(c) : "mixed";
}

/** Main currency of each country's stocks (euro area collapsed). */
const EURO = new Set(["DE", "FR", "NL", "IT", "ES", "BE", "FI", "IE", "AT", "PT", "LU", "GR", "SK", "SI", "LT", "LV", "EE", "CY", "MT", "HR"]);
const CURRENCY: Record<string, string> = { US: "USD", CA: "CAD", JP: "JPY", GB: "GBP", CH: "CHF", AU: "AUD", HK: "HKD", CN: "CNY", TW: "TWD", KR: "KRW", IN: "INR", SE: "SEK", DK: "DKK", NO: "NOK", SG: "SGD", IL: "ILS", BR: "BRL", ZA: "ZAR", NZ: "NZD", MX: "MXN" };
export const currencyOf = (code: string) => (EURO.has(code) ? "EUR" : (CURRENCY[code] ?? "Other"));

// ── Look-through ────────────────────────────────────────────────────────────

export type Mix = "stocks" | "bonds" | "cash" | "other";

export const SECTOR_LABEL: Record<string, string> = {
  technology: "Technology",
  financial_services: "Financials",
  healthcare: "Health care",
  consumer_cyclical: "Consumer cyclical",
  consumer_defensive: "Consumer staples",
  industrials: "Industrials",
  communication_services: "Communication",
  energy: "Energy",
  basic_materials: "Materials",
  realestate: "Real estate",
  utilities: "Utilities",
};
export const sectorKey = (s: string) => {
  const k = s.toLowerCase().replace(/&/g, "").replace(/\s+/g, "_");
  return k === "real_estate" ? "realestate" : k === "financial" ? "financial_services" : k;
};

/** How a "global" fund with no further detail is split, roughly MSCI ACWI ex-Canada weights. */
export const GLOBAL_SPLIT: [Region, number][] = [["US", 0.66], ["intl", 0.25], ["emerging", 0.09]];

/** One name per company across sources ("APPLE", "Apple Inc", "Apple Inc." → APPLE). */
export function companyKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/&AMP;/g, "&")
    .replace(/[.,'()\-/]/g, " ")
    .replace(/\b(THE|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|PLC|AG|SA|NV|SE|ASA|AB|OYJ|SPA|S P A|HOLDINGS?|GROUP|CLASS [A-Z]|CL [A-Z]|SHARES|COMMON|ORD|ORDINARY|ADR|REG|NON[- ]VOTING|SUBORDINATE VOTING|VOTING|PAR|PS|PREFERRED|PFD|PREF)\b/g, " ")
    .replace(/&/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Company {
  key: string;
  name: string;
  symbol: string | null;
  value: number;
  /** Which of your holdings it comes through, and how much through each. */
  via: Map<string, number>;
  country: string | null;
  sector: string | null;
}

/** A level of "what's inside": a fund, the funds it holds, and so on. */
export interface Node {
  label: string;
  symbol: string | null;
  value: number;
  kind: "fund" | "stock" | "stocks" | "bonds" | "cash" | "other";
  source?: string;
  children: Node[];
  /** Companies held directly at this level (summarised into children when finishing). */
  stocks?: Map<string, { name: string; value: number }>;
}

export interface Source {
  symbol: string;
  name: string;
  source: string;
  asOf: string | null;
  proxy: string | null;
  /** Full holdings list (true) or the fund's top holdings only. */
  full: boolean;
}

export interface LookThrough {
  total: number;
  mix: Record<Mix, number>;
  /** Asset mix through each of your holdings (instrument key). */
  mixVia: Map<string, Record<Mix, number>>;
  /** Stock exposure by sector key ("unknown" when no source has it). */
  sectors: Map<string, number>;
  /** Stock exposure by ISO country code; stocks with only a region go to "?<region>". */
  countries: Map<string, number>;
  regions: Map<Region, number>;
  companies: Company[];
  /** Stock value inside funds that isn't broken down into companies, per holding. */
  unitemised: Map<string, number>;
  /** Value with no market data, classified from the instrument table only. */
  estimated: number;
  /** The look-through tree for each holding (instrument key). */
  trees: Map<string, Node>;
  sources: Map<string, Source>;
  notes: Set<string>;
}

const emptyMix = (): Record<Mix, number> => ({ stocks: 0, bonds: 0, cash: 0, other: 0 });

export function lookThrough(rows: Row[], data: MarketData): LookThrough {
  const { profiles, funds } = data;
  const out: LookThrough = {
    total: 0,
    mix: emptyMix(),
    mixVia: new Map(),
    sectors: new Map(),
    countries: new Map(),
    regions: new Map(),
    companies: [],
    unitemised: new Map(),
    estimated: 0,
    trees: new Map(),
    sources: new Map(),
    notes: new Set(),
  };
  const companies = new Map<string, Company>();
  const add = <K>(m: Map<K, number>, k: K, v: number) => v && m.set(k, (m.get(k) ?? 0) + v);
  let via = "";
  /** Set inside a fund whose source publishes its own country / sector split: those are used instead. */
  let attr = { geo: false, sec: false };

  const addMix = (k: Mix, v: number, node: Node) => {
    out.mix[k] += v;
    const m = out.mixVia.get(via) ?? out.mixVia.set(via, emptyMix()).get(via)!;
    m[k] += v;
    if (k !== "stocks") {
      const kind = k === "bonds" ? "bonds" : k === "cash" ? "cash" : "other";
      const child = node.children.find((c) => c.kind === kind) ?? (node.children.push({ label: { bonds: "Bonds", cash: "Cash", other: "Other" }[kind], symbol: null, value: 0, kind, children: [] }), node.children.at(-1)!);
      child.value += v;
    }
  };
  const addRegion = (r: Region, v: number) => {
    if (r === "global") {
      out.notes.add("Global funds without country detail are split roughly like the world market (US 66%, international 25%, emerging 9%).");
      for (const [g, w] of GLOBAL_SPLIT) {
        add(out.regions, g, v * w);
        add(out.countries, `?${g}`, v * w);
      }
    } else {
      const reg = r === "n/a" ? "mixed" : r;
      add(out.regions, reg, v);
      add(out.countries, `?${reg}`, v);
    }
  };
  /** A company's stock, with whatever is known about it. */
  const addStock = (name: string, symbol: string | null, v: number, country: string | null, sector: string | null, fallbackRegion: Region, node: Node) => {
    out.mix.stocks += v;
    const m = out.mixVia.get(via) ?? out.mixVia.set(via, emptyMix()).get(via)!;
    m.stocks += v;
    if (country === "UK") country = "GB";
    // Sources without per-company countries (RBC): a US or Canadian fund's stocks are from there.
    country ??= fallbackRegion === "US" ? "US" : fallbackRegion === "CA" ? "CA" : null;
    const key = companyKey(name) || name;
    const c = companies.get(key) ?? companies.set(key, { key, name, symbol: null, value: 0, via: new Map(), country, sector }).get(key)!;
    c.value += v;
    add(c.via, via, v);
    if (!c.symbol && symbol && /^[A-Z.\-]+$/.test(symbol)) c.symbol = symbol;
    c.country ??= country;
    c.sector ??= sector;
    if (!attr.geo) {
      if (country) {
        add(out.countries, country, v);
        add(out.regions, regionOf(country), v);
      } else addRegion(fallbackRegion, v);
    }
    if (sector && !attr.sec) add(out.sectors, sector, v);
    const st = node.stocks ?? (node.stocks = new Map());
    const e = st.get(key) ?? st.set(key, { name, value: 0 }).get(key)!;
    e.value += v;
  };
  /** Stocks we can't name: region/sector from the fund. */
  const addUnnamed = (v: number, region: Region, sectors: Record<string, number> | null, node: Node, label = "Stocks not itemised (fund publishes top holdings only)") => {
    out.mix.stocks += v;
    const m = out.mixVia.get(via) ?? out.mixVia.set(via, emptyMix()).get(via)!;
    m.stocks += v;
    add(out.unitemised, via, v);
    if (!attr.geo) addRegion(region, v);
    spreadSectors(v, sectors);
    const child = node.children.find((c) => c.kind === "stocks" && c.label === label) ?? (node.children.push({ label, symbol: null, value: 0, kind: "stocks", children: [] }), node.children.at(-1)!);
    child.value += v;
  };
  const spreadSectors = (v: number, sectors: Record<string, number> | null) => {
    if (attr.sec) return;
    const sum = sectors ? Object.values(sectors).reduce((s, x) => s + x, 0) : 0;
    if (sum > 0) for (const [k, w] of Object.entries(sectors!)) add(out.sectors, sectorKey(k), (v * w) / sum);
    else add(out.sectors, "unknown", v);
  };

  const noData = (v: number, region: Region, assetClass: string, node: Node) => {
    out.estimated += v;
    if (assetClass === "cash") addMix("cash", v, node);
    else if (assetClass === "fixed-income") addMix("bonds", v, node);
    else if (assetClass === "balanced") {
      out.notes.add("Balanced funds without market data are counted as 60% stocks, 40% bonds.");
      addUnnamed(v * 0.6, region === "mixed" ? "global" : region, null, node, "Stocks (estimated: no market data)");
      addMix("bonds", v * 0.4, node);
    } else if (assetClass === "equity" || assetClass === "real-estate") addUnnamed(v, region, assetClass === "real-estate" ? { realestate: 1 } : null, node, "Stocks (estimated: no market data)");
    else addMix("other", v, node);
  };

  const expand = (symbol: string | null, v: number, region: Region, assetClass: string, depth: number, node: Node) => {
    const p = symbol ? (profiles.get(symbol) ?? null) : null;
    const full = symbol && depth < 4 ? (funds.get(symbol) ?? null) : null;
    if (p && !isFundProfile(p) && !full) {
      const c = countryCode(p.country);
      addStock(p.name, p.symbol, v, c, p.sector ? sectorKey(p.sector) : null, region, node);
      return;
    }
    if (full) {
      out.sources.set(symbol!, { symbol: symbol!, name: p?.name ?? symbol!, source: full.sourceName, asOf: full.asOf, proxy: full.proxy, full: true });
      node.source = full.proxy ? `${full.sourceName} (stand-in for ${symbol})` : full.sourceName;
      const geo = full.countries && Object.keys(full.countries).length ? full.countries : null;
      const sec = full.sectors && Object.keys(full.sectors).length ? full.sectors : null;
      const before = out.mix.stocks;
      const outer = attr;
      attr = { geo: outer.geo || !!geo, sec: outer.sec || !!sec };
      const rows = full.rows.filter((r) => r.w > 0);
      const sum = rows.reduce((s, r) => s + r.w, 0) || 1;
      // Some sources list only the securities (RBC): their published asset mix says how much is
      // cash, bonds and other besides, and the listed stocks make up the rest.
      const onlyStocks = !!full.mix && rows.every((r) => r.k === "stock");
      const stockPart = onlyStocks ? Math.max(0, Math.min(1, full.mix!.stock)) : 1;
      if (onlyStocks) {
        addMix("bonds", v * full.mix!.bond, node);
        addMix("cash", v * full.mix!.cash, node);
        addMix("other", v * Math.max(0, 1 - full.mix!.stock - full.mix!.bond - full.mix!.cash), node);
      }
      let unsectored = 0;
      for (const r of rows) {
        const x = (v * stockPart * r.w) / sum;
        if (r.k === "stock") {
          addStock(r.n, r.t, x, r.c, r.s, region, node);
          if (!r.s) unsectored += x;
        } else if (r.k === "fund") {
          // Fund codes like RBC:RBF8165 aren't tickers: classify those by name.
          const ci = classifyInstrument(r.t?.includes(":") ? null : r.t, r.n);
          const child: Node = { label: r.n, symbol: r.t, value: x, kind: "fund", children: [] };
          node.children.push(child);
          if (r.t && (profiles.get(r.t) || funds.get(r.t))) expand(r.t, x, ci.region, ci.assetClass, depth + 1, child);
          else noData(x, ci.region, ci.assetClass, child);
        } else addMix(r.k === "bond" ? "bonds" : r.k === "cash" ? "cash" : "other", x, node);
      }
      // Sources without sectors (SEC filings): use the fund's published sector weights.
      if (unsectored) spreadSectors(unsectored, p?.fund?.sectors ?? null);
      attr = outer;
      // The fund's own country / sector split covers all the stocks found inside it.
      const added = out.mix.stocks - before;
      if (geo && !outer.geo)
        for (const [c, w] of Object.entries(geo)) {
          add(out.countries, c, added * w);
          add(out.regions, regionOf(c), added * w);
        }
      if (sec && !outer.sec) for (const [k, w] of Object.entries(sec)) add(out.sectors, k, added * w);
      return;
    }
    const f = p?.fund;
    if (!p || !f) return noData(v, region, assetClass, node);
    out.sources.set(symbol!, { symbol: symbol!, name: p.name, source: "Yahoo Finance top holdings", asOf: null, proxy: null, full: false });
    node.source = "Yahoo Finance (top holdings only)";
    const stock = f.stock ?? 0;
    const bond = f.bond ?? 0;
    const cash = f.cash ?? 0;
    const known = stock + bond + cash;
    // Fund-of-funds: follow the child funds we have data for.
    const children = depth < 4 ? f.holdings.filter((c) => c.symbol && FUND_NAME.test(c.name) && (profiles.get(c.symbol.toUpperCase()) || funds.get(c.symbol.toUpperCase()))) : [];
    const childWeight = children.reduce((s, c) => s + c.weight, 0);
    if (childWeight >= 0.5) {
      for (const c of children) {
        const sym = c.symbol!.toUpperCase();
        const ci = classifyInstrument(sym, profiles.get(sym)?.name ?? c.name);
        const child: Node = { label: profiles.get(sym)?.name ?? c.name, symbol: sym, value: v * c.weight, kind: "fund", children: [] };
        node.children.push(child);
        expand(sym, v * c.weight, ci.region, ci.assetClass, depth + 1, child);
      }
      const rest = v * Math.max(0, 1 - childWeight);
      if (rest > 0) addMix(known && cash / known > 0.5 ? "cash" : "other", rest, node);
      return;
    }
    if (known <= 0) return noData(v, region, assetClass, node);
    addMix("bonds", v * bond, node);
    addMix("cash", v * cash, node);
    addMix("other", v * Math.max(0, 1 - known), node);
    if (stock <= 0) return;
    // Name the top holdings; the rest of the stocks stay unitemised.
    const stocks = v * stock;
    let named = 0;
    for (const c of f.holdings)
      if (!FUND_NAME.test(c.name)) {
        const x = v * c.weight;
        if (named + x > stocks) break;
        addStock(c.name, c.symbol, x, null, null, region, node);
        named += x;
      }
    // Named stocks got a region; sectors for the whole stock part come from the fund's weights.
    spreadSectors(named, f.sectors);
    addUnnamed(stocks - named, region, f.sectors, node);
  };

  for (const r of rows) {
    const v = r.h.marketValue;
    if (v <= 0) continue;
    out.total += v;
    const i = r.h.instrument;
    via = i.key;
    const node: Node = { label: r.profile?.name ?? i.name, symbol: r.symbol, value: v, kind: r.profile && !isFundProfile(r.profile) ? "stock" : "fund", children: [] };
    out.trees.set(i.key, node);
    if (i.vehicle === "cash" || (i.assetClass === "cash" && !r.profile)) addMix("cash", v, node);
    else if (!r.symbol) noData(v, i.region, i.assetClass, node);
    else expand(r.symbol, v, i.region, i.assetClass, 0, node);
  }
  for (const t of out.trees.values()) finish(t);
  out.companies = [...companies.values()].sort((a, b) => b.value - a.value);
  return out;
}

/** Turns each level's companies into its largest few plus "N other companies". */
function finish(n: Node) {
  for (const c of n.children) finish(c);
  if (n.stocks?.size) {
    const list = [...n.stocks.values()].sort((a, b) => b.value - a.value);
    const top = list.slice(0, 8).map((s): Node => ({ label: s.name, symbol: null, value: s.value, kind: "stock", children: [] }));
    const rest = list.slice(8);
    if (rest.length) top.push({ label: `${rest.length.toLocaleString("en-CA")} other companies`, symbol: null, value: rest.reduce((s, x) => s + x.value, 0), kind: "stocks", children: [] });
    n.children.unshift(...top);
    delete n.stocks;
  }
  n.children.sort((a, b) => (a.kind === "fund" ? 0 : 1) - (b.kind === "fund" ? 0 : 1) || b.value - a.value);
}

/** Share of one fund's stocks held in common with another (top holdings only when the full list isn't public). */
export function overlap(a: string, b: string, data: MarketData): { share: number; full: boolean } {
  const weights = (sym: string) => {
    const p = data.profiles.get(sym) ?? null;
    const lt = lookThrough([{ h: { marketValue: 1, instrument: classifyInstrument(sym, p?.name ?? sym) } as Holding, symbol: sym, profile: p, linked: false, feeOverride: null }], data);
    const stocks = lt.mix.stocks || 1;
    return { w: new Map(lt.companies.map((c) => [c.key, c.value / stocks])), full: [...lt.sources.values()].every((s) => s.full) };
  };
  const wa = weights(a);
  const wb = weights(b);
  let s = 0;
  for (const [k, w] of wa.w) s += Math.min(w, wb.w.get(k) ?? 0);
  return { share: s, full: wa.full && wb.full };
}

// ── Weighted characteristics ────────────────────────────────────────────────

export interface Weighted {
  value: number | null;
  /** Share of the portfolio (by value) the figure is based on. */
  coverage: number;
}

export function weighted(rows: Row[], f: (r: Row) => number | null, harmonic = false): Weighted {
  let sum = 0;
  let w = 0;
  let total = 0;
  for (const r of rows) {
    const v = r.h.marketValue;
    if (v <= 0) continue;
    total += v;
    const x = f(r);
    if (x === null || !Number.isFinite(x) || (harmonic && x <= 0)) continue;
    sum += v * (harmonic ? 1 / x : x);
    w += v;
  }
  if (!w) return { value: null, coverage: 0 };
  return { value: harmonic ? w / sum : sum / w, coverage: total ? w / total : 0 };
}

/** Annual fee as a fraction: the fund's MER, 0 for stocks and cash. Null when unknown. */
export function feeOf(r: Row): number | null {
  if (r.feeOverride !== null) return r.feeOverride;
  const i = r.h.instrument;
  if (i.vehicle === "cash" || i.assetClass === "cash" && !r.profile) return 0;
  if (r.profile && !isFundProfile(r.profile)) return 0;
  // A linked fund's fee isn't the fee on your units (plan fees differ): unknown until entered.
  if (r.linked) return null;
  return r.profile?.expenseRatio ?? null;
}

export const yieldOf = (r: Row): number | null => {
  if (r.h.instrument.vehicle === "cash") return null;
  return r.profile ? (r.profile.dividendYield ?? 0) : null;
};

export function peOf(r: Row): number | null {
  const p = r.profile;
  if (!p) return null;
  if (p.trailingPE && p.trailingPE > 0) return p.trailingPE;
  // Yahoo reports fund P/E as an earnings yield.
  const fpe = p.fund?.pe;
  if (fpe && fpe > 0) return fpe < 1 ? 1 / fpe : fpe;
  return null;
}


// ── Price history maths ─────────────────────────────────────────────────────

const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** Converts a USD price series to CAD with the CAD=X series (CAD per USD). */
export function inCad(h: History, fx: History | null | undefined): PricePoint[] {
  if (h.currency !== "USD" || !fx?.points.length) return h.points;
  const f = fx.points;
  let j = 0;
  return h.points.map((p) => {
    while (j + 1 < f.length && f[j + 1]!.d <= p.d) j++;
    const rate = f[j]!.p;
    return { d: p.d, c: p.c * rate, p: p.p * rate };
  });
}

/** Total return (dividends reinvested) over the last `days`, or since the start when `days` is null. */
export function periodReturn(points: PricePoint[], days: number | null): number | null {
  const last = points.at(-1);
  if (!last || points.length < 2) return null;
  if (days === null) return last.c / points[0]!.c - 1;
  const cutoff = ms(last.d) - days * 86_400_000;
  if (ms(points[0]!.d) > cutoff + 7 * 86_400_000) return null;
  let from = points[0]!;
  for (const p of points) {
    if (ms(p.d) > cutoff) break;
    from = p;
  }
  return last.c / from.c - 1;
}

/** Annualised return over the whole series. */
export function cagr(points: PricePoint[]): number | null {
  if (points.length < 2) return null;
  const years = (ms(points.at(-1)!.d) - ms(points[0]!.d)) / (365.25 * 86_400_000);
  if (years < 0.9) return null;
  return Math.pow(points.at(-1)!.c / points[0]!.c, 1 / years) - 1;
}

const periodsPerYear = (points: { d: string }[]) => {
  if (points.length < 3) return 52;
  const days = (ms(points.at(-1)!.d) - ms(points[0]!.d)) / 86_400_000 / (points.length - 1);
  return days < 3 ? 252 : days < 10 ? 52 : 12;
};

function returnsOf(values: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < values.length; i++) if (values[i - 1]! > 0) r.push(values[i]! / values[i - 1]! - 1);
  return r;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
const stdev = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(xs.length - 1, 1));
};

/** Annualised volatility (standard deviation of returns). */
export function volatility(points: { d: string; c: number }[]): number | null {
  const r = returnsOf(points.map((p) => p.c));
  if (r.length < 10) return null;
  return stdev(r) * Math.sqrt(periodsPerYear(points));
}

export function maxDrawdown(points: { d: string; c: number }[]): { depth: number; peak: string; trough: string; recovered: string | null } | null {
  if (points.length < 2) return null;
  let peak = points[0]!;
  let best = { depth: 0, peak: peak.d, trough: peak.d, recovered: null as string | null };
  let current: typeof best | null = null;
  for (const p of points) {
    if (p.c >= peak.c) {
      if (current && !current.recovered) current.recovered = p.d;
      peak = p;
      continue;
    }
    const depth = p.c / peak.c - 1;
    if (depth < best.depth) {
      best = { depth, peak: peak.d, trough: p.d, recovered: null };
      current = best;
    }
  }
  return best.depth < 0 ? best : null;
}

/** Drawdown from the running peak at each point (≤ 0). */
export const drawdownSeries = (points: { d: string; c: number }[]) => {
  let peak = -Infinity;
  return points.map((p) => {
    peak = Math.max(peak, p.c);
    return { d: p.d, c: p.c / peak - 1 };
  });
};

/** Each series sampled on a shared date grid (carrying the last value forward; null before it starts). */
function align(series: Map<string, PricePoint[]>): { dates: string[]; values: Map<string, (number | null)[]> } {
  const grid = [...series.values()].reduce((a, b) => (b.length > a.length ? b : a), [] as PricePoint[]).map((p) => p.d);
  const values = new Map<string, (number | null)[]>();
  for (const [k, pts] of series) {
    let j = -1;
    values.set(
      k,
      grid.map((d) => {
        while (j + 1 < pts.length && pts[j + 1]!.d <= d) j++;
        return j >= 0 ? pts[j]!.c : null;
      }),
    );
  }
  return { dates: grid, values };
}

/**
 * Today's weights held through history, rebalanced every period: what this mix would have done.
 * Holdings without history yet are left out until their data starts (weights renormalised).
 */
export function backtest(weights: Map<string, number>, series: Map<string, PricePoint[]>): { d: string; c: number }[] {
  const used = new Map([...series].filter(([k]) => (weights.get(k) ?? 0) > 0));
  if (!used.size) return [];
  const { dates, values } = align(used);
  const out = [{ d: dates[0]!, c: 100 }];
  for (let t = 1; t < dates.length; t++) {
    let r = 0;
    let w = 0;
    for (const [k, vs] of values) {
      const a = vs[t - 1];
      const b = vs[t];
      if (a == null || b == null || a <= 0) continue;
      const wk = weights.get(k)!;
      r += wk * (b / a - 1);
      w += wk;
    }
    out.push({ d: dates[t]!, c: out[t - 1]!.c * (1 + (w ? r / w : 0)) });
  }
  return out;
}

/** Pairwise correlation of period returns (null when fewer than 20 overlapping periods). */
export function correlations(series: Map<string, PricePoint[]>): { keys: string[]; matrix: (number | null)[][] } {
  const keys = [...series.keys()];
  const { values } = align(series);
  const rets = keys.map((k) => {
    const v = values.get(k)!;
    return v.map((x, i) => (i && x != null && v[i - 1] != null && v[i - 1]! > 0 ? x / v[i - 1]! - 1 : null));
  });
  const matrix = keys.map((_, i) =>
    keys.map((__, j) => {
      if (i === j) return 1;
      const a: number[] = [];
      const b: number[] = [];
      rets[i]!.forEach((x, t) => {
        const y = rets[j]![t];
        if (x != null && y != null) {
          a.push(x);
          b.push(y);
        }
      });
      if (a.length < 20) return null;
      const ma = mean(a);
      const mb = mean(b);
      let num = 0;
      let da = 0;
      let db = 0;
      for (let t = 0; t < a.length; t++) {
        num += (a[t]! - ma) * (b[t]! - mb);
        da += (a[t]! - ma) ** 2;
        db += (b[t]! - mb) ** 2;
      }
      return da && db ? num / Math.sqrt(da * db) : null;
    }),
  );
  return { keys, matrix };
}

// ── Costs and taxes ─────────────────────────────────────────────────────────

export type FeeTier = "none" | "low" | "typical" | "high" | "very-high";

/** Where an annual fee sits against what Canadian investors typically pay. */
export function feeTier(fee: number | null): FeeTier | null {
  if (fee === null) return null;
  if (fee === 0) return "none";
  if (fee <= 0.0025) return "low";
  if (fee <= 0.006) return "typical";
  if (fee <= 0.015) return "high";
  return "very-high";
}

export const FEE_TIER: Record<FeeTier, { label: string; tone: "pos" | "neutral" | "warn" | "neg"; range: string; examples: string }> = {
  none: { label: "No fund fee", tone: "pos", range: "0%", examples: "Individual stocks, cash" },
  low: { label: "Low", tone: "pos", range: "up to 0.25%", examples: "Broad index ETFs (XEQT 0.20%, VFV 0.09%)" },
  typical: { label: "Typical", tone: "neutral", range: "0.25–0.60%", examples: "Robo-advisors, factor and sector ETFs" },
  high: { label: "High", tone: "warn", range: "0.60–1.50%", examples: "Active ETFs, cheaper mutual funds, many pension funds" },
  "very-high": { label: "Very high", tone: "neg", range: "over 1.50%", examples: "Bank and advisor-sold mutual funds" },
};

/** Value after `years` growing at `growth` less the fee, vs without the fee. */
export function feeDrag(value: number, fee: number, growth: number, years: number): number {
  return value * (Math.pow(1 + growth, years) - Math.pow(1 + growth - fee, years));
}

export interface Outcome {
  /** Value in `years` before fees. */
  gross: number;
  /** Growth lost to fees over the period. */
  fees: number;
  /** Tax when the money comes out (sale or withdrawal). */
  tax: number;
  /** What you'd keep. */
  kept: number;
  /** Explanation of the tax line. */
  taxNote: string;
}

/**
 * What one account might look like after `years`: growth, fees taken along the way, and the
 * tax when the money comes out. Canadian rules: TFSA/FHSA tax-free, RRSP/pension withdrawals
 * taxed as income, non-registered gains 50% taxable (dividend tax along the way is ignored).
 */
export function outcome(o: { value: number; cost: number | null; fee: number; tax: Account["tax"]; growth: number; years: number; marginalRate: number }): Outcome {
  const gross = o.value * Math.pow(1 + o.growth, o.years);
  const net = o.value * Math.pow(1 + o.growth - o.fee, o.years);
  let tax = 0;
  let taxNote = "";
  if (o.tax === "tax-free") taxNote = "Tax-free account: no tax on growth or withdrawals.";
  else if (o.tax === "tax-deferred") {
    tax = net * o.marginalRate;
    taxNote = "Withdrawals are taxed as income at your marginal rate (the deduction came when you contributed).";
  } else if (o.tax === "taxable") {
    const gain = Math.max(0, net - (o.cost ?? o.value));
    tax = gain * 0.5 * o.marginalRate;
    taxNote = "Half of the capital gain is taxable at your marginal rate when you sell.";
  }
  return { gross, fees: gross - net, tax, kept: net - tax, taxNote };
}

// ── Insights ────────────────────────────────────────────────────────────────

export type InsightCategory = "concentration" | "diversification" | "fees" | "tax" | "risk" | "cash" | "allocation" | "data";

export interface Insight {
  level: "warn" | "info" | "good";
  category: InsightCategory;
  title: string;
  /** Why it matters. */
  why: string;
  /** What could be done about it (never advice to buy a specific product). */
  action?: string;
  /** Approximate dollar amount the insight is about (shown unless privacy mode is on). */
  amount?: number;
  /** What the amount is: "a year", "at stake"… */
  amountLabel?: string;
  /** Share of the portfolio involved (0–1), for a visual bar. */
  share?: number;
  accounts?: string[];
  holdings?: { key: string; label: string }[];
}

export interface InsightInput {
  rows: Row[];
  lt: LookThrough;
  accounts: Map<string, Account>;
  data: MarketData;
  fee: Weighted;
  risk?: { drawdown: number | null; volatility: number | null } | null;
  policyRate?: number | null;
  birthYear?: number | null;
}

const ALL_IN_ONE = /^(XEQT|VEQT|ZEQT|XGRO|VGRO|ZGRO|XBAL|VBAL|ZBAL|XCNS|VCNS|ZCON|VRIF|XINC|VCIP|VRET|GEQT|GGRO|GBAL|HEQT|HGRO|HBAL|TGED|EQT)$/;
const pctText = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
const baseOf = (s: string) => s.toUpperCase().replace(/\.(TO|V|NE|CN)$/, "").replace(/-U$/, "");

export function insights(i: InsightInput): Insight[] {
  const out: Insight[] = [];
  const { rows, lt } = i;
  const total = lt.total;
  if (!total) return out;
  const stocks = lt.mix.stocks || 1;
  const label = (r: Row) => r.h.instrument.symbol ?? r.h.instrument.name;
  const ref = (r: Row) => ({ key: r.h.instrument.key, label: label(r) });
  const acctNames = (r: Row) => r.h.lots.map((l) => i.accounts.get(l.accountKey)?.name ?? l.accountName);
  const isStock = (r: Row) => (r.profile ? !isFundProfile(r.profile) : r.h.instrument.vehicle === "stock");

  // Concentration in single companies.
  for (const r of rows) {
    const w = r.h.marketValue / total;
    if (isStock(r) && w >= 0.1)
      out.push({
        level: w >= 0.2 ? "warn" : "info",
        category: "concentration",
        title: `${label(r)} is ${pctText(w)} of the portfolio`,
        why: "One company's bad year (a lawsuit, a missed product, a fraud) hits the whole portfolio. Index funds hold hundreds of companies so no single one can do this.",
        action: "Many investors cap any single stock at 5–10%. New money can go elsewhere instead of selling, which avoids triggering capital gains.",
        amount: r.h.marketValue,
        amountLabel: "at stake",
        share: w,
        accounts: acctNames(r),
        holdings: [ref(r)],
      });
  }
  const top = lt.companies[0];
  if (top && top.value / total >= 0.04 && top.via.size > 1)
    out.push({
      level: "info",
      category: "concentration",
      title: `${pctText(top.value / total)} of everything you own is ${top.name}`,
      why: `It reaches you through ${top.via.size} different holdings, so it's bigger than any one of them suggests.`,
      action: "Nothing to fix if you're comfortable with it. Just know that this company's results move more of your money than any other.",
      amount: top.value,
      amountLabel: "exposure",
      share: top.value / total,
      holdings: [...top.via.keys()].map((k) => {
        const r = rows.find((x) => x.h.instrument.key === k);
        return { key: k, label: r ? label(r) : k };
      }),
    });
  const top10 = lt.companies.slice(0, 10).reduce((s, c) => s + c.value, 0);
  if (top10 / stocks >= 0.35)
    out.push({
      level: "info",
      category: "concentration",
      title: `Your 10 largest companies are ${pctText(top10 / stocks)} of your stocks`,
      why: "Even index funds are top-heavy right now: a handful of US tech giants drive a large part of the result.",
      share: top10 / total,
    });

  // Sectors.
  const [bigSector, bigValue] = [...lt.sectors].filter(([k]) => k !== "unknown").sort((a, b) => b[1] - a[1])[0] ?? [];
  if (bigSector && bigValue! / stocks >= 0.35)
    out.push({
      level: "info",
      category: "diversification",
      title: `${SECTOR_LABEL[bigSector] ?? bigSector} is ${pctText(bigValue! / stocks)} of your stocks`,
      why: "The world market is about 25% technology and no other sector above 20%. A sector this large makes results depend on one industry's cycle.",
      action: "Broad index funds keep sectors at market weight. Sector funds and single stocks are what usually tilt this.",
      share: bigValue! / total,
    });

  // Regions / home bias.
  const ca = (lt.regions.get("CA") ?? 0) / stocks;
  const us = (lt.regions.get("US") ?? 0) / stocks;
  if (lt.mix.stocks > 0) {
    if (ca >= 0.4)
      out.push({
        level: "info",
        category: "diversification",
        title: `Canada is ${pctText(ca)} of your stocks`,
        why: "Canada is about 3% of world stock markets and heavy in banks and energy, so a large home share concentrates risk in a few industries.",
        action: "All-in-one ETFs hold about 25–30% Canada as a balance between diversification and tax/currency benefits.",
        share: (lt.regions.get("CA") ?? 0) / total,
      });
    else if (ca < 0.08)
      out.push({
        level: "info",
        category: "diversification",
        title: `Canada is only ${pctText(ca)} of your stocks`,
        why: "Canadian dividends get the dividend tax credit in taxable accounts and carry no currency risk, which is why most Canadian portfolios hold some.",
        share: (lt.regions.get("CA") ?? 0) / total,
      });
    if (us >= 0.75)
      out.push({
        level: "info",
        category: "diversification",
        title: `The US is ${pctText(us)} of your stocks`,
        why: "That's above the US share of world markets (about 65%). Long stretches where the US lagged (2000–2009) are why investors spread across regions.",
        share: (lt.regions.get("US") ?? 0) / total,
      });
  }

  // Fees.
  if (i.fee.value !== null) {
    const tier = feeTier(i.fee.value)!;
    if (i.fee.value >= 0.004)
      out.push({
        level: "warn",
        category: "fees",
        title: `Average fee ${(i.fee.value * 100).toFixed(2)}% a year (${FEE_TIER[tier].label.toLowerCase()})`,
        why: "Fees come out of the fund every day whether it goes up or down, and they compound: over 25 years, 1% a year takes about a fifth of the end balance.",
        action: "Broad index ETFs cost 0.05–0.25%. Check the Costs section for which holdings drive this.",
        amount: i.fee.value * total,
        amountLabel: "a year",
      });
    else if (i.fee.value <= 0.0025 && i.fee.coverage > 0.6)
      out.push({ level: "good", category: "fees", title: `Low fees: ${(i.fee.value * 100).toFixed(2)}% a year on average`, why: "Cheap, broad funds keep more of the return; this is one of the few things investors fully control.", amount: i.fee.value * total, amountLabel: "a year" });
  }
  for (const r of rows) {
    const f = feeOf(r);
    if (f !== null && f >= 0.01 && r.h.marketValue / total >= 0.02)
      out.push({
        level: "warn",
        category: "fees",
        title: `${label(r)} charges ${(f * 100).toFixed(2)}% a year`,
        why: "Funds above 1% are usually actively managed, and most of them trail their index after fees over 10+ years.",
        action: "Compare it with a low-cost fund of the same mix. In a pension plan, check which cheaper index options the plan offers.",
        amount: r.h.marketValue * f,
        amountLabel: "a year",
        share: r.h.marketValue / total,
        accounts: acctNames(r),
        holdings: [ref(r)],
      });
    const load = r.profile?.deferredLoad ?? 0;
    if (load > 0)
      out.push({
        level: "warn",
        category: "fees",
        title: `${label(r)} may charge ${pctText(load)} if you sell (deferred sales charge)`,
        why: "Some older mutual funds charge an exit fee that shrinks each year you hold them. New sales with these charges were banned in Canada in 2022, but older units may still carry them.",
        action: "Check the fund's facts document or ask the dealer before selling.",
        amount: r.h.marketValue * load,
        amountLabel: "possible exit fee",
        holdings: [ref(r)],
        accounts: acctNames(r),
      });
  }

  // Overlap.
  const funds = rows.filter((r) => r.symbol && r.profile && isFundProfile(r.profile) && (r.profile.fund?.stock ?? 0) > 0.5 && r.h.marketValue / total >= 0.03);
  const allInOne = funds.filter((r) => ALL_IN_ONE.test(baseOf(r.h.instrument.symbol ?? "")));
  if (allInOne.length && funds.length > allInOne.length)
    out.push({
      level: "info",
      category: "diversification",
      title: `${allInOne.map(label).join(", ")} already ${allInOne.length > 1 ? "hold" : "holds"} the whole world`,
      why: "All-in-one funds are complete portfolios. Other equity funds next to them don't add diversification; they tilt the mix towards what they hold.",
      action: "Fine if the tilt is deliberate. Otherwise one all-in-one fund per account is simpler.",
      holdings: funds.map(ref),
    });
  for (let a = 0; a < funds.length; a++)
    for (let b = a + 1; b < funds.length; b++) {
      const o = overlap(funds[a]!.symbol!, funds[b]!.symbol!, i.data);
      if (o.share >= 0.4)
        out.push({
          level: "info",
          category: "diversification",
          title: `${label(funds[a]!)} and ${label(funds[b]!)} overlap by ${o.full ? "" : "at least "}${pctText(o.share)}`,
          why: "They mostly hold the same companies, so owning both is close to owning more of one.",
          action: "Consolidating reduces complexity, but selling in a taxable account can trigger capital gains.",
          holdings: [ref(funds[a]!), ref(funds[b]!)],
        });
    }

  // Withholding tax by account type.
  for (const r of rows) {
    const p = r.profile;
    const y = p?.dividendYield ?? 0;
    if (!p || y < 0.005) continue;
    const usListed = p.currency === "USD" && !isCanadianListing(r.h.instrument.symbol ?? "");
    const holdsUsFund = isCanadianListing(r.h.instrument.symbol ?? "") && (p.fund?.holdings ?? []).some((c) => c.weight > 0.3 && c.symbol && !isCanadianListing(c.symbol) && FUND_NAME.test(c.name));
    for (const lot of r.h.lots) {
      const a = i.accounts.get(lot.accountKey);
      if (!a) continue;
      if (usListed && (a.type === "tfsa" || a.type === "fhsa" || a.type === "resp"))
        out.push({
          level: "warn",
          category: "tax",
          title: `${label(r)} in ${a.name}: 15% of its dividends go to the US`,
          why: `The US withholds 15% of dividends paid to a ${a.type.toUpperCase()}, and Canada doesn't refund it. The same holding in an RRSP is exempt under the tax treaty.`,
          action: "Hold US-listed dividend payers in the RRSP and growth or Canadian-listed funds in the TFSA.",
          amount: lot.marketValue * y * 0.15,
          amountLabel: "a year",
          accounts: [a.name],
          holdings: [ref(r)],
        });
      if (usListed && a.tax === "tax-deferred")
        out.push({ level: "good", category: "tax", title: `${label(r)} in ${a.name}: no US withholding tax`, why: "RRSPs are exempt from US withholding on US-listed holdings, the most tax-efficient place for them.", accounts: [a.name], holdings: [ref(r)] });
      if (holdsUsFund && a.tax === "tax-deferred")
        out.push({
          level: "info",
          category: "tax",
          title: `${label(r)} in ${a.name} holds a US-listed fund`,
          why: "The 15% US withholding happens inside the fund, so even the RRSP can't avoid it.",
          action: "A US-listed equivalent held directly in the RRSP avoids it, but needs US dollars (currency conversion costs).",
          amount: lot.marketValue * y * 0.15,
          amountLabel: "a year",
          accounts: [a.name],
          holdings: [ref(r)],
        });
    }
  }

  // Tax-loss harvesting candidates.
  for (const r of rows)
    for (const lot of r.h.lots) {
      const a = i.accounts.get(lot.accountKey);
      const loss = lot.bookValue !== null ? lot.marketValue - lot.bookValue : 0;
      if (a?.tax === "taxable" && loss <= -500)
        out.push({
          level: "info",
          category: "tax",
          title: `${label(r)} in ${a.name} is below what you paid`,
          why: "Selling at a loss in a taxable account creates a capital loss that offsets capital gains this year, the past 3 years or the future.",
          action: "Buy a similar but not identical fund, or wait 30 days, to avoid the superficial-loss rule.",
          amount: -loss,
          amountLabel: "loss available",
          accounts: [a.name],
          holdings: [ref(r)],
        });
    }

  // Cash drag.
  const cashShare = lt.mix.cash / total;
  if (cashShare >= 0.1)
    out.push({
      level: "info",
      category: "cash",
      title: `${pctText(cashShare)} of invested money is sitting in cash`,
      why: `Cash is safe but grows slowly${i.policyRate != null ? ` (Bank of Canada rate ${i.policyRate.toFixed(2)}%)` : ""}. Fine for near-term needs, a drag on long-term growth.`,
      amount: lt.mix.cash,
      amountLabel: "in cash",
      share: cashShare,
    });

  if (i.birthYear) {
    const age = new Date().getFullYear() - i.birthYear;
    const bonds = lt.mix.bonds / total;
    out.push({
      level: "info",
      category: "allocation",
      title: `${pctText(bonds)} bonds at age ${age}`,
      why: `A common rule of thumb puts investors at about ${Math.max(0, Math.min(60, age - 20))}% bonds (age minus 20). Less in bonds means more growth and bigger swings.`,
      share: bonds,
    });
  }

  if (i.risk?.drawdown != null)
    out.push({
      level: "info",
      category: "risk",
      title: `Today's mix once fell ${pctText(Math.abs(i.risk.drawdown))} from a peak`,
      why: `That's the worst drop over the period in the backtest${i.risk.volatility != null ? `, with typical yearly swings of about ±${pctText(i.risk.volatility)}` : ""}. Falls like this happen every several years.`,
      action: "If a fall this size would make you sell, the mix may be too aggressive for you.",
      amount: Math.abs(i.risk.drawdown) * total,
      amountLabel: "at today's value",
    });

  const unlinked = rows.filter((r) => !r.profile && r.h.instrument.vehicle !== "cash" && r.h.instrument.assetClass !== "cash");
  if (unlinked.length)
    out.push({
      level: "info",
      category: "data",
      title: `${unlinked.length} holding${unlinked.length > 1 ? "s have" : " has"} no market data`,
      why: "Without data, the analysis only guesses what's inside from the name.",
      action: "Open it from Holdings and link it to a ticker: the fund's own code, or a similar ETF as a stand-in.",
      amount: unlinked.reduce((s, r) => s + r.h.marketValue, 0),
      amountLabel: "not analysed",
      share: unlinked.reduce((s, r) => s + r.h.marketValue, 0) / total,
      holdings: unlinked.map(ref),
      accounts: [...new Set(unlinked.flatMap(acctNames))],
    });

  const order = { warn: 0, info: 1, good: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level] || (b.amount ?? 0) - (a.amount ?? 0));
}

// ── Cost breakdown ──────────────────────────────────────────────────────────

export interface FeeData {
  management: number | null;
  mer: number | null;
  ter: number | null;
  source: string;
}

export type CostStatus = "published" | "entered" | "estimate" | "none" | "not-published";

export interface CostLine {
  key: string;
  label: string;
  /** Fraction of the holding's value (per year, or once for one-off costs). */
  rate: number | null;
  amount: number | null;
  when: "yearly" | "one-off";
  status: CostStatus;
  source?: string;
  /** What it is and why it applies (or doesn't). */
  note: string;
  /** Part of another line (e.g. the management fee inside the MER): not added to the total. */
  part?: boolean;
}

/** Typical yields, scaled to the fund's actual yield to split its income by origin. */
const TYPICAL_YIELD = { CA: 0.028, US: 0.012, foreign: 0.028, bonds: 0.035 };
/** Typical withholding on non-US foreign dividends (developed and emerging markets average). */
const INTL_WITHHOLDING = 0.1;

export function costBreakdown(i: { row: Row; fees: FeeData | null; lt: LookThrough | null; accounts: Map<string, Account>; taxRate: number }): CostLine[] {
  const { row, fees, lt } = i;
  const p = row.profile;
  const v = row.h.marketValue;
  const inst = row.h.instrument;
  const fund = p ? isFundProfile(p) : inst.vehicle === "etf" || inst.vehicle === "fund";
  const usListed = !!p && p.currency === "USD" && !isCanadianListing(inst.symbol ?? "") && !row.linked;
  const lines: CostLine[] = [];
  const line = (l: Omit<CostLine, "amount"> & { amount?: number | null }) => lines.push({ ...l, amount: l.amount ?? (l.rate !== null ? l.rate * v : null) });
  if (inst.vehicle === "cash") return lines;

  // Fund fees.
  const own = !row.linked ? fees : null;
  const publishedMer = own?.mer ?? (!row.linked ? (p?.expenseRatio ?? null) : null);
  if (!fund) line({ key: "mer", label: "Fund fees (MER)", rate: 0, when: "yearly", status: "none", note: "Individual stocks have no fund fees." });
  else if (row.feeOverride !== null)
    line({ key: "mer", label: "Fund fees (MER)", rate: row.feeOverride, when: "yearly", status: "entered", note: "The fee you entered, e.g. from your plan statement. Taken out of the fund's value daily; you never see a bill." });
  else if (publishedMer !== null)
    line({
      key: "mer",
      label: "Fund fees (MER)",
      rate: publishedMer,
      when: "yearly",
      status: "published",
      source: own?.mer != null ? own.source : "Yahoo Finance",
      note: "Management expense ratio: everything the fund charges, taken out of its value daily. You never see a bill.",
    });
  else
    line({
      key: "mer",
      label: "Fund fees (MER)",
      rate: null,
      when: "yearly",
      status: "not-published",
      note: row.linked
        ? "Your plan's fee isn't published with the linked fund's data. Enter it from your plan statement (Your position, Your fee)."
        : "No available source publishes this fund's MER.",
    });
  if (fund && row.feeOverride === null) {
    const mgmt = own?.management ?? null;
    const mer = lines.find((l) => l.key === "mer")!.rate;
    line({
      key: "mgmt",
      label: "Management fee",
      rate: mgmt,
      when: "yearly",
      status: mgmt !== null ? "published" : "not-published",
      source: own?.source,
      part: true,
      note: mgmt !== null ? "What the manager charges for running the fund (part of the MER)." : "Not split out by the available sources; it's inside the MER.",
    });
    line({
      key: "operating",
      label: "Operating costs and sales tax",
      rate: mgmt !== null && mer !== null ? Math.max(0, mer - mgmt) : null,
      when: "yearly",
      status: mgmt !== null && mer !== null ? "published" : "not-published",
      source: own?.source,
      part: true,
      note: "Audit, legal, custody, index licensing and GST/HST: the MER minus the management fee.",
    });
  }
  // Trading inside the fund (an underlying fund's TER applies to units that hold it, too).
  if (fund)
    line({
      key: "ter",
      label: "Trading costs inside the fund (TER)",
      rate: fees?.ter ?? null,
      when: "yearly",
      status: fees?.ter != null ? "published" : "not-published",
      source: fees?.source,
      note: fees?.ter != null ? "Brokerage commissions the fund pays when it trades, on top of the MER." : "Not published by the available sources; usually 0-0.02% for index ETFs, more for active funds.",
    });

  // Where the income comes from, to estimate withholding and the tax on it.
  const y = p?.dividendYield ?? null;
  const share = (k: Region) => (lt && lt.total ? (lt.regions.get(k) ?? 0) / lt.total : 0);
  const ca = lt ? share("CA") : inst.region === "CA" ? 1 : 0;
  const us = lt ? share("US") : inst.region === "US" ? 1 : 0;
  const foreign = lt ? share("intl") + share("emerging") : inst.region === "intl" || inst.region === "emerging" ? 1 : 0;
  const bonds = lt && lt.total ? lt.mix.bonds / lt.total : inst.assetClass === "fixed-income" ? 1 : 0;
  const typical = ca * TYPICAL_YIELD.CA + us * TYPICAL_YIELD.US + foreign * TYPICAL_YIELD.foreign + bonds * TYPICAL_YIELD.bonds;
  const scale = y !== null && typical > 0 ? y / typical : 1;
  const inc = { ca: ca * TYPICAL_YIELD.CA * scale, us: us * TYPICAL_YIELD.US * scale, foreign: foreign * TYPICAL_YIELD.foreign * scale, bonds: bonds * TYPICAL_YIELD.bonds * scale };

  // Foreign withholding tax, per account.
  let withheld = 0;
  const why = new Set<string>();
  for (const lot of row.h.lots) {
    const a = i.accounts.get(lot.accountKey);
    const w = lot.marketValue / (v || 1);
    if (!a || a.tax === "taxable") {
      why.add("non-registered accounts get it back as a foreign tax credit");
      continue;
    }
    const usLost = usListed && a.tax === "tax-deferred" ? 0 : 0.15;
    withheld += w * (inc.us * usLost + inc.foreign * INTL_WITHHOLDING);
    why.add(
      a.tax === "tax-free"
        ? "a TFSA or FHSA can't recover it"
        : usListed
          ? "an RRSP is exempt from US withholding on US-listed holdings, but not other countries'"
          : "an RRSP or pension can't recover tax withheld inside a Canadian-listed or plan fund",
    );
  }
  const hasForeign = inc.us + inc.foreign > 0;
  line({
    key: "withholding",
    label: "Foreign withholding tax",
    rate: hasForeign ? withheld : 0,
    when: "yearly",
    status: hasForeign ? "estimate" : "none",
    note: hasForeign ? `Countries keep part of dividends paid abroad (US 15%, others about 10%): ${[...why].join("; ")}. Estimated from where this holding's stocks are.` : "No foreign dividends.",
  });

  // Tax on distributions in non-registered accounts.
  const taxableShare = row.h.lots.filter((l) => i.accounts.get(l.accountKey)?.tax === "taxable").reduce((s, l) => s + l.marketValue, 0) / (v || 1);
  const r = i.taxRate;
  const distTax = taxableShare * (inc.ca * Math.max(0, r - 0.15) + (inc.us + inc.foreign + inc.bonds) * r);
  line({
    key: "disttax",
    label: "Tax on distributions",
    rate: taxableShare ? distTax : 0,
    when: "yearly",
    status: taxableShare ? "estimate" : "none",
    note: taxableShare
      ? `Dividends and interest paid in a non-registered account are taxed each year: about ${Math.round(r * 100)}% on foreign income and interest, less on Canadian dividends (dividend tax credit). Rough estimate.`
      : "Held in registered accounts: no yearly tax on what it pays out.",
  });

  // One-off costs when selling.
  const load = !row.linked ? Math.max(p?.deferredLoad ?? 0, 0) : 0;
  if (fund && (p?.quoteType === "MUTUALFUND" || row.linked))
    line({
      key: "exit",
      label: "Exit fee (deferred sales charge)",
      rate: load || null,
      when: "one-off",
      status: load ? "published" : "not-published",
      source: load ? "Yahoo Finance" : undefined,
      note: load ? "Charged if you sell within the schedule (shrinks each year)." : "Not published by the available sources. New sales with exit fees were banned in Canada in 2022; check your plan or the fund facts for older units.",
    });
  else line({ key: "exit", label: "Exit fee", rate: 0, when: "one-off", status: "none", note: "Exchange-traded: no sales charges (your broker's commission, often $0, applies)." });
  const spread = !row.linked && p?.bid && p?.ask && p.ask > p.bid ? (p.ask - p.bid) / ((p.ask + p.bid) / 2) / 2 : null;
  if (!row.linked && (p?.quoteType === "ETF" || p?.quoteType === "EQUITY"))
    line({ key: "spread", label: "Cost of selling (bid-ask spread)", rate: spread, when: "one-off", status: spread !== null ? "estimate" : "not-published", note: "About half the gap between the buy and sell price, lost when you trade." });
  if (usListed)
    line({ key: "fx", label: "Currency conversion", rate: 0.015, when: "one-off", status: "estimate", note: "Converting USD sale proceeds to CAD at a typical brokerage rate (1-2.5%). Norbert's gambit avoids most of it." });
  return lines;
}

/** Yearly cost of the known lines; `missing` when the fund fee itself is unknown. */
export const yearlyCost = (lines: CostLine[]) => {
  const known = lines.filter((l) => l.when === "yearly" && !l.part);
  return { amount: known.reduce((s, l) => s + (l.amount ?? 0), 0), rate: null as number | null, missing: known.some((l) => l.key === "mer" && l.status === "not-published") };
};
