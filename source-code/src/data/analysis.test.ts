import { describe, expect, it } from "vitest";
import { backtest, childFundSymbols, correlations, costBreakdown, yearlyCost, feeDrag, insights, lookThrough, maxDrawdown, outcome, overlap, periodReturn, rowsFor, volatility, weighted, feeOf } from "./analysis";
import type { Holding } from "./holdings";
import { classifyInstrument } from "./instruments";
import { toYahoo, type FundHoldings, type MarketData, type Profile } from "./market";

const md = (profiles: Map<string, Profile | null>, funds = new Map<string, FundHoldings | null>()): MarketData => ({ profiles, funds });
import type { Account } from "./model";

const profile = (p: Partial<Profile> & { symbol: string }): Profile =>
  ({ name: p.symbol, quoteType: "EQUITY", currency: "CAD", fund: null, analysts: null, financials: null, dividendYield: null, expenseRatio: null, beta: null, trailingPE: null, sector: null, country: null, ...p }) as Profile;

const fund = (symbol: string, f: Partial<NonNullable<Profile["fund"]>>, extra: Partial<Profile> = {}) =>
  profile({ symbol, quoteType: "ETF", fund: { stock: 1, bond: 0, cash: 0, other: 0, preferred: 0, convertible: 0, holdings: [], sectors: {}, bondRatings: {}, pe: null, pb: null, medianMarketCap: null, duration: null, maturity: null, ...f }, ...extra });

const holding = (symbol: string | null, name: string, value: number, accountKey = "acct", book: number | null = null): Holding => ({
  instrument: classifyInstrument(symbol, name),
  quantity: null,
  marketValue: value,
  bookValue: book,
  gain: book === null ? null : value - book,
  gainPct: null,
  weight: 0,
  lots: [{ accountKey, accountName: accountKey, quantity: null, bookValue: book, marketValue: value }],
});

describe("toYahoo", () => {
  it("maps Wealthica spellings to Yahoo's", () => {
    expect(toYahoo("VFV.TO")).toBe("VFV.TO");
    expect(toYahoo("BRK.B")).toBe("BRK-B");
    expect(toYahoo("RCI.B.TO")).toBe("RCI-B.TO");
    expect(toYahoo("DLR.U")).toBe("DLR-U.TO");
    expect(toYahoo("msft")).toBe("MSFT");
  });
});

describe("lookThrough", () => {
  const profiles = new Map<string, Profile | null>([
    ["MSFT", profile({ symbol: "MSFT", name: "Microsoft", sector: "Technology", country: "United States" })],
    ["SPX.TO", fund("SPX.TO", { holdings: [{ symbol: "MSFT", name: "Microsoft Corp", weight: 0.1 }, { symbol: "AAPL", name: "Apple Inc", weight: 0.1 }], sectors: { technology: 0.5, healthcare: 0.5 } })],
    ["BOND.TO", fund("BOND.TO", { stock: 0, bond: 0.98, cash: 0.02 })],
  ]);

  it("splits funds into stocks/bonds/cash and finds companies through funds", () => {
    const hs = [holding("MSFT", "MICROSOFT CORP", 1000), holding("SPX.TO", "S&P 500 INDEX ETF", 2000), holding("BOND.TO", "BOND ETF", 1000)];
    const lt = lookThrough(rowsFor(hs, profiles, {}), md(profiles));
    expect(lt.total).toBe(4000);
    expect(lt.mix.stocks).toBeCloseTo(3000);
    expect(lt.mix.bonds).toBeCloseTo(980);
    expect(lt.mix.cash).toBeCloseTo(20);
    const msft = lt.companies.find((c) => c.key === "MICROSOFT")!;
    expect(msft.value).toBeCloseTo(1200);
    expect(msft.via.size).toBe(2);
    expect(lt.sectors.get("technology")).toBeCloseTo(2000);
    expect(lt.regions.get("US")).toBeCloseTo(3000);
  });

  it("follows funds of funds and uses each child's region", () => {
    const p = new Map<string, Profile | null>([
      ["ALL.TO", fund("ALL.TO", { holdings: [{ symbol: "XIC.TO", name: "iShares Core S&P/TSX Capped Composite ETF", weight: 0.3 }, { symbol: "XEF.TO", name: "iShares Core MSCI EAFE IMI ETF", weight: 0.7 }] })],
      ["XIC.TO", fund("XIC.TO", { sectors: { financial_services: 1 } })],
      ["XEF.TO", fund("XEF.TO", { sectors: { industrials: 1 } })],
    ]);
    expect(childFundSymbols(md(p))).toEqual(["XIC.TO", "XEF.TO"]);
    const lt = lookThrough(rowsFor([holding("ALL.TO", "ALL IN ONE ETF", 1000)], p, {}), md(p));
    expect(lt.regions.get("CA")).toBeCloseTo(300);
    expect(lt.regions.get("intl")).toBeCloseTo(700);
    expect(lt.sectors.get("financial_services")).toBeCloseTo(300);
  });

  it("falls back to the instrument classification without market data", () => {
    const lt = lookThrough(rowsFor([holding(null, "Target Date 2055 Fund", 1000)], new Map(), {}), md(new Map()));
    expect(lt.estimated).toBe(1000);
    expect(lt.mix.stocks).toBeCloseTo(600);
    expect(lt.mix.bonds).toBeCloseTo(400);
  });

  it("uses a linked symbol for a fund without a ticker", () => {
    const h = holding(null, "Target Date 2055 Fund", 1000);
    const rows = rowsFor([h], profiles, { [h.instrument.key]: "SPX.TO" });
    expect(rows[0]!.profile?.symbol).toBe("SPX.TO");
  });
});

