import { isharesCaPath } from "./fund-holdings.ts";
import { rbcDetail, rbcList } from "./rbc-funds.ts";

/**
 * A fund's published fees, from the provider where it publishes them:
 * - RBC GAM: management fee, MER and trading expense ratio (TER)
 * - iShares Canada (fund page): management fee and MER
 * - iShares US (product screener): management fee and total expense ratio
 * Anything else falls back to the MER Yahoo Finance reports (no split), done by the caller.
 * All values are fractions of the amount invested, per year.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export interface FundFees {
  /** Management fee: what the manager charges. */
  management: number | null;
  /** Management expense ratio: management fee + operating costs + sales tax. */
  mer: number | null;
  /** Trading expense ratio: brokerage costs inside the fund, on top of the MER. */
  ter: number | null;
  source: string;
}

const text = (url: string) => fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))));
const pct = (s: string | undefined) => (s && Number.isFinite(Number(s)) ? Number(s) / 100 : null);

async function rbcFees(code: string): Promise<FundFees | null> {
  const [d, list] = await Promise.all([rbcDetail(code), rbcList()]);
  if (!d) return null;
  const f = list.find((x) => x.code === code);
  return {
    management: f?.managementFees ?? null,
    mer: typeof d.mer === "number" ? d.mer : null,
    ter: typeof d.ter === "number" ? d.ter : null,
    source: "RBC GAM",
  };
}

async function isharesCaFees(symbol: string): Promise<FundFees | null> {
  const path = await isharesCaPath(symbol.replace(/\.(TO|NE)$/, ""));
  if (!path) return null;
  const html = await text(`https://www.blackrock.com${path}`);
  const cell = (label: string) => pct(new RegExp(`${label}[\\s\\S]{0,900}?<td class="data">\\s*([\\d.]+)%`).exec(html)?.[1]);
  const management = cell("Management Fee");
  const mer = cell("Management Expense Ratio \\(MER\\)");
  return management !== null || mer !== null ? { management, mer, ter: null, source: "iShares Canada" } : null;
}

let usScreener: Promise<Map<string, { mgt: number | null; ter: number | null }>> | null = null;
function isharesUs() {
  usScreener ??= text(
    "https://www.ishares.com/us/product-screener/product-screener-v3.1.jsn?dcrPath=/templatedata/config/product-screener-v3/data/en/us-ishares/ishares-product-screener-backend-config&siteEntryPassthrough=true",
  ).then((t) => {
    const j = JSON.parse(t) as Record<string, { localExchangeTicker?: string; mgt?: { r?: number }; ter?: { r?: number } }>;
    return new Map(
      Object.values(j)
        .filter((v) => v.localExchangeTicker)
        .map((v) => [v.localExchangeTicker!.toUpperCase(), { mgt: typeof v.mgt?.r === "number" ? v.mgt.r / 100 : null, ter: typeof v.ter?.r === "number" ? v.ter.r / 100 : null }]),
    );
  });
  usScreener.catch(() => (usScreener = null));
  return usScreener;
}

async function isharesUsFees(symbol: string): Promise<FundFees | null> {
  if (/\.|:/.test(symbol)) return null;
  const f = (await isharesUs()).get(symbol.toUpperCase());
  return f ? { management: f.mgt, mer: f.ter, ter: null, source: "iShares US" } : null;
}

export async function loadFundFees(symbol: string): Promise<FundFees | null> {
  if (symbol.startsWith("RBC:")) return rbcFees(symbol.slice(4)).catch(() => null);
  return (await isharesCaFees(symbol).catch(() => null)) ?? (await isharesUsFees(symbol).catch(() => null));
}
