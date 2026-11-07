import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadFundHoldings } from "./fund-holdings.ts";
import { findRbc, rbcDetail, rbcHoldings, rbcMix, rbcSectors, searchRbc } from "./rbc-funds.ts";
import { loadSunLife, sunLifeHoldings, sunLifeUrl } from "./sunlife-funds.ts";
import { loadFundFees } from "./fund-fees.ts";

/**
 * Public market data for the analysis pages, fetched by the server from free sources and cached
 * on disk (data/private/market/, git-ignored). The browser can't call these itself: none of them
 * send CORS headers, and the app's CSP only allows its own origin.
 *
 *   GET /api/market/profile?symbols=A,B     quote, key stats, profile, fund holdings, analysts (Yahoo Finance)
 *   GET /api/market/history?symbol=A&range=5y   daily/weekly closes (dividend-adjusted) and dividends
 *   GET /api/market/news?symbol=A&name=…    headlines (Yahoo Finance + Google News RSS)
 *   GET /api/market/search?q=…              symbol lookup, e.g. to link a pension fund to a ticker
 *   GET /api/market/holdings?symbols=A,B    every position of each fund (iShares files, SEC N-PORT; tools/fund-holdings.ts)
 *   GET /api/market/fees?symbols=A,B        management fee / MER / trading expense ratio where providers publish them (tools/fund-fees.ts)
 *   GET /api/market/macro                   Bank of Canada: policy rate, 10-year yield, CPI, USD/CAD
 *
 * Only symbols and fund names leave your machine; never amounts or account details.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const HOUR = 3_600_000;
const TTL = { profile: 6 * HOUR, history: 12 * HOUR, news: HOUR, search: 24 * HOUR, macro: 12 * HOUR, holdings: 24 * HOUR, fees: 24 * HOUR };

// ── Cache (memory + disk) ───────────────────────────────────────────────────

const memory = new Map<string, { at: number; value: unknown }>();
let cacheDir = "";

async function cached<T>(kind: keyof typeof TTL, key: string, load: () => Promise<T>): Promise<T> {
  const id = createHash("sha256").update(`${kind}:${key}`).digest("hex").slice(0, 32);
  const fresh = (e?: { at: number }) => !!e && Date.now() - e.at < TTL[kind];
  let hit = memory.get(id);
  if (!hit && cacheDir) {
    hit = await readFile(resolve(cacheDir, `${id}.json`), "utf8").then((t) => JSON.parse(t) as { at: number; value: unknown }).catch(() => undefined);
    if (hit) memory.set(id, hit);
  }
  if (fresh(hit)) return hit!.value as T;
  try {
    const value = await load();
    const entry = { at: Date.now(), value };
    memory.set(id, entry);
    if (cacheDir) await mkdir(cacheDir, { recursive: true }).then(() => writeFile(resolve(cacheDir, `${id}.json`), JSON.stringify(entry))).catch(() => {});
    return value;
  } catch (e) {
    // Serve stale data rather than nothing when a source is down.
    if (hit) return hit.value as T;
    throw e;
  }
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw Object.assign(new Error(`${new URL(url).host} answered ${res.status}`), { status: res.status });
  return res.json();
}

// ── Yahoo Finance ───────────────────────────────────────────────────────────

/** quoteSummary needs a session cookie and a matching "crumb". */
let session: { cookie: string; crumb: string; at: number } | null = null;

async function yahooSession(force = false) {
  if (session && !force && Date.now() - session.at < 12 * HOUR) return session;
  const res = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual", signal: AbortSignal.timeout(15_000) });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, cookie }, signal: AbortSignal.timeout(15_000) });
  const crumb = await crumbRes.text();
  if (!crumbRes.ok || !crumb || crumb.includes("<")) throw new Error("Yahoo Finance refused a session");
  session = { cookie, crumb, at: Date.now() };
  return session;
}

const MODULES = [
  "price", "summaryDetail", "assetProfile", "defaultKeyStatistics", "financialData", "fundProfile", "topHoldings",
  "recommendationTrend", "calendarEvents", "earnings",
].join(",");

