/**
 * Complete fund holdings from free public sources, for look-through analysis:
 *
 * - iShares Canada: every fund publishes a holdings CSV (ticker, sector, country, weight).
 * - US-registered funds (ETFs and mutual funds): the quarterly SEC N-PORT filing lists every
 *   position with its country (no sector). Weights are as of the filing's report date.
 * - Funds with neither (Vanguard Canada, BMO…) use a fund tracking the same index as a stand-in.
 *
 * Holdings that are themselves funds are marked kind "fund" with a symbol where known, so the
 * app can look through them in turn (XEQT → XTOT → US stocks).
 */

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
// The SEC asks automated clients to identify themselves.
const SEC_UA = process.env.SEC_USER_AGENT ?? "Financials personal dashboard (self-hosted) contact@localhost";
const DAY = 86_400_000;

export interface FundRow {
  /** Name as the source spells it. */
  n: string;
  /** Ticker (Yahoo spelling for funds: XTOT.TO, ITOT), when the source gives one. */
  t: string | null;
  /** Weight, fraction of the fund. */
  w: number;
  /** Country, ISO 3166 alpha-2. */
  c: string | null;
  /** Sector key (see SECTOR_LABEL in src/data/analysis.ts). */
  s: string | null;
  k: "stock" | "fund" | "bond" | "cash" | "other";
}

export interface FundHoldings {
  symbol: string;
  source: "iShares" | "SEC N-PORT" | "RBC GAM" | "Sun Life";
  sourceName: string;
  asOf: string | null;
  /** Set when another fund tracking the same index stands in for this one. */
  proxy: string | null;
  rows: FundRow[];
  /** Fund-level splits when the source publishes them (more complete than the rows): stocks by country and sector, and the asset mix, as fractions. */
  countries?: Record<string, number>;
  sectors?: Record<string, number>;
  mix?: { stock: number; bond: number; cash: number; other: number };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function text(url: string, ua = BROWSER_UA): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": ua }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw Object.assign(new Error(`${new URL(url).host} answered ${res.status}`), { status: res.status });
  return res.text();
}

const memo = new Map<string, { at: number; value: Promise<unknown> }>();
function remember<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as Promise<T>;
  const value = load();
  value.catch(() => memo.delete(key));
  memo.set(key, { at: Date.now(), value });
  return value;
}

/** Country name → ISO code, from the runtime's own region names (plus the odd variant). */
const COUNTRY_CODE = (() => {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const m = new Map<string, string>();
  for (let a = 65; a <= 90; a++)
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      try {
        const name = names.of(code);
        if (name && name !== code && !m.has(name.toUpperCase())) m.set(name.toUpperCase(), code);
      } catch {
        /* not a region */
      }
    }
  for (const [k, v] of Object.entries({ "KOREA (SOUTH)": "KR", "SOUTH KOREA": "KR", KOREA: "KR", "HONG KONG": "HK", "TAIWAN": "TW", "RUSSIA": "RU", "CZECH REPUBLIC": "CZ", "TURKEY": "TR", "UNITED STATES OF AMERICA": "US", "EUROPEAN UNION": "EU" })) m.set(k, v);
  return m;
})();
export const countryCode = (name: string | null | undefined) => (name ? (COUNTRY_CODE.get(name.trim().toUpperCase()) ?? null) : null);

const ISHARES_SECTOR: Record<string, string> = {
  "Information Technology": "technology",
  Financials: "financial_services",
  "Health Care": "healthcare",
  "Consumer Discretionary": "consumer_cyclical",
  "Consumer Staples": "consumer_defensive",
  Industrials: "industrials",
  Communication: "communication_services",
  "Communication Services": "communication_services",
  Energy: "energy",
  Materials: "basic_materials",
  "Real Estate": "realestate",
  Utilities: "utilities",
};

const FUND_NAME = /\b(ETF|FUND|INDEX|PORTFOLIO|TRUST)\b|ISHARES|VANGUARD|SPDR/i;

function csvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

// ── iShares Canada ──────────────────────────────────────────────────────────

