import type { AssetClass, Instrument, Region, Vehicle } from "./model";

/**
 * Classification of securities for allocation views. Wealthica's own fields are too coarse
 * ("Canadian Stocks" / "US Stocks", "Equities" / "Others"), so ETFs get look-through here.
 * Lookup order: user override → known table → name heuristics → fallback.
 */

type Known = [assetClass: AssetClass, region: Region, vehicle: Vehicle];

// Common Canadian-listed ETFs (by base symbol, .TO stripped).
const KNOWN_CA_ETFS: Record<string, Known> = {
  VFV: ["equity", "US", "etf"], VSP: ["equity", "US", "etf"], XUS: ["equity", "US", "etf"], ZSP: ["equity", "US", "etf"],
  XUU: ["equity", "US", "etf"], VUN: ["equity", "US", "etf"], QQC: ["equity", "US", "etf"], ZQQ: ["equity", "US", "etf"],
  XIC: ["equity", "CA", "etf"], VCN: ["equity", "CA", "etf"], ZCN: ["equity", "CA", "etf"], XIU: ["equity", "CA", "etf"],
  VDY: ["equity", "CA", "etf"], XEI: ["equity", "CA", "etf"], ZDV: ["equity", "CA", "etf"], CDZ: ["equity", "CA", "etf"],
  XEF: ["equity", "intl", "etf"], VIU: ["equity", "intl", "etf"], ZEA: ["equity", "intl", "etf"], VIDY: ["equity", "intl", "etf"],
  XEC: ["equity", "emerging", "etf"], VEE: ["equity", "emerging", "etf"], ZEM: ["equity", "emerging", "etf"],
  VXC: ["equity", "global", "etf"], XAW: ["equity", "global", "etf"], VEQT: ["equity", "global", "etf"], XEQT: ["equity", "global", "etf"],
  ZGRO: ["balanced", "global", "etf"], VGRO: ["balanced", "global", "etf"], XGRO: ["balanced", "global", "etf"],
  VBAL: ["balanced", "global", "etf"], XBAL: ["balanced", "global", "etf"], VCNS: ["balanced", "global", "etf"],
  XRE: ["real-estate", "CA", "etf"], ZRE: ["real-estate", "CA", "etf"], VRE: ["real-estate", "CA", "etf"],
  XBB: ["fixed-income", "CA", "etf"], ZAG: ["fixed-income", "CA", "etf"], VAB: ["fixed-income", "CA", "etf"],
  CASH: ["cash", "CA", "etf"], PSA: ["cash", "CA", "etf"], HSAV: ["cash", "CA", "etf"],
  ZMMK: ["cash", "CA", "etf"], CSAV: ["cash", "CA", "etf"],
};

// Common US-listed ETFs.
const KNOWN_US_ETFS: Record<string, Known> = {
  SPY: ["equity", "US", "etf"], VOO: ["equity", "US", "etf"], IVV: ["equity", "US", "etf"], VTI: ["equity", "US", "etf"],
  QQQ: ["equity", "US", "etf"], QQQM: ["equity", "US", "etf"], SCHD: ["equity", "US", "etf"], VYM: ["equity", "US", "etf"],
  JEPI: ["equity", "US", "etf"], JEPQ: ["equity", "US", "etf"], DGRO: ["equity", "US", "etf"], SCHG: ["equity", "US", "etf"],
  VXUS: ["equity", "intl", "etf"], VEA: ["equity", "intl", "etf"], IEFA: ["equity", "intl", "etf"], VWO: ["equity", "emerging", "etf"],
  VT: ["equity", "global", "etf"], BND: ["fixed-income", "US", "etf"], AGG: ["fixed-income", "US", "etf"], VNQ: ["real-estate", "US", "etf"],
};

/** US-listed ADRs of foreign companies → region by issuer country. */
const KNOWN_ADRS: Record<string, Region> = {
  INFY: "emerging", WIT: "emerging", HDB: "emerging", IBN: "emerging", TSM: "emerging", BABA: "emerging",
  ASML: "intl", NVO: "intl", SAP: "intl", TM: "intl", SONY: "intl", SHEL: "intl", BP: "intl", UL: "intl",
};

export const isCanadianListing = (symbol: string) => /\.(TO|V|NE|CN)$/i.test(symbol);
export const baseSymbol = (symbol: string) => symbol.toUpperCase().replace(/\.(TO|V|NE|CN|U)$/i, "");

export type InstrumentOverride = Partial<Pick<Instrument, "assetClass" | "region" | "vehicle">>;

