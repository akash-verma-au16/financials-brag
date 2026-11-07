import { useMemo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DataGate } from "@/components/DataGate";
import { Money, Pct, Stat, chartColor } from "@/components/money";
import { SeriesChart } from "@/components/SeriesChart";
import { Badge, Button, Card, Notice, Segmented } from "@/components/ui";
import { cagr, childFundSymbols, costBreakdown, drawdownSeries, feeOf, isFundProfile, lookThrough, maxDrawdown, periodReturn, rowsFor, volatility, type Row } from "@/data/analysis";
import { accountTypeLabel } from "@/data/build";
import { ASSET_CLASS_LABEL, REGION_LABEL, holdings, type Holding } from "@/data/holdings";
import { marketSymbol, useFees, useHistory, useMarketTree, useNews, type FundFees, type MarketData, type Profile, type Range } from "@/data/market";
import type { Dataset } from "@/data/model";
import { allAccounts, scopeTransactions } from "@/data/select";
import { useSettings } from "@/data/settings";
import { formatDate, formatNumber } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { Exposure, InsideFunds, WhereItGoes } from "./AnalysisPage";
import { CostLines } from "./costs-ui";
import { Facts, MarketGate, NewsList, RangeBar, SymbolLinker, fmtNum, fmtPct, formatBig, formatPrice } from "./market-ui";

export function HoldingDetailPage() {
  const { key } = useParams({ strict: false }) as { key?: string };
  return <DataGate>{(ds) => <Detail ds={ds} instrumentKey={key ?? ""} />}</DataGate>;
}

function Detail({ ds, instrumentKey }: { ds: Dataset; instrumentKey: string }) {
  const person = useUi((s) => s.person);
  const links = useSettings((s) => s.marketLinks);
  const fees = useSettings((s) => s.feeOverrides);
  const hs = useMemo(() => holdings(ds, person), [ds, person]);
  const h = hs.find((x) => x.instrument.key === instrumentKey);
  const symbol = h ? marketSymbol(h.instrument, links) : null;
  const linked = !!h && !!links[h.instrument.key];
  const tree = useMarketTree(symbol ? [symbol] : [], childFundSymbols);
  const fundFees = useFees(symbol ? [symbol] : []);

  if (!h)
    return (
      <Card title="Holding not found">
        <p className="text-fg-2">It isn't in the current positions{person !== "all" ? " for this person" : ""}.</p>
        <BackLink />
      </Card>
    );

  return (
    <div className="space-y-5">
      <BackLink />
      {!symbol ? (
        <>
          <Header h={h} p={null} linked={false} />
          <Position ds={ds} h={h} p={null} linked={false} />
          <HoldingCosts ds={ds} row={rowsFor([h], new Map(), links, fees)[0]!} data={{ profiles: new Map(), funds: new Map() }} fees={null} />
          <Card title="Market data">
            <SymbolLinker instrumentKey={h.instrument.key} name={h.instrument.name} current={null} />
          </Card>
        </>
      ) : (
        <MarketGate state={tree} what="market data and fund holdings">
          {(data) => {
            const p = data.profiles.get(symbol) ?? null;
            const row = rowsFor([h], data.profiles, links, fees)[0]!;
            return (
              <>
                <Header h={h} p={p} linked={linked} />
                <SymbolLinker instrumentKey={h.instrument.key} name={h.instrument.name} current={symbol} />
                {linked && p && <ReferenceNotice h={h} p={p} symbol={symbol} />}
                {!p && <Card title="Market data">No data found for {symbol}. Link it to another symbol above.</Card>}
                {p?.trailing?.length ? <PlanReturns p={p} /> : null}
                {!symbol.includes(":") && p && <PriceCard symbol={symbol} h={h} p={p} linked={linked} />}
                <div className="grid gap-5 xl:grid-cols-2">
                  <Position ds={ds} h={h} p={p} linked={linked} />
                  {p && <KeyStats p={p} linked={linked} fee={feeOf(row)} feeEntered={row.feeOverride !== null} />}
                </div>
                <HoldingCosts ds={ds} row={row} data={data} fees={fundFees.status === "ready" ? (fundFees.data.get(symbol) ?? null) : null} />
                {p && isFundProfile(p) && <Breakdown row={row} data={data} />}
                {p && (p.analysts || p.financials) && (
                  <div className="grid gap-5 xl:grid-cols-2">
                    {p.analysts && <Analysts p={p} />}
                    {p.financials && <Financials p={p} />}
                  </div>
                )}
                <div className="grid gap-5 xl:grid-cols-2">
                  {p && <About p={p} />}
                  {!symbol.includes(":") && <News symbol={symbol} name={p?.name ?? h.instrument.name} />}
                </div>
              </>
            );
          }}
        </MarketGate>
      )}
    </div>
  );
}