const isharesCa = () =>
  remember("ishares-ca", 7 * DAY, async () => {
    const html = await text("https://www.blackrock.com/ca/investors/en/products/product-list");
    return new Map([...html.matchAll(/<a href="(\/ca\/investors\/en\/products\/\d+\/[a-z0-9-]+)">([A-Z0-9.]{2,8})<\/a>/g)].map((x) => [x[2]!, x[1]!]));
  });

/** The iShares Canada product page path for a TSX ticker (without .TO). */
export const isharesCaPath = async (base: string) => (await isharesCa()).get(base) ?? null;

export function parseIsharesCsv(csv: string): { asOf: string | null; rows: FundRow[] } {
  const lines = csv.split(/\r?\n/);
  const asOf = /Fund Holdings as of,"?([^"]+)"?/.exec(lines[0] ?? "")?.[1] ?? null;
  const start = lines.findIndex((l) => l.startsWith("Ticker,"));
  if (start < 0) return { asOf, rows: [] };
  const head = csvLine(lines[start]!);
  const col = (name: string) => head.indexOf(name);
  const [iT, iN, iS, iA, iW, iL, iE] = ["Ticker", "Name", "Sector", "Asset Class", "Weight (%)", "Location", "Exchange"].map(col);
  const rows: FundRow[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim() || !line.startsWith('"')) break;
    const f = csvLine(line);
    const w = Number((f[iW!] ?? "").replace(/,/g, "")) / 100;
    if (!Number.isFinite(w) || w === 0) continue;
    const name = f[iN!] ?? "";
    const asset = f[iA!] ?? "";
    const exchange = f[iE!] ?? "";
    const ticker = (f[iT!] ?? "").trim() || null;
    const k: FundRow["k"] = /equity/i.test(asset)
      ? FUND_NAME.test(name) ? "fund" : "stock"
      : /fixed income|bond/i.test(asset)
        ? "bond"
        : /cash|money market/i.test(asset)
          ? "cash"
          : "other";
    // Keep tickers Yahoo would recognise: North American listings (TSX ones get .TO).
    const t = !ticker ? null : /toronto/i.test(exchange) ? `${ticker}.TO` : /NASDAQ|NYSE|Cboe/i.test(exchange) || k === "fund" ? ticker : null;
    rows.push({ n: name, t, w, c: countryCode(f[iL!]), s: ISHARES_SECTOR[f[iS!] ?? ""] ?? null, k });
  }
  return { asOf, rows };
}

async function fromIsharesCa(symbol: string): Promise<FundHoldings | null> {
  const base = symbol.replace(/\.(TO|NE)$/, "");
  const path = (await isharesCa()).get(base);
  if (!path) return null;
  const csv = await text(`https://www.blackrock.com${path}/1464253357814.ajax?fileType=csv&fileName=${base}_holdings&dataType=fund`);
  const { asOf, rows } = parseIsharesCsv(csv);
  if (!rows.length) return null;
  return { symbol, source: "iShares", sourceName: `iShares ${base} holdings file`, asOf, proxy: null, rows };
}

// ── SEC N-PORT ──────────────────────────────────────────────────────────────

const secSeries = () =>
  remember("sec-mf", 7 * DAY, async () => {
    const j = JSON.parse(await text("https://www.sec.gov/files/company_tickers_mf.json", SEC_UA)) as { data: [number, string, string, string][] };
    return new Map(j.data.map((r) => [r[3].toUpperCase(), r[1]]));
  });

const decodeXml = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'");