export function instrumentKey(symbol: string | null, name: string): string {
  return symbol ? symbol.toUpperCase() : `name:${name.trim().toUpperCase()}`;
}

/** Region named in a fund's name ("S&P 500", "EAFE", "Emerging"…), if any. */
function regionFromName(upperName: string): Region | null {
  if (/EMERGING/.test(upperName)) return "emerging";
  if (/EAFE|INTERNATIONAL|DEVELOPED|EUROPE|JAPAN/.test(upperName)) return "intl";
  if (/ALL[- ]COUNTRY|ACWI|GLOBAL|WORLD/.test(upperName)) return "global";
  if (/S&P 500|\bU\.?S\.?(?=[\s.]|$)|NASDAQ|DOW JONES|RUSSELL|AMERICA/.test(upperName)) return "US";
  if (/TSX|CANAD/.test(upperName)) return "CA";
  return null;
}

export function classifyInstrument(symbol: string | null, name: string, override?: InstrumentOverride): Instrument {
  const key = instrumentKey(symbol, name);
  const base = (o: Known): Instrument => ({
    key,
    symbol,
    name,
    assetClass: override?.assetClass ?? o[0],
    region: override?.region ?? o[1],
    vehicle: override?.vehicle ?? o[2],
  });
  const upperName = name.toUpperCase();

  if (/^CASH\b/i.test(name) && !symbol) return base(["cash", "n/a", "cash"]);

  if (symbol) {
    const b = baseSymbol(symbol);
    const ca = isCanadianListing(symbol);
    if (ca && KNOWN_CA_ETFS[b]) return base(KNOWN_CA_ETFS[b]);
    if (!ca && KNOWN_US_ETFS[b]) return base(KNOWN_US_ETFS[b]);
    if (KNOWN_CA_ETFS[b]) return base(KNOWN_CA_ETFS[b]); // CA ETF quoted without suffix
    if (KNOWN_ADRS[b] || /\bADR\b/.test(upperName)) return base(["equity", KNOWN_ADRS[b] ?? "intl", "stock"]);
    if (/REIT/.test(upperName)) return base(["real-estate", ca ? "CA" : "US", /ETF|ISHARES|VANGUARD|BMO|HORIZONS/.test(upperName) ? "etf" : "stock"]);
    if (/\bETF\b|ISHARES|VANGUARD|SPDR|INVESCO|SCHWAB|EXCHANGE[- ]TRADED/.test(upperName)) return base(["equity", regionFromName(upperName) ?? (ca ? "CA" : "US"), "etf"]);
    return base(["equity", ca ? "CA" : "US", "stock"]);
  }

  // Funds without a ticker (group pension / mutual funds): classify by name.
  if (/BALANCED|LIFETIME|TARGET|RETIREMENT \d{4}|\b20[3-7]\d\b|GROWTH PORTFOLIO|CONSERVATIVE/.test(upperName)) return base(["balanced", "global", "fund"]);
  if (/BOND|FIXED INCOME|INCOME FUND|MONEY MARKET/.test(upperName)) return base([/MONEY MARKET/.test(upperName) ? "cash" : "fixed-income", "mixed", "fund"]);
  if (/COMMON SHARES|SHARE PURCHASE|STOCK/.test(upperName)) return base(["equity", "CA", "stock"]);
  if (/EMERGING/.test(upperName)) return base(["equity", "emerging", "fund"]);
  if (/INTERNATIONAL|EAFE/.test(upperName)) return base(["equity", "intl", "fund"]);
  if (/U\.?S\.?|AMERICAN|S&P 500/.test(upperName)) return base(["equity", "US", "fund"]);
  if (/CANADIAN|CANADA|TSX/.test(upperName)) return base(["equity", "CA", "fund"]);
  if (/GLOBAL|WORLD/.test(upperName)) return base(["equity", "global", "fund"]);
  return base(["other", "mixed", "fund"]);
}

/**
 * Wealthica sometimes quotes a TSX listing without its suffix (e.g. `BNS` and `BNS.TO`).
 * When both forms appear in the data, map the bare form to the suffixed one.
 */
export function symbolCanonicaliser(allSymbols: Iterable<string>): (s: string | null) => string | null {
  const suffixed = new Map<string, string>();
  for (const s of allSymbols) if (isCanadianListing(s)) suffixed.set(baseSymbol(s), s.toUpperCase());
  return (s) => {
    if (!s) return null;
    const up = s.trim().toUpperCase();
    if (!up) return null;
    return isCanadianListing(up) ? up : (suffixed.get(up) ?? up);
  };
}