/** What the linked data is, and what of it applies to this holding. */
function ReferenceNotice({ h, p, symbol }: { h: Holding; p: Profile; symbol: string }) {
  const kind = symbol.startsWith("SLF:") ? "Sun Life fact sheet" : symbol.startsWith("RBC:") ? "RBC Global Asset Management" : "Yahoo Finance";
  return (
    <Notice tone="info">
      <b>{h.instrument.name}</b> is shown with data for <b>{p.name}</b> ({kind}). What it holds, its sector and country split and its returns describe the
      fund your units invest in, or one tracking the same mix. Its unit price and fee are <b>not</b> yours: your units started at a different price and
      your plan charges its own fee. Your value and unit value come from your account; enter your plan’s fee below to include it in costs.
    </Notice>
  );
}

/** Everything this holding costs, line by line. */
function HoldingCosts({ ds, row, data, fees }: { ds: Dataset; row: Row; data: MarketData; fees: FundFees | null }) {
  const taxRate = useSettings((s) => s.taxRate);
  const accounts = useMemo(() => new Map(ds.accounts.map((a) => [a.key, a])), [ds]);
  const lt = useMemo(() => (row.profile ? lookThrough([row], data) : null), [row, data]);
  const lines = costBreakdown({ row, fees, lt, accounts, taxRate });
  if (!lines.length) return null;
  return (
    <Card title="What it costs you" actions={<span className="text-[12px] text-fg-3">fees, taxes and selling costs, in dollars</span>}>
      <CostLines lines={lines} value={row.h.marketValue} />
    </Card>
  );
}

/** Full look-through of this one holding: mix, sectors, countries, every company, funds inside funds. */
function Breakdown({ row, data }: { row: Row; data: MarketData }) {
  const lt = useMemo(() => lookThrough([row], data), [row, data]);
  if (!lt.total) return null;
  return (
    <>
      <Exposure lt={lt} />
      <WhereItGoes lt={lt} rows={[row]} />
      <InsideFunds lt={lt} rows={[row]} />
    </>
  );
}

function BackLink() {
  return (
    <Link to="/holdings" className="inline-flex items-center gap-1 text-[13px] text-fg-2 hover:text-fg">
      <ArrowLeft className="size-4" aria-hidden /> All holdings
    </Link>
  );
}