export function parseNport(xml: string): { asOf: string | null; name: string | null; rows: FundRow[] } {
  const get = (block: string, t: string) => new RegExp(`<${t}>([^<]*)</${t}>`).exec(block)?.[1]?.trim() ?? null;
  const asOf = get(xml, "repPdDate");
  const name = get(xml, "seriesName");
  const rows: FundRow[] = [];
  for (const block of xml.split(/<invstOrSec>/).slice(1)) {
    const pct = Number(get(block, "pctVal"));
    if (!Number.isFinite(pct) || pct <= 0) continue;
    const n = decodeXml(get(block, "name") ?? get(block, "title") ?? "");
    const cat = get(block, "assetCat") ?? "";
    const issuer = get(block, "issuerCat") ?? "";
    const title = get(block, "title") ?? "";
    const k: FundRow["k"] =
      cat === "STIV" || /MONEY MARKET|CASH MGMT|LIQUIDITY|CASH MANAGEMENT/i.test(`${n} ${title}`)
        ? "cash"
        : issuer === "RF"
          ? "fund"
          : cat === "EC" || cat === "EP"
            ? "stock"
            : cat === "DBT" || cat.startsWith("ABS") || cat === "LON" || cat === "SN"
              ? "bond"
              : "other";
    const ticker = /<ticker value="([^"]+)"/.exec(block)?.[1] ?? null;
    rows.push({ n, t: ticker, w: pct / 100, c: get(block, "invCountry"), s: null, k });
  }
  rows.sort((a, b) => b.w - a.w);
  return { asOf, name, rows };
}

async function fromSec(symbol: string): Promise<FundHoldings | null> {
  if (/\.(TO|V|NE|CN)$/.test(symbol)) return null;
  const series = (await secSeries()).get(symbol.toUpperCase());
  if (!series) return null;
  const atom = await text(`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${series}&type=NPORT-P&dateb=&owner=include&count=1&output=atom`, SEC_UA);
  const index = /<filing-href>([^<]+)<\/filing-href>/.exec(atom)?.[1];
  if (!index) return null;
  const page = await text(index, SEC_UA);
  const xmlPath = [...page.matchAll(/href="([^"]+\.xml)"/g)].map((m) => m[1]!).find((h) => !/xsl/i.test(h));
  if (!xmlPath) return null;
  const { asOf, name, rows } = parseNport(await text(`https://www.sec.gov${xmlPath}`, SEC_UA));
  if (!rows.length) return null;
  return { symbol, source: "SEC N-PORT", sourceName: `SEC filing for ${name ?? symbol}`, asOf, proxy: null, rows: rows.slice(0, 4000) };
}

// ── Stand-ins ───────────────────────────────────────────────────────────────

/** Funds without a public holdings file → a fund tracking the same (or a very similar) index. */
const PROXY: Record<string, string> = {
  // Canada broad
  VCN: "XIC.TO", ZCN: "XIC.TO", HXT: "XIC.TO", TTP: "XIC.TO", QCN: "XIC.TO", VCE: "XIU.TO", ZIU: "XIU.TO", HXCN: "XIC.TO",
  // S&P 500
  VFV: "VOO", VSP: "VOO", ZSP: "VOO", ZUE: "VOO", HXS: "VOO", XUS: "IVV", XSP: "IVV", SPY: "VOO", IVV: "IVV",
  // US total market
  VUN: "VTI", VUS: "VTI", XUU: "ITOT", ZDJ: "VTI",
  // Nasdaq-100
  QQC: "QQQM", ZQQ: "QQQM", ZNQ: "QQQM", XQQ: "QQQM", HXQ: "QQQM", QQQ: "QQQM",
  // Developed ex North America
  VIU: "IEFA", VI: "IEFA", ZEA: "IEFA", VEF: "IEFA", ZDM: "EFA", VIDY: "VYMI",
  // Emerging
  VEE: "IEMG", ZEM: "IEMG",
  // Global
  VXC: "VT", VT: "VT", ZGQ: "VT",
  // Dividend
  VDY: "XEI.TO", ZDV: "XEI.TO", VGG: "VIG", ZDY: "VYM",
};

export async function loadFundHoldings(symbol: string): Promise<FundHoldings | null> {
  const s = symbol.toUpperCase();
  const own = (await fromIsharesCa(s).catch(() => null)) ?? (await fromSec(s).catch(() => null));
  if (own) return own;
  const proxy = PROXY[s.replace(/\.(TO|NE|V)$/, "")];
  if (!proxy || proxy === s) return null;
  const p = (await fromIsharesCa(proxy).catch(() => null)) ?? (await fromSec(proxy).catch(() => null));
  return p ? { ...p, symbol: s, proxy } : null;
}