describe("overlap", () => {
  it("is the sum of shared weights", () => {
    const a = fund("A", { holdings: [{ symbol: "X", name: "X Corp", weight: 0.2 }, { symbol: "Y", name: "Y Corp", weight: 0.1 }] });
    const b = fund("B", { holdings: [{ symbol: "X", name: "X Corp", weight: 0.05 }, { symbol: "Z", name: "Z Corp", weight: 0.3 }] });
    expect(overlap("A", "B", md(new Map([["A", a], ["B", b]]))).share).toBeCloseTo(0.05);
  });
});

describe("weighted and fees", () => {
  it("weights by value and reports coverage", () => {
    const p = new Map<string, Profile | null>([["F.TO", fund("F.TO", {}, { expenseRatio: 0.002 })], ["S", profile({ symbol: "S" })]]);
    const rows = rowsFor([holding("F.TO", "F ETF", 3000), holding("S", "S CORP", 1000), holding(null, "Mystery Fund", 1000)], p, {});
    const fee = weighted(rows, feeOf);
    expect(fee.value).toBeCloseTo(0.0015);
    expect(fee.coverage).toBeCloseTo(0.8);
  });
  it("fee drag grows with time", () => {
    expect(feeDrag(100_000, 0.01, 0.06, 25)).toBeGreaterThan(feeDrag(100_000, 0.01, 0.06, 10));
    expect(feeDrag(100_000, 0, 0.06, 25)).toBe(0);
  });
});

describe("price maths", () => {
  const weekly = (values: number[]) => values.map((c, i) => ({ d: new Date(Date.UTC(2024, 0, 1 + i * 7)).toISOString().slice(0, 10), c, p: c }));

  it("periodReturn and maxDrawdown", () => {
    const pts = weekly([100, 110, 90, 95, 120]);
    expect(periodReturn(pts, null)).toBeCloseTo(0.2);
    const dd = maxDrawdown(pts)!;
    expect(dd.depth).toBeCloseTo(90 / 110 - 1);
    expect(dd.recovered).toBe(pts[4]!.d);
  });

  it("backtest rebalances to the weights", () => {
    const a = weekly([100, 110, 121]);
    const b = weekly([100, 100, 100]);
    const bt = backtest(new Map([["a", 1], ["b", 1]]), new Map([["a", a], ["b", b]]));
    expect(bt.map((x) => x.c)).toEqual([100, 105, 110.25]);
  });

  it("correlation of identical series is 1, volatility of a flat series is 0", () => {
    const vals = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i) * 5 + i);
    const s = weekly(vals);
    const { matrix } = correlations(new Map([["a", s], ["b", s.map((p) => ({ ...p, c: p.c * 2 }))]]));
    expect(matrix[0]![1]).toBeCloseTo(1);
    expect(volatility(weekly(Array(30).fill(50)))).toBe(0);
  });
});