function Header({ h, p, linked }: { h: Holding; p: Profile | null; linked: boolean }) {
  const i = h.instrument;
  const unit = h.quantity ? h.marketValue / h.quantity : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[22px] font-semibold tracking-tight">{linked ? i.name : (p?.name ?? i.name)}</h2>
            {i.symbol && <Badge tone="accent">{i.symbol}</Badge>}
            <Badge>{ASSET_CLASS_LABEL[i.assetClass]}</Badge>
            {i.region !== "n/a" && <Badge>{REGION_LABEL[i.region]}</Badge>}
            {p?.quoteType && <Badge tone="info">{p.quoteType === "EQUITY" ? "Stock" : p.quoteType === "MUTUALFUND" ? "Mutual fund" : p.quoteType}</Badge>}
          </div>
          {p && (
            <p className="mt-1 text-[13px] text-fg-3">
              {linked ? <>Data from {p.name}{p.category ? ` · ${p.category}` : ""}</> : [p.exchange, p.currency, p.sector, p.industry, p.category].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {linked && unit !== null && (
          <div className="text-right">
            <div className="num text-[26px] font-semibold leading-8">
              <Money value={unit} style="cents" />
            </div>
            <div className="text-[12px] text-fg-3">your unit value (from your account)</div>
          </div>
        )}
        {!linked && p?.price != null && (
          <div className="text-right">
            <div className="num text-[26px] font-semibold leading-8">{formatPrice(p.price, p.currency)}</div>
            {p.change != null && (
              <div className={p.change >= 0 ? "num text-pos" : "num text-neg"}>
                {p.change >= 0 ? "+" : ""}
                {formatPrice(p.change, p.currency)} ({fmtPct(p.changePct, 2)}) today
              </div>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Your value" value={<Money value={h.marketValue} />} sub={`${h.lots.length} account${h.lots.length > 1 ? "s" : ""}`} />
        <Stat
          label="Unrealised gain"
          value={h.gain !== null ? <Money value={h.gain} signed tone /> : "—"}
          sub={h.gainPct !== null ? <Pct value={h.gainPct} tone /> : "no book value"}
        />
        <Stat label="Share of portfolio" value={<Pct value={h.weight} />} />
        <Stat
          label="Quantity"
          value={h.quantity !== null ? formatNumber(h.quantity) : "—"}
          sub={h.quantity && h.bookValue ? <>avg cost <Money value={h.bookValue / h.quantity} style="cents" /> CAD</> : undefined}
        />
      </div>
    </div>
  );
}

const RANGES: { value: Range; label: string }[] = [
  { value: "1mo", label: "1M" },
  { value: "6mo", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "5y", label: "5Y" },
  { value: "max", label: "Max" },
];

function PriceCard({ symbol, h, p, linked }: { symbol: string; h: Holding; p: Profile | null; linked: boolean }) {
  const [range, setRange] = useState<Range>("1y");
  const [view, setView] = useState<"price" | "drawdown">("price");
  const hist = useHistory(symbol, range);
  const long = useHistory(symbol, "5y");
  const cur = p?.currency ?? "CAD";
  const avgCost = !linked && cur === "CAD" && h.quantity && h.bookValue ? h.bookValue / h.quantity : null;

  return (
    <Card
      title={linked ? `Price of ${p?.name ?? symbol} (reference fund, not your units)` : "Price"}
      actions={
        <>
          <Segmented label="View" value={view} onChange={setView} options={[{ value: "price", label: "Price" }, { value: "drawdown", label: "Drawdown" }]} />
          <Segmented label="Range" value={range} onChange={setRange} options={RANGES} />
        </>
      }
    >
      <MarketGate state={hist} what="price history">
        {({ history }) =>
          !history ? (
            <p className="text-fg-3">No price history.</p>
          ) : view === "price" ? (
            <SeriesChart
              label={`${symbol} price`}
              area
              series={[{ key: "p", label: symbol, points: history.points.map((x) => ({ d: x.d, v: x.p })) }]}
              format={(v) => formatPrice(v, cur)}
              refLines={avgCost ? [{ v: avgCost, label: `your avg cost ${formatPrice(avgCost, cur)}` }] : []}
            />
          ) : (
            <SeriesChart
              label={`${symbol} drawdown`}
              area
              series={[{ key: "dd", label: "From peak", points: drawdownSeries(history.points).map((x) => ({ d: x.d, v: x.c })), color: "var(--neg)" }]}
              format={(v) => fmtPct(v)}
            />
          )
        }
      </MarketGate>
      <div className="mt-4 border-t border-line-subtle pt-4">
        <MarketGate state={long} what="returns">
          {({ history }) => {
            const pts = history?.points ?? [];
            const dd = maxDrawdown(pts);
            const ytdDays = Math.round((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 1)) / 86_400_000);
            return (
              <Facts
                items={[
                  ["1 month", <R v={periodReturn(pts, 30)} />],
                  ["Year to date", <R v={periodReturn(pts, ytdDays)} />],
                  ["1 year", <R v={periodReturn(pts, 365)} />],
                  ["3 years, per year", <R v={(() => { const r = periodReturn(pts, 1096); return r === null ? null : Math.pow(1 + r, 1 / 3) - 1; })()} />],
                  ["5 years, per year", <R v={cagr(pts)} />, "Annualised, with dividends reinvested"],
                  ["Volatility", fmtPct(volatility(pts)), "Annualised standard deviation of weekly returns, last 5 years"],
                  ["Worst drop (5y)", dd ? <span className="text-neg">{fmtPct(dd.depth)}</span> : "—", dd ? `${formatDate(dd.peak)} → ${formatDate(dd.trough)}${dd.recovered ? `, recovered ${formatDate(dd.recovered)}` : ", not yet recovered"}` : undefined],
                  ["Currency", history?.currency ?? "—"],
                ]}
              />
            );
          }}
        </MarketGate>
        <p className="mt-2 text-[12px] text-fg-3">Returns include reinvested dividends, in the listing currency.</p>
      </div>
    </Card>
  );
}

/** Returns from a plan fact sheet, against the fund's benchmark. */
function PlanReturns({ p }: { p: Profile }) {
  const rows = p.trailing!.filter((r) => r.fund !== null);
  const max = Math.max(...rows.flatMap((r) => [Math.abs(r.fund ?? 0), Math.abs(r.index ?? 0)]), 0.01);
  const longer = rows.filter((r) => /year/i.test(r.label) && parseInt(r.label) >= 2 && r.index !== null);
  const gap = longer.length ? longer.reduce((s, r) => s + (r.fund! - r.index!), 0) / longer.length : null;
  return (
    <Card title="Returns vs benchmark" actions={<span className="text-[12px] text-fg-3">from the plan's fact sheet{p.benchmark ? ` · benchmark: ${p.benchmark}` : ""}</span>}>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[90px_1fr_70px_70px_70px] items-center gap-3 text-[13px]">
            <span className="text-fg-2">{r.label}</span>
            <div className="space-y-0.5">
              <div className="h-2 rounded-full" style={{ width: `${(Math.abs(r.fund!) / max) * 100}%`, background: r.fund! >= 0 ? "var(--accent)" : "var(--neg)" }} />
              {r.index !== null && <div className="h-2 rounded-full bg-line-strong" style={{ width: `${(Math.abs(r.index) / max) * 100}%` }} />}
            </div>
            <Pct value={r.fund!} tone className="text-right" />
            <span className="text-right text-fg-3">{r.index !== null ? <Pct value={r.index} /> : "—"}</span>
            <span className="text-right">{r.index !== null ? <Pct value={r.fund! - r.index} tone /> : "—"}</span>
          </div>
        ))}
        <div className="grid grid-cols-[90px_1fr_70px_70px_70px] gap-3 text-[11px] uppercase tracking-wide text-fg-3">
          <span />
          <span className="flex gap-3">
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-accent" /> fund</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-line-strong" /> benchmark</span>
          </span>
          <span className="text-right">Fund</span>
          <span className="text-right">Benchmark</span>
          <span className="text-right">Difference</span>
        </div>
      </div>
      <p className="mt-3 text-[12px] text-fg-3">
        Returns over a year are per year. {gap !== null && (gap < -0.01
          ? `Over 2+ years the fund has trailed its benchmark by about ${Math.abs(gap * 100).toFixed(1)} points a year: that's the fund's managers (and fees) underperforming the mix it aims to beat.`
          : gap > 0.01
            ? `Over 2+ years the fund has beaten its benchmark by about ${(gap * 100).toFixed(1)} points a year.`
            : "The fund has tracked its benchmark closely, as an index fund should.")}{" "}
        A plan fund's unit price isn't comparable with the retail fund's: plan units started at a different price and date. Compare returns like these instead.
      </p>
    </Card>
  );
}

const R = ({ v }: { v: number | null }) => (v === null ? <>—</> : <Pct value={v} tone />);

function Position({ ds, h, p, linked }: { ds: Dataset; h: Holding; p: Profile | null; linked: boolean }) {
  const person = useUi((s) => s.person);
  const accounts = new Map(allAccounts(ds).map((a) => [a.key, a]));
  const income = useMemo(() => {
    const sym = h.instrument.symbol;
    if (!sym) return null;
    const txns = scopeTransactions(ds, person).filter((t) => t.symbol === sym && (t.kind === "investment-income" || t.kind === "tax"));
    const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
    const sum = (f: (t: (typeof txns)[number]) => boolean) => txns.filter(f).reduce((s, t) => s + t.amount * t.share, 0);
    return { all: sum(() => true), year: sum((t) => t.date >= yearAgo), count: txns.filter((t) => t.kind === "investment-income").length, since: txns.at(-1)?.date };
  }, [ds, person, h]);
  const expected = p?.dividendYield ? p.dividendYield * h.marketValue : null;

  return (
    <Card title="Your position">
      <table className="w-full text-[13px]">
        <thead className="text-left text-[11px] uppercase tracking-wide text-fg-3">
          <tr>
            <th className="pb-2 font-medium">Account</th>
            <th className="pb-2 text-right font-medium">Book</th>
            <th className="pb-2 text-right font-medium">Value</th>
            <th className="pb-2 text-right font-medium">Gain</th>
          </tr>
        </thead>
        <tbody>
          {h.lots.map((l) => {
            const a = accounts.get(l.accountKey);
            return (
              <tr key={l.accountKey} className="border-t border-line-subtle">
                <td className="py-1.5">
                  {l.accountName} {a && <span className="text-[11px] text-fg-3">· {accountTypeLabel(a.type)}</span>}
                </td>
                <td className="py-1.5 text-right">{l.bookValue !== null ? <Money value={l.bookValue} /> : "—"}</td>
                <td className="py-1.5 text-right"><Money value={l.marketValue} /></td>
                <td className="py-1.5 text-right">{l.bookValue ? <Money value={l.marketValue - l.bookValue} signed tone /> : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {h.quantity ? (
        <p className="mt-3 text-[12px] text-fg-3">
          Unit value from your account: <Money value={h.marketValue / h.quantity} style="cents" /> per unit
          {h.bookValue ? <> (you paid <Money value={h.bookValue / h.quantity} style="cents" /> on average)</> : null}.
        </p>
      ) : null}
      <FeeEntry h={h} suggested={linked ? null : (p?.expenseRatio ?? null)} />
      <div className="mt-4 border-t border-line-subtle pt-4">
        <Facts
          items={[
            ["Income, last 12 months", income ? <Money value={income.year} /> : "—", "Dividends and distributions received, after withholding tax"],
            ["Income, all recorded", income ? <Money value={income.all} /> : "—", income?.since ? `Since ${formatDate(income.since)}` : undefined],
            ["Expected next 12 months", expected !== null && !linked ? <Money value={expected} /> : "—", linked ? "Plan funds usually reinvest distributions inside the fund" : "Current yield × your value"],
            [
              "Gain + income",
              h.gain !== null && income ? <Money value={h.gain + income.all} signed tone /> : "—",
              "Unrealised gain plus income received (income only since the transaction history starts)",
            ],
          ]}
        />
      </div>
    </Card>
  );
}

function KeyStats({ p, linked, fee, feeEntered }: { p: Profile; linked: boolean; fee: number | null; feeEntered: boolean }) {
  const fund = !!p.fund || p.quoteType === "ETF" || p.quoteType === "MUTUALFUND";
  const cur = p.currency;
  if (linked)
    return (
      <Card title="Key numbers" actions={<span className="text-[12px] text-fg-3">of the fund your units track</span>}>
        <Facts
          items={[
            ["Your fee", fee !== null ? `${(fee * 100).toFixed(2)}%` : "not entered", feeEntered ? "Entered by you" : "Enter it in Your position"],
            ["Reference fund's fee", fmtPct(p.expenseRatio, 2), "The linked fund's own fee: usually not what your plan charges"],
            ["Yield", fmtPct(p.dividendYield, 2)],
            ["3y return / yr", fmtPct(p.threeYearReturn)],
            ["5y return / yr", fmtPct(p.fiveYearReturn)],
            ["P/E of holdings", p.trailingPE ? fmtNum(p.trailingPE, 1) : p.fund?.pe ? fmtNum(p.fund.pe < 1 ? 1 / p.fund.pe : p.fund.pe, 1) : "—"],
            ["Risk", p.riskLevel ?? "—"],
            ["Benchmark", p.benchmark ?? "—"],
          ]}
        />
      </Card>
    );
  return (
    <Card title="Key numbers">
      <Facts
        items={[
          ...(fund
            ? ([
                ["Fee (MER)", fmtPct(p.expenseRatio, 2), "Annual management expense ratio"],
                ["Fund size", formatBig(p.totalAssets, cur)],
                ["Yield", fmtPct(p.dividendYield, 2)],
                ["3y return / yr", fmtPct(p.threeYearReturn)],
                ["5y return / yr", fmtPct(p.fiveYearReturn)],
                ["Turnover", fmtPct(p.turnover, 0), "Share of holdings replaced each year"],
                ["P/E of holdings", p.fund?.pe ? fmtNum(p.fund.pe < 1 ? 1 / p.fund.pe : p.fund.pe, 1) : fmtNum(p.trailingPE, 1)],
                ["Beta", fmtNum(p.beta), "Sensitivity to the market: 1 = moves with it"],
              ] as [string, string, string?][])
            : ([
                ["Market cap", formatBig(p.marketCap, cur)],
                ["P/E (trailing)", fmtNum(p.trailingPE, 1)],
                ["P/E (forward)", fmtNum(p.forwardPE, 1)],
                ["PEG", fmtNum(p.pegRatio), "P/E divided by expected growth"],
                ["Price / book", fmtNum(p.priceToBook)],
                ["EPS", fmtNum(p.eps)],
                ["Dividend yield", fmtPct(p.dividendYield, 2)],
                ["Payout ratio", fmtPct(p.payoutRatio, 0), "Share of earnings paid as dividends"],
                ["Beta", fmtNum(p.beta), "Sensitivity to the market: 1 = moves with it"],
                ["Next earnings", p.nextEarnings ? formatDate(p.nextEarnings) : "—"],
              ] as [string, string, string?][])),
          ["50-day average", formatPrice(p.avg50, cur)],
          ["200-day average", formatPrice(p.avg200, cur)],
        ]}
      />
      {p.low52 != null && p.high52 != null && p.price != null && (
        <div className="mt-5">
          <div className="text-[12px] text-fg-3">52-week range</div>
          <RangeBar low={p.low52} high={p.high52} value={p.price} format={(v) => formatPrice(v, cur)} marks={p.avg200 ? [{ v: p.avg200, label: "200d" }] : []} />
        </div>
      )}
    </Card>
  );
}

const REC_COLORS = ["var(--pos)", "color-mix(in oklab, var(--pos) 55%, var(--surface-panel))", "var(--surface-selected)", "color-mix(in oklab, var(--neg) 55%, var(--surface-panel))", "var(--neg)"];

function Analysts({ p }: { p: Profile }) {
  const a = p.analysts!;
  const trend = a.trend.filter((t) => t.strongBuy + t.buy + t.hold + t.sell + t.strongSell > 0);
  return (
    <Card title="Analysts" actions={a.key && <Badge tone={/buy/.test(a.key) ? "pos" : /sell|under/.test(a.key) ? "neg" : "neutral"}>{a.key.replace(/_/g, " ")}</Badge>}>
      {a.targetLow != null && a.targetHigh != null && p.price != null && (
        <div className="mb-5">
          <div className="text-[12px] text-fg-3">
            Price targets{a.count ? ` from ${a.count} analysts` : ""}: mean {formatPrice(a.targetMean, p.currency)} (
            {a.targetMean ? <Pct value={a.targetMean / p.price - 1} tone /> : "—"} from today)
          </div>
          <RangeBar
            low={Math.min(a.targetLow, p.price)}
            high={Math.max(a.targetHigh, p.price)}
            value={p.price}
            format={(v) => formatPrice(v, p.currency)}
            marks={a.targetMean ? [{ v: a.targetMean, label: "mean" }] : []}
          />
        </div>
      )}
      {trend.length > 0 && (
        <div className="space-y-1.5">
          {trend.map((t) => {
            const parts = [t.strongBuy, t.buy, t.hold, t.sell, t.strongSell];
            const total = parts.reduce((s, x) => s + x, 0);
            return (
              <div key={t.period} className="flex items-center gap-3 text-[12px]">
                <span className="w-20 shrink-0 text-fg-3">{t.period === "0m" ? "This month" : `${t.period.replace("-", "").replace("m", "")} mo ago`}</span>
                <div className="flex h-4 flex-1 overflow-hidden rounded">
                  {parts.map((x, i) => x > 0 && <div key={i} style={{ width: `${(x / total) * 100}%`, background: REC_COLORS[i] }} title={`${["Strong buy", "Buy", "Hold", "Sell", "Strong sell"][i]}: ${x}`} />)}
                </div>
                <span className="w-8 text-right text-fg-3">{total}</span>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-fg-3">
            {["Strong buy", "Buy", "Hold", "Sell", "Strong sell"].map((l, i) => (
              <span key={l} className="flex items-center gap-1">
                <span className="size-2 rounded-sm" style={{ background: REC_COLORS[i] }} /> {l}
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="mt-3 text-[12px] text-fg-3">Analyst opinions are often wrong and tend to lag prices. Context, not advice.</p>
    </Card>
  );
}

function Financials({ p }: { p: Profile }) {
  const f = p.financials!;
  const cur = f.currency ?? p.currency;
  const years = f.yearly.filter((y) => y.revenue !== null);
  const max = Math.max(...years.map((y) => y.revenue ?? 0), 1);
  return (
    <Card title="Business">
      {years.length > 0 && (
        <div className="mb-5">
          <div className="mb-2 flex gap-4 text-[12px] text-fg-3">
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm" style={{ background: chartColor(0) }} /> Revenue</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm" style={{ background: chartColor(2) }} /> Earnings</span>
          </div>
          <div className="flex h-36 items-end gap-4">
            {years.map((y) => (
              <div key={y.year} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-28 w-full items-end justify-center gap-1">
                  <div className="w-1/3 rounded-t" style={{ height: `${((y.revenue ?? 0) / max) * 100}%`, background: chartColor(0) }} title={`Revenue ${formatBig(y.revenue, cur)}`} />
                  <div
                    className="w-1/3 rounded-t"
                    style={{ height: `${(Math.max(y.earnings ?? 0, 0) / max) * 100}%`, background: (y.earnings ?? 0) < 0 ? "var(--neg)" : chartColor(2) }}
                    title={`Earnings ${formatBig(y.earnings, cur)}`}
                  />
                </div>
                <span className="text-[11px] text-fg-3">{y.year}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <Facts
        items={[
          ["Revenue (12m)", formatBig(f.revenue, cur)],
          ["Revenue growth", fmtPct(f.revenueGrowth), "Latest quarter vs a year earlier"],
          ["Earnings growth", fmtPct(f.earningsGrowth)],
          ["Gross margin", fmtPct(f.grossMargin)],
          ["Operating margin", fmtPct(f.operatingMargin)],
          ["Profit margin", fmtPct(f.profitMargin)],
          ["Return on equity", fmtPct(f.roe)],
          ["Debt / equity", f.debtToEquity != null ? `${fmtNum(f.debtToEquity / 100)}×` : "—"],
          ["Free cash flow", formatBig(f.freeCashflow, cur)],
          ["Cash", formatBig(f.totalCash, cur)],
          ["Debt", formatBig(f.totalDebt, cur)],
          ["Current ratio", fmtNum(f.currentRatio), "Short-term assets ÷ short-term debts"],
        ]}
      />
    </Card>
  );
}

function About({ p }: { p: Profile }) {
  const [more, setMore] = useState(false);
  const fund = !!p.fund;
  return (
    <Card title={fund ? "About the fund" : "About the company"}>
      <Facts
        items={
          fund
            ? [
                ["Provider", p.fundFamily ?? "—"],
                ["Type", p.legalType ?? p.quoteType ?? "—"],
                ["Category", p.category ?? "—"],
                ["Since", p.inceptionDate ? formatDate(p.inceptionDate) : "—"],
              ]
            : [
                ["Sector", p.sector ?? "—"],
                ["Industry", p.industry ?? "—"],
                ["Country", [p.city, p.country].filter(Boolean).join(", ") || "—"],
                ["Employees", p.employees ? formatNumber(p.employees) : "—"],
              ]
        }
      />
      {p.summary && (
        <p className="mt-4 text-[13px] leading-relaxed text-fg-2">
          {more || p.summary.length < 420 ? p.summary : `${p.summary.slice(0, 400)}…`}{" "}
          {p.summary.length >= 420 && (
            <button className="font-medium text-accent hover:underline" onClick={() => setMore(!more)}>
              {more ? "Less" : "More"}
            </button>
          )}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-4 text-[13px]">
        {p.website && (
          <a className="inline-flex items-center gap-1 text-accent hover:underline" href={p.website} target="_blank" rel="noopener noreferrer">
            {p.symbol.startsWith("SLF:") ? "Fund fact sheet" : "Website"} <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
        {!p.symbol.includes(":") && <a className="inline-flex items-center gap-1 text-accent hover:underline" href={`https://finance.yahoo.com/quote/${encodeURIComponent(p.symbol)}`} target="_blank" rel="noopener noreferrer">
          Yahoo Finance <ExternalLink className="size-3.5" aria-hidden />
        </a>}
      </div>
    </Card>
  );
}

function News({ symbol, name }: { symbol: string; name: string }) {
  const news = useNews(symbol, name);
  return (
    <Card title="News">
      <MarketGate state={news} what="news">
        {(d) => <NewsList items={d.news.slice(0, 12)} />}
      </MarketGate>
    </Card>
  );
}

/** The fee you actually pay on this holding (e.g. from a pension plan statement). */
function FeeEntry({ h, suggested }: { h: Holding; suggested: number | null }) {
  const fee = useSettings((s) => s.feeOverrides[h.instrument.key]);
  const setFee = useSettings((s) => s.setFeeOverride);
  const [text, setText] = useState(fee !== undefined ? (fee * 100).toFixed(2) : "");
  const save = () => {
    const v = Number(text.replace("%", "").trim());
    setFee(h.instrument.key, text.trim() === "" || !Number.isFinite(v) ? null : v / 100);
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
      <label htmlFor={`fee-${h.instrument.key}`} className="text-fg-2">
        Your fee (MER) per year
      </label>
      <input
        id={`fee-${h.instrument.key}`}
        className="h-7 w-20 rounded border border-line bg-raised px-2 text-right"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder={suggested !== null ? (suggested * 100).toFixed(2) : "e.g. 0.85"}
        inputMode="decimal"
      />
      <span className="text-fg-3">%</span>
      {fee !== undefined && (
        <Button variant="ghost" onClick={() => (setText(""), setFee(h.instrument.key, null))}>
          Clear
        </Button>
      )}
      <span className="text-[12px] text-fg-3">{fee !== undefined ? "Used in costs." : suggested !== null ? "Leave blank to use the fund's published fee." : "From your plan statement or fund facts."}</span>
    </div>
  );
}