async function quoteSummary(symbol: string): Promise<Record<string, any> | null> {
  for (const retry of [false, true]) {
    const s = await yahooSession(retry);
    try {
      const j = (await getJson(
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${MODULES}&crumb=${encodeURIComponent(s.crumb)}`,
        { cookie: s.cookie },
      )) as { quoteSummary?: { result?: Record<string, any>[] } };
      return j.quoteSummary?.result?.[0] ?? null;
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) return null;
      if (status !== 401 || retry) throw e;
    }
  }
  return null;
}

/** Yahoo wraps numbers as { raw, fmt }; empty objects mean "no value". */
const n = (v: unknown): number | null => {
  const x = v && typeof v === "object" ? (v as { raw?: unknown }).raw : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const date = (v: unknown): string | null => {
  const x = n(v);
  return x ? new Date(x * 1000).toISOString().slice(0, 10) : null;
};

/** The shape the app reads (src/data/market.ts mirrors it). */
export function normaliseProfile(symbol: string, r: Record<string, any>) {
  const p = r.price ?? {};
  const sd = r.summaryDetail ?? {};
  const ks = r.defaultKeyStatistics ?? {};
  const fd = r.financialData ?? {};
  const ap = r.assetProfile ?? {};
  const fp = r.fundProfile ?? {};
  const th = r.topHoldings;
  const rec = (r.recommendationTrend?.trend ?? []) as Record<string, unknown>[];
  const yearly = (r.earnings?.financialsChart?.yearly ?? []) as Record<string, unknown>[];
  const sectors: Record<string, number> = {};
  for (const o of (th?.sectorWeightings ?? []) as Record<string, unknown>[])
    for (const [k, v] of Object.entries(o)) if (n(v)) sectors[k] = n(v)!;
  const bondRatings: Record<string, number> = {};
  for (const o of (th?.bondRatings ?? []) as Record<string, unknown>[])
    for (const [k, v] of Object.entries(o)) if (n(v)) bondRatings[k] = n(v)!;

  return {
    symbol,
    name: str(p.longName) ?? str(p.shortName) ?? symbol,
    quoteType: str(p.quoteType),
    exchange: str(p.exchangeName),
    currency: str(p.currency) ?? str(sd.currency),
    price: n(p.regularMarketPrice),
    change: n(p.regularMarketChange),
    changePct: n(p.regularMarketChangePercent),
    marketTime: n(p.regularMarketTime),
    marketCap: n(p.marketCap) ?? n(sd.marketCap),
    previousClose: n(sd.previousClose),
    dayLow: n(sd.dayLow),
    dayHigh: n(sd.dayHigh),
    low52: n(sd.fiftyTwoWeekLow),
    high52: n(sd.fiftyTwoWeekHigh),
    avg50: n(sd.fiftyDayAverage),
    avg200: n(sd.twoHundredDayAverage),
    volume: n(sd.volume),
    avgVolume: n(sd.averageVolume),
    trailingPE: n(sd.trailingPE),
    forwardPE: n(sd.forwardPE) ?? n(ks.forwardPE),
    priceToBook: n(ks.priceToBook),
    pegRatio: n(ks.pegRatio),
    eps: n(ks.trailingEps),
    forwardEps: n(ks.forwardEps),
    beta: n(sd.beta) ?? n(ks.beta3Year),
    dividendYield: n(sd.dividendYield) ?? n(sd.yield) ?? n(ks.yield) ?? n(sd.trailingAnnualDividendYield),
    dividendRate: n(sd.dividendRate) ?? n(sd.trailingAnnualDividendRate),
    payoutRatio: n(sd.payoutRatio),
    exDividendDate: date(sd.exDividendDate),
    fiveYearAvgDividendYield: n(sd.fiveYearAvgDividendYield),
    expenseRatio: n(fp.feesExpensesInvestment?.annualReportExpenseRatio) ?? n(ks.annualReportExpenseRatio) ?? n(sd.expenseRatio),
    turnover: n(fp.feesExpensesInvestment?.annualHoldingsTurnover) ?? n(ks.annualHoldingsTurnover),
    frontLoad: n(fp.feesExpensesInvestment?.frontEndSalesLoad),
    deferredLoad: n(fp.feesExpensesInvestment?.deferredSalesLoad),
    bid: n(sd.bid),
    ask: n(sd.ask),
    totalAssets: n(ks.totalAssets) ?? n(sd.totalAssets),
    ytdReturn: n(ks.ytdReturn) ?? n(sd.ytdReturn),
    threeYearReturn: n(ks.threeYearAverageReturn),
    fiveYearReturn: n(ks.fiveYearAverageReturn),
    fundFamily: str(ks.fundFamily) ?? str(fp.family),
    category: str(ks.category) ?? str(fp.categoryName),
    legalType: str(ks.legalType) ?? str(fp.legalType),
    inceptionDate: date(ks.fundInceptionDate),
    morningstarRating: n(ks.morningStarOverallRating),
    sector: str(ap.sectorDisp) ?? str(ap.sector),
    industry: str(ap.industryDisp) ?? str(ap.industry),
    country: str(ap.country),
    city: str(ap.city),
    website: str(ap.website),
    employees: n(ap.fullTimeEmployees),
    summary: str(ap.longBusinessSummary),
    fund: th
      ? {
          stock: n(th.stockPosition),
          bond: n(th.bondPosition),
          cash: n(th.cashPosition),
          other: n(th.otherPosition),
          preferred: n(th.preferredPosition),
          convertible: n(th.convertiblePosition),
          holdings: ((th.holdings ?? []) as Record<string, unknown>[])
            .map((h) => ({ symbol: str(h.symbol), name: str(h.holdingName) ?? "", weight: n(h.holdingPercent) ?? 0 }))
            .filter((h) => h.weight > 0),
          sectors,
          bondRatings,
          pe: n(th.equityHoldings?.priceToEarnings),
          pb: n(th.equityHoldings?.priceToBook),
          medianMarketCap: n(th.equityHoldings?.medianMarketCap),
          duration: n(th.bondHoldings?.duration),
          maturity: n(th.bondHoldings?.maturity),
        }
      : null,
    analysts: fd.recommendationKey || rec.length
      ? {
          key: str(fd.recommendationKey),
          mean: n(fd.recommendationMean),
          count: n(fd.numberOfAnalystOpinions),
          targetLow: n(fd.targetLowPrice),
          targetMean: n(fd.targetMeanPrice),
          targetHigh: n(fd.targetHighPrice),
          trend: rec.map((t) => ({
            period: String(t.period ?? ""),
            strongBuy: Number(t.strongBuy ?? 0),
            buy: Number(t.buy ?? 0),
            hold: Number(t.hold ?? 0),
            sell: Number(t.sell ?? 0),
            strongSell: Number(t.strongSell ?? 0),
          })),
        }
      : null,
    financials: fd.totalRevenue || yearly.length
      ? {
          currency: str(fd.financialCurrency),
          revenue: n(fd.totalRevenue),
          revenueGrowth: n(fd.revenueGrowth),
          earningsGrowth: n(fd.earningsGrowth),
          grossMargin: n(fd.grossMargins),
          operatingMargin: n(fd.operatingMargins),
          profitMargin: n(fd.profitMargins),
          roe: n(fd.returnOnEquity),
          roa: n(fd.returnOnAssets),
          debtToEquity: n(fd.debtToEquity),
          currentRatio: n(fd.currentRatio),
          freeCashflow: n(fd.freeCashflow),
          totalCash: n(fd.totalCash),
          totalDebt: n(fd.totalDebt),
          yearly: yearly.map((y) => ({ year: Number(y.date), revenue: n(y.revenue), earnings: n(y.earnings) })),
        }
      : null,
    nextEarnings: date(r.calendarEvents?.earnings?.earningsDate?.[0]),
    /** Returns vs the benchmark, from a plan fact sheet (Sun Life). */
    trailing: null as { label: string; fund: number | null; index: number | null }[] | null,
    benchmark: null as string | null,
    riskLevel: null as string | null,
  };
}

export type Profile = ReturnType<typeof normaliseProfile>;

const profile = (symbol: string) =>
  cached("profile", symbol, async () => {
    if (symbol.startsWith("RBC:")) return rbcProfile(symbol.slice(4));
    if (symbol.startsWith("SLF:")) return sunLifeProfile(symbol.slice(4));
    const r = await quoteSummary(symbol);
    return r ? normaliseProfile(symbol, r) : null;
  });

/** A profile for an RBC/PH&N fund from rbcgam.com (same shape as Yahoo's). */
async function rbcProfile(code: string): Promise<Profile | null> {
  const d = await rbcDetail(code);
  if (!d) return null;
  const mix = rbcMix(d);
  const top = Object.entries((d.topHoldings ?? {}) as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return {
    ...normaliseProfile(`RBC:${code}`, {}),
    name: String(d.fundName?.en ?? code),
    quoteType: "MUTUALFUND",
    exchange: "RBC GAM",
    currency: "CAD",
    price: typeof d.nav === "number" ? d.nav : null,
    expenseRatio: typeof d.mer === "number" ? d.mer : null,
    trailingPE: typeof d.peRatio === "number" ? d.peRatio : null,
    priceToBook: typeof d.pbRatio === "number" ? d.pbRatio : null,
    dividendYield: typeof d.dividendYield === "number" ? d.dividendYield : null,
    fundFamily: "RBC Global Asset Management",
    category: typeof d.cifscCategory === "string" ? d.cifscCategory : null,
    inceptionDate: typeof d.inceptionDate === "string" ? d.inceptionDate.slice(0, 10) : null,
    legalType: `Mutual fund (series ${d.series ?? "?"})`,
    website: `https://www.rbcgam.com/en/ca/products/mutual-funds/${code}/detail`,
    fund: {
      stock: mix.stock,
      bond: mix.bond,
      cash: mix.cash,
      other: mix.other,
      preferred: null,
      convertible: null,
      holdings: top.map(([n, w]) => ({ symbol: null, name: n.replace(/\s+-\s+Series \w+$/, ""), weight: w / 100 })),
      sectors: rbcSectors(d),
      bondRatings: {},
      pe: null,
      pb: null,
      medianMarketCap: null,
      duration: null,
      maturity: null,
    },
  };
}

/** A Sun Life group plan fund, from its Morningstar fact sheet. */
async function sunLifeProfile(id: string): Promise<Profile | null> {
  const f = await loadSunLife(id);
  if (!f) return null;
  const ret = (label: string) => f.returns.find((r) => r.label.replace(/[- ]/g, "").toLowerCase() === label.replace(/[- ]/g, "").toLowerCase())?.fund ?? null;
  return {
    ...normaliseProfile(`SLF:${id}`, {}),
    name: f.name,
    quoteType: "MUTUALFUND",
    exchange: "Sun Life",
    currency: "CAD",
    fundFamily: f.firm,
    category: f.type,
    legalType: f.underlying ? `Segregated fund holding ${f.underlying}` : "Segregated fund",
    inceptionDate: f.inception,
    ytdReturn: ret("YTD"),
    threeYearReturn: ret("3-Year"),
    fiveYearReturn: ret("5-Year"),
    website: sunLifeUrl(id),
    trailing: f.returns,
    benchmark: f.benchmark,
    riskLevel: f.risk,
    fund: {
      stock: f.mix.stock,
      bond: f.mix.bond,
      cash: f.mix.cash,
      other: f.mix.other,
      preferred: null,
      convertible: null,
      holdings: f.holdings.map((h) => ({ symbol: null, name: h.name, weight: h.weight })),
      sectors: f.sectors,
      bondRatings: {},
      pe: null,
      pb: null,
      medianMarketCap: null,
      duration: null,
      maturity: null,
    },
  };
}

/** Resolves an ETF name to a ticker via Yahoo search (for ETFs held inside RBC funds). */
const tickerFor = async (name: string) => (await search(name)).find((r) => r.type === "ETF")?.symbol ?? null;

/** Complete holdings: iShares / SEC / stand-in, else RBC GAM when the fund's name is an RBC or PH&N fund. */
async function holdingsFor(symbol: string) {
  if (symbol.startsWith("RBC:")) return rbcHoldings(symbol.slice(4), tickerFor);
  if (symbol.startsWith("SLF:")) return sunLifeHoldings(symbol.slice(4), tickerFor);
  const own = await loadFundHoldings(symbol);
  if (own) return own;
  const p = await profile(symbol).catch(() => null);
  if (p && (p.quoteType === "MUTUALFUND" || /PH&N|Phillips|RBC|BlueBay/i.test(p.name))) {
    const f = await findRbc(p.name).catch(() => null);
    if (f) return rbcHoldings(f.code, tickerFor).then((h) => (h ? { ...h, symbol } : null));
  }
  return null;
}

const RANGES = new Set(["1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "max"]);

function history(symbol: string, range: string) {
  const interval = range === "1mo" || range === "3mo" || range === "6mo" || range === "1y" ? "1d" : "1wk";
  return cached("history", `${symbol}|${range}`, async () => {
    const j = (await getJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&events=div`,
    )) as { chart?: { result?: Record<string, any>[] } };
    const c = j.chart?.result?.[0];
    if (!c) return null;
    const ts = (c.timestamp ?? []) as number[];
    const close = (c.indicators?.adjclose?.[0]?.adjclose ?? c.indicators?.quote?.[0]?.close ?? []) as (number | null)[];
    const raw = (c.indicators?.quote?.[0]?.close ?? []) as (number | null)[];
    const points: { d: string; c: number; p: number }[] = [];
    ts.forEach((t, i) => {
      if (close[i] != null && raw[i] != null) points.push({ d: new Date(t * 1000).toISOString().slice(0, 10), c: close[i]!, p: raw[i]! });
    });
    const dividends = Object.values((c.events?.dividends ?? {}) as Record<string, { amount: number; date: number }>)
      .map((d) => ({ d: new Date(d.date * 1000).toISOString().slice(0, 10), amount: d.amount }))
      .sort((a, b) => a.d.localeCompare(b.d));
    return { symbol, currency: (c.meta?.currency as string | undefined) ?? null, interval, points, dividends };
  });
}

// ── News ────────────────────────────────────────────────────────────────────

interface NewsItem {
  title: string;
  link: string;
  publisher: string | null;
  at: string;
}

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

async function googleNews(query: string): Promise<NewsItem[]> {
  const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-CA&gl=CA&ceid=CA:en`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
  return xml
    .split("<item>")
    .slice(1, 21)
    .map((item) => {
      const tag = (t: string) => decode(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(item)?.[1] ?? "");
      const publisher = tag("source") || null;
      let title = tag("title");
      if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -publisher.length - 3);
      return { title, link: tag("link"), publisher, at: new Date(tag("pubDate")).toISOString() };
    })
    .filter((x) => x.title && /^https:\/\//.test(x.link));
}

async function yahooNews(symbol: string): Promise<NewsItem[]> {
  const j = (await getJson(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=15&quotesCount=0`)) as {
    news?: { title?: string; link?: string; publisher?: string; providerPublishTime?: number; relatedTickers?: string[] }[];
  };
  // Yahoo mixes in unrelated market stories; keep the ones tagged with this symbol.
  return (j.news ?? [])
    .filter((x) => x.title && x.link && (x.relatedTickers ?? []).some((t) => t.toUpperCase() === symbol.toUpperCase()))
    .map((x) => ({ title: x.title!, link: x.link!, publisher: x.publisher ?? null, at: new Date((x.providerPublishTime ?? 0) * 1000).toISOString() }));
}

function news(symbol: string, name: string) {
  return cached("news", `${symbol}|${name}`, async () => {
    const base = symbol.replace(/\.(TO|V|NE|CN)$/i, "");
    const query = name ? `"${name.replace(/"/g, "")}" OR "${base}" stock` : `${base} stock`;
    const [y, g] = await Promise.all([yahooNews(symbol).catch(() => []), googleNews(query).catch(() => [])]);
    const seen = new Set<string>();
    return [...y, ...g]
      .filter((x) => {
        const k = x.title.toLowerCase().replace(/\W+/g, " ").slice(0, 60);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 25);
  });
}

function search(q: string) {
  return cached("search", q.toLowerCase(), async () => {
    const j = (await getJson(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`)) as {
      quotes?: { symbol?: string; shortname?: string; longname?: string; quoteType?: string; exchDisp?: string }[];
    };
    return (j.quotes ?? [])
      .filter((x) => x.symbol)
      .map((x) => ({ symbol: x.symbol!, name: x.longname ?? x.shortname ?? x.symbol!, type: x.quoteType ?? null, exchange: x.exchDisp ?? null }));
  });
}

// ── Bank of Canada ──────────────────────────────────────────────────────────

const BOC_SERIES = {
  policyRate: "V39079",
  bond10y: "BD.CDN.10YR.DQ.YLD",
  cpi: "STATIC_TOTALCPICHANGE",
  usdcad: "FXUSDCAD",
} as const;

function macro() {
  return cached("macro", "boc", async () => {
    const out: Record<string, { value: number; date: string; yearAgo: number | null } | null> = {};
    await Promise.all(
      Object.entries(BOC_SERIES).map(async ([k, id]) => {
        const j = (await getJson(`https://www.bankofcanada.ca/valet/observations/${id}/json?recent_weeks=60`).catch(() => null)) as {
          observations?: Record<string, { v?: string } | string>[];
        } | null;
        const obs = (j?.observations ?? [])
          .map((o) => ({ d: String(o.d), v: Number((o[id] as { v?: string } | undefined)?.v) }))
          .filter((o) => Number.isFinite(o.v));
        const last = obs.at(-1);
        const yearAgo = last ? obs.find((o) => o.d >= `${Number(last.d.slice(0, 4)) - 1}${last.d.slice(4)}`) : undefined;
        out[k] = last ? { value: last.v, date: last.d, yearAgo: yearAgo && yearAgo !== last ? yearAgo.v : null } : null;
      }),
    );
    return out;
  });
}

// ── Handler ─────────────────────────────────────────────────────────────────

const SYMBOL = /^[A-Z0-9.^=&:-]{1,20}$/i;

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/** Answers /api/market/* (after api.ts has checked the sign-in). Returns false for other paths. */
export async function marketRoute(root: string, url: URL, send: (status: number, payload: object) => void): Promise<boolean> {
  if (!url.pathname.startsWith("/api/market/")) return false;
  cacheDir ||= resolve(root, "data/private/market");
  const p = url.searchParams;
  switch (url.pathname.slice("/api/market/".length)) {
    case "profile": {
      const symbols = [...new Set((p.get("symbols") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => SYMBOL.test(s)))].slice(0, 60);
      if (!symbols.length) return send(400, { error: "symbols required" }), true;
      const results = await mapLimit(symbols, 4, (s) => profile(s).catch((e: Error) => ({ error: e.message })));
      return send(200, Object.fromEntries(symbols.map((s, i) => [s, results[i]]))), true;
    }
    case "history": {
      const symbol = (p.get("symbol") ?? "").toUpperCase();
      const range = p.get("range") ?? "5y";
      if (!SYMBOL.test(symbol) || !RANGES.has(range)) return send(400, { error: "symbol and a valid range required" }), true;
      // Fund codes (RBC:, SLF:) have no market price history.
      if (symbol.includes(":")) return send(200, { history: null }), true;
      return send(200, { history: await history(symbol, range) }), true;
    }
    case "news": {
      const symbol = (p.get("symbol") ?? "").toUpperCase();
      if (!SYMBOL.test(symbol)) return send(400, { error: "symbol required" }), true;
      if (symbol.includes(":")) return send(200, { news: [] }), true;
      return send(200, { news: await news(symbol, (p.get("name") ?? "").slice(0, 80)) }), true;
    }
    case "search": {
      const q = (p.get("q") ?? "").trim().slice(0, 80);
      if (q.length < 2) return send(400, { error: "q required" }), true;
      const [y, r] = await Promise.all([search(q).catch(() => []), searchRbc(q).catch(() => [])]);
      const rbc = r.map((f) => ({ symbol: `RBC:${f.code}`, name: `${f.name} (series ${f.series})`, type: "RBC fund", exchange: "rbcgam.com" }));
      return send(200, { results: [...rbc, ...y] }), true;
    }
    case "holdings": {
      const symbols = [...new Set((p.get("symbols") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => SYMBOL.test(s)))].slice(0, 30);
      if (!symbols.length) return send(400, { error: "symbols required" }), true;
      const results = await mapLimit(symbols, 3, (s) => cached("holdings", s, () => holdingsFor(s)).catch(() => null));
      return send(200, Object.fromEntries(symbols.map((s, i) => [s, results[i]]))), true;
    }
    case "fees": {
      const symbols = [...new Set((p.get("symbols") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => SYMBOL.test(s)))].slice(0, 40);
      if (!symbols.length) return send(400, { error: "symbols required" }), true;
      const results = await mapLimit(symbols, 4, (s) => cached("fees", s, () => loadFundFees(s)).catch(() => null));
      return send(200, Object.fromEntries(symbols.map((s, i) => [s, results[i]]))), true;
    }
    case "macro":
      return send(200, await macro()), true;
  }
  send(404, { error: "Unknown market endpoint" });
  return true;
}