describe("insights", () => {
  it("flags a large single stock, high fees and US holdings in a TFSA", () => {
    const profiles = new Map<string, Profile | null>([
      ["MSFT", profile({ symbol: "MSFT", currency: "USD", sector: "Technology", country: "United States", dividendYield: 0.01 })],
      ["MF.TO", fund("MF.TO", { sectors: { technology: 1 } }, { expenseRatio: 0.02 })],
    ]);
    const tfsa = { key: "tfsa", name: "TFSA", type: "tfsa", tax: "tax-free" } as Account;
    const rows = rowsFor([holding("MSFT", "MICROSOFT CORP", 5000, "tfsa"), holding("MF.TO", "ACTIVE FUND", 5000, "tfsa")], profiles, {});
    const lt = lookThrough(rows, md(profiles));
    const out = insights({ rows, lt, accounts: new Map([["tfsa", tfsa]]), data: md(profiles), fee: weighted(rows, feeOf) });
    const titles = out.map((x) => x.title).join("\n");
    expect(titles).toMatch(/MSFT is 50/);
    expect(titles).toMatch(/Average fee 1\.00%/);
    expect(titles).toMatch(/15% of its dividends go to the US/);
    expect(out[0]!.level).toBe("warn");
  });
});

describe("complete holdings", () => {
  const full = (symbol: string, rows: FundHoldings["rows"], proxy: string | null = null): FundHoldings => ({ symbol, source: "iShares", sourceName: "test", asOf: null, proxy, rows });

  it("unrolls funds of funds to companies and countries, adding up to 100%", () => {
    const profiles = new Map<string, Profile | null>([
      ["TOP.TO", fund("TOP.TO", {})],
      ["US.TO", fund("US.TO", { sectors: { technology: 1 } })],
      ["INTL.TO", fund("INTL.TO", {})],
    ]);
    const funds = new Map<string, FundHoldings | null>([
      ["TOP.TO", full("TOP.TO", [
        { n: "US FUND ETF", t: "US.TO", w: 0.6, c: "CA", s: null, k: "fund" },
        { n: "INTL FUND ETF", t: "INTL.TO", w: 0.39, c: "CA", s: null, k: "fund" },
        { n: "CAD CASH", t: null, w: 0.01, c: "CA", s: null, k: "cash" },
      ])],
      ["US.TO", full("US.TO", [
        { n: "Apple Inc", t: null, w: 0.5, c: "US", s: null, k: "stock" },
        { n: "NVIDIA Corp", t: null, w: 0.5, c: "US", s: null, k: "stock" },
      ])],
      ["INTL.TO", full("INTL.TO", [
        { n: "TOYOTA MOTOR", t: null, w: 0.5, c: "JP", s: "consumer_cyclical", k: "stock" },
        { n: "APPLE", t: "AAPL", w: 0.5, c: "US", s: "technology", k: "stock" },
      ])],
    ]);
    const data = md(profiles, funds);
    expect(childFundSymbols(data).sort()).toEqual(["INTL.TO", "US.TO"]);
    const lt = lookThrough(rowsFor([holding("TOP.TO", "TOP ETF", 1000)], profiles, {}), data);
    expect(lt.mix.stocks + lt.mix.cash).toBeCloseTo(1000);
    // Apple through both funds, merged by name.
    const apple = lt.companies.find((c) => c.key === "APPLE")!;
    expect(apple.value).toBeCloseTo(300 + 195);
    expect(apple.symbol).toBe("AAPL");
    expect(lt.countries.get("JP")).toBeCloseTo(195);
    expect(lt.regions.get("intl")).toBeCloseTo(195);
    // Unsectored US stocks take the fund's sector weights.
    expect(lt.sectors.get("technology")).toBeCloseTo(600 + 195);
    expect(lt.unitemised.size).toBe(0);
    expect(lt.trees.get("TOP.TO")!.children.map((c) => c.symbol)).toContain("US.TO");
  });
});

describe("outcome", () => {
  const base = { value: 10_000, cost: 8_000, fee: 0.01, growth: 0.06, years: 10, marginalRate: 0.4 };
  it("TFSA has no tax, RRSP taxes everything, taxable taxes half the gain", () => {
    expect(outcome({ ...base, tax: "tax-free" }).tax).toBe(0);
    const rrsp = outcome({ ...base, tax: "tax-deferred" });
    expect(rrsp.tax).toBeCloseTo((rrsp.kept + rrsp.tax) * 0.4);
    const nr = outcome({ ...base, tax: "taxable" });
    expect(nr.tax).toBeCloseTo((nr.kept + nr.tax - 8_000) * 0.5 * 0.4);
    expect(nr.fees).toBeCloseTo(feeDrag(10_000, 0.01, 0.06, 10));
  });
});

describe("costBreakdown", () => {
  const acct = (key: string, tax: Account["tax"], type: string) => [key, { key, name: key, type, tax } as Account] as const;
  const accounts = new Map([acct("tfsa", "tax-free", "tfsa"), acct("rrsp", "tax-deferred", "rrsp"), acct("cash", "taxable", "cash")]);
  const us = new Map<string, Profile | null>([["VOO", fund("VOO", { sectors: { technology: 1 } }, { currency: "USD", expenseRatio: 0.0003, dividendYield: 0.012 })]]);
  const lt = (r: ReturnType<typeof rowsFor>[number]) => lookThrough([r], md(us));
  const line = (lines: ReturnType<typeof costBreakdown>, k: string) => lines.find((l) => l.key === k)!;

  it("US-listed: withholding lost in a TFSA, not in an RRSP; taxable pays tax on distributions", () => {
    const [tfsa] = rowsFor([holding("VOO", "VANGUARD S&P 500 ETF", 10_000, "tfsa")], us, {});
    const [rrsp] = rowsFor([holding("VOO", "VANGUARD S&P 500 ETF", 10_000, "rrsp")], us, {});
    const [cash] = rowsFor([holding("VOO", "VANGUARD S&P 500 ETF", 10_000, "cash")], us, {});
    const run = (r: typeof tfsa) => costBreakdown({ row: r!, fees: null, lt: lt(r!), accounts, taxRate: 0.4 });
    expect(line(run(tfsa), "withholding").amount).toBeCloseTo(10_000 * 0.012 * 0.15);
    expect(line(run(rrsp), "withholding").amount).toBeCloseTo(0);
    expect(line(run(cash), "withholding").amount).toBeCloseTo(0);
    expect(line(run(cash), "disttax").amount).toBeCloseTo(10_000 * 0.012 * 0.4);
    expect(line(run(tfsa), "mer")).toMatchObject({ status: "published", source: "Yahoo Finance", rate: 0.0003 });
    expect(line(run(tfsa), "fx").status).toBe("estimate");
  });

  it("a linked fund's fee is unknown until entered; published management fee splits the MER", () => {
    const h = holding(null, "Plan Fund", 5_000, "rrsp");
    const [linked] = rowsFor([h], us, { [h.instrument.key]: "VOO" });
    const lines = costBreakdown({ row: linked!, fees: { management: 0.0002, mer: 0.0003, ter: 0.0001, source: "Test" }, lt: null, accounts, taxRate: 0.4 });
    expect(line(lines, "mer").status).toBe("not-published");
    expect(line(lines, "ter").rate).toBe(0.0001);
    expect(yearlyCost(lines).missing).toBe(true);
    const [entered] = rowsFor([h], us, { [h.instrument.key]: "VOO" }, { [h.instrument.key]: 0.012 });
    const e = costBreakdown({ row: entered!, fees: null, lt: null, accounts, taxRate: 0.4 });
    expect(line(e, "mer")).toMatchObject({ status: "entered", amount: 60 });
    const [own] = rowsFor([holding("VOO", "VANGUARD S&P 500 ETF", 10_000, "rrsp")], us, {});
    const o = costBreakdown({ row: own!, fees: { management: 0.0002, mer: 0.0003, ter: null, source: "Test" }, lt: null, accounts, taxRate: 0.4 });
    expect(line(o, "mgmt").rate).toBe(0.0002);
    expect(line(o, "operating").rate).toBeCloseTo(0.0001);
  });
});
