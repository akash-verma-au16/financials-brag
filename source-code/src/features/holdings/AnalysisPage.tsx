import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, CircleCheck, Info, ListFilter, TriangleAlert } from "lucide-react";
import { DataGate } from "@/components/DataGate";
import { Heatmap } from "@/components/Heatmap";
import { Money, Pct, Stat, StackBar, chartColor } from "@/components/money";
import { Sankey, type FlowNode } from "@/components/Sankey";
import { SeriesChart } from "@/components/SeriesChart";
import { Badge, Button, Card, Modal, Notice, Segmented, cx } from "@/components/ui";
import {
  FEE_TIER,
  SECTOR_LABEL,
  backtest,
  cagr,
  childFundSymbols,
  costBreakdown,
  correlations,
  countryName,
  currencyOf,
  feeDrag,
  feeOf,
  feeTier,
  inCad,
  insights,
  lookThrough,
  maxDrawdown,
  outcome,
  overlap,
  peOf,
  periodReturn,
  regionOf,
  rowsFor,
  volatility,
  weighted,
  yieldOf,
  yearlyCost,
  type CostLine,
  type FeeTier,
  type Insight,
  type InsightCategory,
  type LookThrough,
  type Node,
  type Row,
} from "@/data/analysis";
import { accountTypeLabel } from "@/data/build";
import { REGION_LABEL, holdings } from "@/data/holdings";
import { USDCAD, marketSymbol, useFees, useHistories, useMacro, useMarketTree, type FundFees, type MarketData, type PricePoint, type Range } from "@/data/market";
import type { Account, Dataset } from "@/data/model";
import { scopeAccounts } from "@/data/select";
import { useSettings } from "@/data/settings";
import { formatDate, formatMoney } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { CostLines, STATUS } from "./costs-ui";
import { Facts, MarketGate, ShareList, fmtNum, fmtPct } from "./market-ui";

export function AnalysisPage() {
  return <DataGate>{(ds) => <Analysis ds={ds} />}</DataGate>;
}

function Analysis({ ds }: { ds: Dataset }) {
  const person = useUi((s) => s.person);
  const links = useSettings((s) => s.marketLinks);
  const search = useSearch({ strict: false }) as { account?: string };
  const navigate = useNavigate();
  const scope = search.account ?? "all";
  const setScope = (account: string) => void navigate({ to: "/analysis", search: account === "all" ? {} : { account } });

  const all = useMemo(() => holdings(ds, person), [ds, person]);
  const symbols = all.flatMap((h) => marketSymbol(h.instrument, links) ?? []);
  const tree = useMarketTree(symbols, childFundSymbols);

  if (!all.length) return <Card title="Portfolio analysis">No positions found. Add your Wealthica Positions export on the Data page.</Card>;

  return (
    <MarketGate state={tree} what="market data and fund holdings (the first load takes a few seconds)">
      {(data) => <Report ds={ds} data={data} scope={scope} setScope={setScope} />}
    </MarketGate>
  );
}

const REGION_COLOR: Record<string, string> = { US: chartColor(0), CA: chartColor(1), intl: chartColor(3), emerging: chartColor(7), mixed: "var(--text-disabled)", global: chartColor(5), "n/a": "var(--text-disabled)" };
const MIX_COLOR = { stocks: chartColor(0), bonds: chartColor(6), cash: chartColor(8), other: chartColor(4) };

function Report({ ds, data, scope, setScope }: { ds: Dataset; data: MarketData; scope: string; setScope: (s: string) => void }) {
  const person = useUi((s) => s.person);
  const links = useSettings((s) => s.marketLinks);
  const birthYear = useSettings((s) => s.birthYear);
  const macro = useMacro();
  const accounts = useMemo(() => new Map(scopeAccounts(ds, person).map((a) => [a.key, a as Account])), [ds, person]);
  const hs = useMemo(() => holdings(ds, person, scope === "all" ? null : scope), [ds, person, scope]);
  const fees = useSettings((s) => s.feeOverrides);
  const rows = useMemo(() => rowsFor(hs, data.profiles, links, fees), [hs, data, links, fees]);
  const lt = useMemo(() => lookThrough(rows, data), [rows, data]);
  const [risk, setRisk] = useState<{ drawdown: number | null; volatility: number | null } | null>(null);
  const policyRate = macro.status === "ready" ? (macro.data.policyRate?.value ?? null) : null;
  const notes = useMemo(
    () => insights({ rows, lt, accounts, data, fee: weighted(rows, feeOf), risk, policyRate, birthYear }),
    [rows, lt, accounts, data, risk, policyRate, birthYear],
  );
  const [modal, setModal] = useState<"scope" | "insights" | null>(null);
  const scopeName = scope === "all" ? "All accounts" : (accounts.get(scope)?.name ?? "Account");
  const warn = notes.filter((n) => n.level === "warn").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-fg-2">
          Everything you own, looked through every fund down to the companies. Data from fund holdings files, SEC filings, Yahoo Finance and the Bank of
          Canada; only ticker symbols leave your machine. Informational, not advice.
        </p>
        <div className="flex items-center gap-2">
          <Button onClick={() => setModal("scope")} title="Choose which accounts to analyse">
            <ListFilter className="size-4" aria-hidden /> {scopeName} <ChevronDown className="size-3.5" aria-hidden />
          </Button>
          <Button onClick={() => setModal("insights")} variant={warn ? "primary" : "secondary"}>
            {warn ? <TriangleAlert className="size-4" aria-hidden /> : <Info className="size-4" aria-hidden />} What stands out
            <span className="rounded-full bg-black/15 px-1.5 text-[11px]">{notes.length}</span>
          </Button>
        </div>
      </div>

      <Vitals rows={rows} lt={lt} />
      <Exposure lt={lt} />
      <WhereItGoes lt={lt} rows={rows} />
      <InsideFunds lt={lt} rows={rows} />
      <Performance rows={rows} onRisk={setRisk} policyRate={policyRate} />
      <Costs rows={rows} accounts={accounts} data={data} />
      <Overlap rows={rows} data={data} />
      <MacroCard />

      <Modal open={modal === "scope"} onClose={() => setModal(null)} title="Which accounts to analyse">
        <AccountPicker
          ds={ds}
          data={data}
          scope={scope}
          setScope={(s) => {
            setScope(s);
            setModal(null);
          }}
        />
      </Modal>
      <Modal open={modal === "insights"} onClose={() => setModal(null)} title={`What stands out · ${scopeName}`} wide>
        <InsightsPanel notes={notes} total={lt.total} />
      </Modal>
    </div>
  );
}

// ── Vitals ──────────────────────────────────────────────────────────────────

function Vitals({ rows, lt }: { rows: Row[]; lt: LookThrough }) {
  const total = lt.total;
  const fee = weighted(rows, feeOf);
  const yld = weighted(rows, yieldOf);
  const beta = weighted(rows, (r) => r.profile?.beta ?? null);
  const pe = weighted(rows, peOf, true);
  const tier = feeTier(fee.value);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Stat label="Invested" value={<Money value={total} />} sub={`${rows.length} holdings · ${lt.companies.length.toLocaleString("en-CA")} companies`} />
      <Stat
        label="Average fee"
        value={fee.value !== null ? `${(fee.value * 100).toFixed(2)}%` : "—"}
        sub={fee.value !== null ? <><Money value={fee.value * total} /> a year · {tier && FEE_TIER[tier].label.toLowerCase()}</> : "no fee data"}
        hint={`Value-weighted MER; stocks and cash count as 0. Based on ${fmtPct(fee.coverage, 0)} of the portfolio.`}
      />
      <Stat label="Yield" value={yld.value !== null ? `${(yld.value * 100).toFixed(2)}%` : "—"} sub={yld.value !== null ? <><Money value={yld.value * total * yld.coverage} /> a year</> : undefined} />
      <Stat label="Beta" value={fmtNum(beta.value)} sub="1.0 = moves with the market" hint={`Based on ${fmtPct(beta.coverage, 0)} of the portfolio`} />
      <Stat label="P/E" value={fmtNum(pe.value, 1)} sub="price ÷ earnings, blended" hint={`Based on ${fmtPct(pe.coverage, 0)} of the portfolio`} />
      <Stat label="Largest company" value={lt.companies[0] ? <Pct value={lt.companies[0].value / (total || 1)} /> : "—"} sub={lt.companies[0]?.name} />
    </div>
  );
}

// ── Accounts ────────────────────────────────────────────────────────────────

function AccountPicker({ ds, data, scope, setScope }: { ds: Dataset; data: MarketData; scope: string; setScope: (s: string) => void }) {
  const person = useUi((s) => s.person);
  const links = useSettings((s) => s.marketLinks);
  const fees = useSettings((s) => s.feeOverrides);
  const withPositions = new Set(ds.positions.map((p) => p.accountKey));
  const accounts = scopeAccounts(ds, person).filter((a) => withPositions.has(a.key)).sort((a, b) => b.value - a.value);
  const summary = (key: string | null) => {
    const rows = rowsFor(holdings(ds, person, key), data.profiles, links, fees);
    return { value: rows.reduce((s, r) => s + r.h.marketValue, 0), count: rows.length, fee: weighted(rows, feeOf).value, top: rows.slice(0, 3) };
  };
  const all = summary(null);
  const row = (key: string, title: string, sub: string, s: ReturnType<typeof summary>) => (
    <button
      key={key}
      onClick={() => setScope(key)}
      className={cx("flex w-full items-center gap-4 rounded-md border px-3 py-2.5 text-left", scope === key ? "border-accent bg-accent-subtle" : "border-line-subtle hover:bg-hover")}
      aria-pressed={scope === key}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold">{title}</div>
        <div className="truncate text-[12px] text-fg-3">
          {sub} · {s.count} holdings{s.fee !== null ? ` · fee ${(s.fee * 100).toFixed(2)}%` : ""} · {s.top.map((r) => r.h.instrument.symbol ?? r.h.instrument.name).join(", ")}
        </div>
      </div>
      <div className="w-28 shrink-0 text-right">
        <Money value={s.value} className="text-[14px] font-semibold" />
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-selected">
          <div className="h-full rounded-full bg-accent" style={{ width: `${(s.value / (all.value || 1)) * 100}%` }} />
        </div>
      </div>
    </button>
  );
  return (
    <div className="space-y-1.5">
      {row("all", "All accounts", "everything invested", all)}
      {accounts.map((a) => row(a.key, a.name, `${accountTypeLabel(a.type)} · ${a.tax}`, summary(a.key)))}
    </div>
  );
}

// ── Insights ────────────────────────────────────────────────────────────────

const CATEGORY: Record<InsightCategory, string> = {
  concentration: "Concentration",
  diversification: "Diversification",
  fees: "Fees",
  tax: "Tax",
  risk: "Risk",
  cash: "Cash",
  allocation: "Allocation",
  data: "Data",
};
const LEVEL = {
  warn: { label: "Worth acting on", icon: TriangleAlert, color: "var(--warn)", bg: "bg-warn-subtle" },
  info: { label: "Good to know", icon: Info, color: "var(--info)", bg: "bg-info-subtle" },
  good: { label: "Doing well", icon: CircleCheck, color: "var(--pos)", bg: "bg-pos-subtle" },
} as const;

function InsightsPanel({ notes, total }: { notes: Insight[]; total: number }) {
  const [level, setLevel] = useState<"all" | Insight["level"]>("all");
  const [cat, setCat] = useState<InsightCategory | "all">("all");
  const shown = notes.filter((n) => (level === "all" || n.level === level) && (cat === "all" || n.category === cat));
  const cats = [...new Set(notes.map((n) => n.category))];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {(["warn", "info", "good"] as const).map((l) => {
          const L = LEVEL[l];
          const n = notes.filter((x) => x.level === l).length;
          return (
            <button
              key={l}
              onClick={() => setLevel(level === l ? "all" : l)}
              className={cx("flex items-center gap-3 rounded-md border px-3 py-2 text-left", level === l ? "border-accent" : "border-line-subtle", L.bg)}
              aria-pressed={level === l}
            >
              <L.icon className="size-5 shrink-0" style={{ color: L.color }} aria-hidden />
              <div>
                <div className="text-[20px] font-semibold leading-6">{n}</div>
                <div className="text-[12px] text-fg-2">{L.label}</div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(["all", ...cats] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cx("rounded-full border px-2.5 py-0.5 text-[12px]", cat === c ? "border-accent bg-accent-subtle text-fg" : "border-line-subtle text-fg-2 hover:bg-hover")}
          >
            {c === "all" ? "All topics" : CATEGORY[c]} {c !== "all" && <span className="text-fg-3">{notes.filter((n) => n.category === c).length}</span>}
          </button>
        ))}
      </div>
      <ul className="space-y-2.5">
        {shown.map((n, i) => {
          const L = LEVEL[n.level];
          const share = n.share ?? (n.amount !== undefined ? n.amount / (total || 1) : undefined);
          return (
            <li key={i} className="overflow-hidden rounded-md border border-line-subtle bg-raised" style={{ borderLeft: `4px solid ${L.color}` }}>
              <div className="flex gap-3 p-3">
                <L.icon className="mt-0.5 size-4 shrink-0" style={{ color: L.color }} aria-hidden />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="text-[14px] font-semibold">{n.title}</div>
                    <Badge>{CATEGORY[n.category]}</Badge>
                  </div>
                  <p className="text-[13px] text-fg-2">
                    <span className="font-medium text-fg">Why it matters: </span>
                    {n.why}
                  </p>
                  {n.action && (
                    <p className="text-[13px] text-fg-2">
                      <span className="font-medium text-fg">What you could do: </span>
                      {n.action}
                    </p>
                  )}
                  {(n.accounts?.length || n.holdings?.length) ? (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[12px]">
                      {n.accounts?.map((a) => (
                        <Badge key={a} tone="info">{a}</Badge>
                      ))}
                      {n.holdings?.map((h) => (
                        <Link key={h.key} to="/holdings/$key" params={{ key: h.key }}>
                          <Badge tone="accent">{h.label}</Badge>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
                {(n.amount !== undefined || share !== undefined) && (
                  <div className="w-32 shrink-0 text-right">
                    {n.amount !== undefined && <Money value={n.amount} className="text-[15px] font-semibold" />}
                    {n.amountLabel && <div className="text-[11px] text-fg-3">{n.amountLabel}</div>}
                    {share !== undefined && (
                      <div className="mt-1.5" title="Share of the portfolio">
                        <div className="h-1.5 overflow-hidden rounded-full bg-selected">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, share * 100)}%`, background: L.color }} />
                        </div>
                        <div className="mt-0.5 text-[11px] text-fg-3">
                          <Pct value={share} /> of portfolio
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {!shown.length && <li className="py-6 text-center text-fg-3">Nothing here.</li>}
      </ul>
    </div>
  );
}

// ── What you really own ─────────────────────────────────────────────────────

export function Exposure({ lt }: { lt: LookThrough }) {
  const total = lt.total || 1;
  const stocks = lt.mix.stocks || 1;
  const sectors = [...lt.sectors].sort((a, b) => (a[0] === "unknown" ? 1 : b[0] === "unknown" ? -1 : b[1] - a[1]));
  const regions = [...lt.regions].sort((a, b) => b[1] - a[1]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const currencies = new Map<string, number>([["CAD", lt.mix.cash + lt.mix.bonds]]);
  for (const [c, v] of lt.countries) {
    const cur = c.startsWith("?") ? (({ "?US": "USD", "?CA": "CAD" }) as Record<string, string>)[c] ?? "Other" : currencyOf(c);
    currencies.set(cur, (currencies.get(cur) ?? 0) + v);
  }
  const unknownSector = lt.sectors.get("unknown") ?? 0;

  return (
    <Card title="What you really own" actions={<span className="text-[12px] text-fg-3">after looking inside every fund</span>}>
      <StackBar
        parts={[
          { key: "stocks", label: "Stocks", value: lt.mix.stocks, color: MIX_COLOR.stocks },
          { key: "bonds", label: "Bonds", value: lt.mix.bonds, color: MIX_COLOR.bonds },
          { key: "cash", label: "Cash", value: lt.mix.cash, color: MIX_COLOR.cash },
          { key: "other", label: "Other", value: lt.mix.other, color: MIX_COLOR.other },
        ]}
      />
      <div className="mt-6 grid gap-8 xl:grid-cols-2">
        <div>
          <h3 className="mb-3 text-[13px] font-semibold">Stocks by sector</h3>
          <ShareList
            rows={sectors.map(([k, v], i) => ({
              key: k,
              label: k === "unknown" ? "Not known" : (SECTOR_LABEL[k] ?? k),
              share: v / stocks,
              color: k === "unknown" ? "var(--text-disabled)" : chartColor(i),
              right: (
                <>
                  <Money value={v} className="text-fg-3" /> <Pct value={v / stocks} className="ml-2 inline-block w-12 text-right" />
                </>
              ),
            }))}
          />
          {unknownSector / stocks > 0.05 && (
            <p className="mt-3 text-[12px] text-fg-3">
              “Not known” is stock money in holdings with no market data (link them to a ticker from the holding page) or funds that publish no sector split.
            </p>
          )}
        </div>
        <div>
          <h3 className="mb-3 text-[13px] font-semibold">Stocks by country</h3>
          <ul className="space-y-1">
            {regions.map(([r, v]) => {
              const countries = [...lt.countries].filter(([c, cv]) => (c.startsWith("?") ? c.slice(1) === r : regionOf(c) === r) && cv / stocks >= 0.0005).sort((a, b) => b[1] - a[1]);
              const known = countries.filter(([c]) => !c.startsWith("?"));
              const top = lt.companies.filter((c) => (c.country ? regionOf(c.country) : "mixed") === r).slice(0, 8);
              const isOpen = open.has(r);
              const expandable = known.length > 1 || top.length > 0;
              return (
                <li key={r}>
                  <button
                    className="flex w-full items-center gap-2 py-1 text-left text-[13px]"
                    onClick={() =>
                      setOpen((s) => {
                        const n = new Set(s);
                        if (n.has(r)) n.delete(r);
                        else n.add(r);
                        return n;
                      })
                    }
                    disabled={!expandable}
                    aria-expanded={isOpen}
                  >
                    {expandable ? isOpen ? <ChevronDown className="size-3.5 text-fg-3" /> : <ChevronRight className="size-3.5 text-fg-3" /> : <span className="w-3.5" />}
                    <span className="size-2.5 rounded-sm" style={{ background: REGION_COLOR[r] }} />
                    <span className="flex-1 font-medium">{r === "mixed" ? "Not known" : REGION_LABEL[r]}</span>
                    <Money value={v} className="text-fg-3" />
                    <Pct value={v / stocks} className="w-12 text-right" />
                  </button>
                  <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-selected">
                    <div className="h-full rounded-full" style={{ width: `${(v / stocks) * 100}%`, background: REGION_COLOR[r] }} />
                  </div>
                  {isOpen && expandable && (
                    <div className="mb-3 ml-6 mt-2 grid gap-4 text-[12px] sm:grid-cols-2">
                      {known.length > 1 && (
                        <div>
                          <div className="mb-1 font-medium text-fg-2">Countries</div>
                          <ul className="space-y-0.5">
                            {countries.slice(0, 12).map(([c, cv]) => (
                              <li key={c} className="flex justify-between gap-2">
                                <span className="truncate text-fg-2">{c.startsWith("?") ? "Not broken down" : countryName(c)}</span>
                                <Pct value={cv / stocks} className="text-fg-3" />
                              </li>
                            ))}
                            {countries.length > 12 && <li className="text-fg-3">+{countries.length - 12} more</li>}
                          </ul>
                        </div>
                      )}
                      {top.length > 0 && (
                        <div>
                          <div className="mb-1 font-medium text-fg-2">Largest companies</div>
                          <ul className="space-y-0.5">
                            {top.map((c) => (
                              <li key={c.key} className="flex justify-between gap-2">
                                <span className="truncate text-fg-2">{c.name}</span>
                                <Pct value={c.value / stocks} className="text-fg-3" />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <h3 className="mb-2 mt-6 text-[13px] font-semibold">Currency exposure</h3>
          <StackBar
            parts={(() => {
              const all = [...currencies].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
              const sum = all.reduce((s, [, v]) => s + v, 0) || 1;
              const main = all.filter(([k, v]) => k !== "Other" && v / sum >= 0.01);
              const rest = all.filter((x) => !main.includes(x)).reduce((s, [, v]) => s + v, 0);
              return [...main.map(([k, v], i) => ({ key: k, label: k, value: v, color: chartColor(i) })), { key: "other", label: "Other / not broken down", value: rest, color: "var(--text-disabled)" }];
            })()}
          />
          <p className="mt-2 text-[12px] text-fg-3">Bonds and cash count as CAD; stocks take their home currency (unhedged funds).</p>
        </div>
      </div>
      <Sources lt={lt} total={total} />
    </Card>
  );
}

function Sources({ lt, total }: { lt: LookThrough; total: number }) {
  const [open, setOpen] = useState(false);
  const list = [...lt.sources.values()];
  return (
    <div className="mt-6 border-t border-line-subtle pt-3 text-[12px] text-fg-3">
      <button className="inline-flex items-center gap-1 hover:text-fg" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} Where this comes from: {list.filter((s) => s.full).length} of {list.length}{" "}
        funds with complete holdings{lt.estimated > 0 && <>, <Pct value={lt.estimated / total} /> estimated from names only</>}
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {list.map((s) => (
            <li key={s.symbol}>
              <span className="font-medium text-fg-2">{s.symbol}</span> — {s.source}
              {s.proxy && ` (no public file; ${s.proxy} tracks the same index)`}
              {s.asOf && `, as of ${s.asOf}`}
              {!s.full && " — top holdings only"}
            </li>
          ))}
          {[...lt.notes].map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Where every dollar goes ─────────────────────────────────────────────────

interface Line {
  key: string;
  name: string;
  symbol: string | null;
  country: string | null;
  sector: string | null;
  value: number;
  via: [string, number][];
  /** Not a company: bonds, cash, stocks not itemised… */
  bucket?: boolean;
}

type SortKey = "value" | "name" | "country" | "sector";
const PAGE_SIZES = [25, 50, 100];

export function WhereItGoes({ lt, rows }: { lt: LookThrough; rows: Row[] }) {
  const [view, setView] = useState<"list" | "flow">("list");
  const [holding, setHolding] = useState("all");
  const [region, setRegion] = useState("all");
  const [sector, setSector] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "value", desc: true });
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const total = lt.total || 1;
  const labels = new Map(rows.map((r) => [r.h.instrument.key, r.h.instrument.symbol ?? r.h.instrument.name]));
  const held = rows.filter((r) => r.h.marketValue > 0).sort((a, b) => b.h.marketValue - a.h.marketValue);
  const base = holding === "all" ? total : (rows.find((r) => r.h.instrument.key === holding)?.h.marketValue ?? 1);

  // Everything in the selection: companies plus what isn't a company, adding up to 100%.
  const all = useMemo(() => {
    const out: Line[] = [];
    for (const c of lt.companies) {
      const v = holding === "all" ? c.value : (c.via.get(holding) ?? 0);
      if (v > 0) out.push({ key: c.key, name: c.name, symbol: c.symbol, country: c.country, sector: c.sector, value: v, via: [...c.via].sort((a, b) => b[1] - a[1]) });
    }
    const mix = holding === "all" ? lt.mix : (lt.mixVia.get(holding) ?? { stocks: 0, bonds: 0, cash: 0, other: 0 });
    const un = holding === "all" ? [...lt.unitemised.values()].reduce((s, v) => s + v, 0) : (lt.unitemised.get(holding) ?? 0);
    const bucket = (key: string, name: string, value: number) => value > 0.005 && out.push({ key, name, symbol: null, country: null, sector: null, value, via: [], bucket: true });
    bucket("~unitemised", "Stocks not itemised (no holdings list published)", un);
    bucket("~bonds", "Bonds", mix.bonds);
    bucket("~cash", "Cash", mix.cash);
    bucket("~other", "Other assets", mix.other);
    return out;
  }, [lt, holding]);

  const sectors = [...new Set(all.flatMap((l) => (l.sector ? [l.sector] : [])))].sort();
  const needle = q.trim().toLowerCase();
  const filtered = all
    .filter((l) => region === "all" || (l.country ? regionOf(l.country) : "mixed") === region)
    .filter((l) => sector === "all" || l.sector === sector)
    .filter((l) => !needle || l.name.toLowerCase().includes(needle) || (l.symbol ?? "").toLowerCase().includes(needle))
    .sort((a, b) => {
      const dir = sort.desc ? -1 : 1;
      const get = (l: Line) =>
        sort.key === "value" ? l.value : sort.key === "name" ? l.name.toLowerCase() : sort.key === "country" ? (l.country ? countryName(l.country) : "~") : (l.sector ? (SECTOR_LABEL[l.sector] ?? l.sector) : "~");
      const x = get(a);
      const y = get(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const p = Math.min(page, pages - 1);
  const shown = filtered.slice(p * pageSize, (p + 1) * pageSize);
  const filteredSum = filtered.reduce((s, l) => s + l.value, 0);
  const companies = all.filter((l) => !l.bucket);
  const cum = (k: number) => companies.slice(0, k).reduce((s, c) => s + c.value, 0) / base;
  const colorOf = (l: Line) => (l.bucket ? "var(--text-disabled)" : REGION_COLOR[l.country ? regionOf(l.country) : "mixed"]!);
  const reset = () => setPage(0);
  const th = (key: SortKey, label: string, right?: boolean) => (
    <th className={cx("px-3 py-2 font-medium", right && "text-right")}>
      <button
        className="inline-flex items-center gap-1 uppercase hover:text-fg"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key === "value" }))}
        aria-label={`Sort by ${label}`}
      >
        {label} {sort.key === key && (sort.desc ? "↓" : "↑")}
      </button>
    </th>
  );
  const select = "h-8 rounded-md border border-line bg-raised px-2 text-[13px]";

  // Flow: the selected holding(s) → largest companies + the rest.
  const leftRows = holding === "all" ? held : held.filter((r) => r.h.instrument.key === holding);
  const holdingNodes: FlowNode[] = leftRows.map((r) => ({ key: r.h.instrument.key, label: labels.get(r.h.instrument.key)!, value: r.h.marketValue, color: chartColor(held.indexOf(r)) }));
  const topCos = companies.sort((a, b) => b.value - a.value).slice(0, holding === "all" ? 15 : 20);
  const flows: { from: string; to: string; value: number }[] = [];
  for (const h of holdingNodes) {
    let named = 0;
    for (const c of topCos) {
      const v = lt.companies.find((x) => x.key === c.key)?.via.get(h.key) ?? 0;
      if (v) flows.push({ from: h.key, to: c.key, value: v });
      named += v;
    }
    const m = lt.mixVia.get(h.key);
    const un = lt.unitemised.get(h.key) ?? 0;
    if (m) {
      flows.push({ from: h.key, to: "~rest", value: Math.max(0, m.stocks - named - un) });
      flows.push({ from: h.key, to: "~unitemised", value: un });
      flows.push({ from: h.key, to: "~bonds", value: m.bonds });
      flows.push({ from: h.key, to: "~cash", value: m.cash });
      flows.push({ from: h.key, to: "~other", value: m.other });
    }
  }
  const sumTo = (k: string) => flows.filter((f) => f.to === k).reduce((s, f) => s + f.value, 0);
  const flowTotal = holdingNodes.reduce((s, n) => s + n.value, 0) || 1;
  const targetNodes: FlowNode[] = [
    ...topCos.map((c) => ({ key: c.key, label: c.name, value: sumTo(c.key), color: colorOf(c) })),
    { key: "~rest", label: `${Math.max(0, companies.length - topCos.length).toLocaleString("en-CA")} other companies`, value: sumTo("~rest"), color: "var(--text-3)" },
    { key: "~unitemised", label: "Stocks not itemised", value: sumTo("~unitemised"), color: "var(--text-disabled)" },
    { key: "~bonds", label: "Bonds", value: sumTo("~bonds"), color: MIX_COLOR.bonds },
    { key: "~cash", label: "Cash", value: sumTo("~cash"), color: MIX_COLOR.cash },
    { key: "~other", label: "Other", value: sumTo("~other"), color: MIX_COLOR.other },
  ].filter((x) => x.value > flowTotal * 0.001);

  return (
    <Card
      title="Where every dollar goes"
      actions={
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "list", label: "List" },
            { value: "flow", label: "Flow" },
          ]}
        />
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          className={select}
          value={holding}
          onChange={(e) => {
            setHolding(e.target.value);
            reset();
          }}
          aria-label="Holding"
        >
          <option value="all">All holdings</option>
          {held.map((r) => (
            <option key={r.h.instrument.key} value={r.h.instrument.key}>
              {r.h.instrument.symbol ? `${r.h.instrument.symbol} · ${r.profile?.name ?? r.h.instrument.name}` : r.h.instrument.name}
            </option>
          ))}
        </select>
        {view === "list" && (
          <>
            <select className={select} value={region} onChange={(e) => (setRegion(e.target.value), reset())} aria-label="Region">
              <option value="all">All regions</option>
              {(["US", "CA", "intl", "emerging", "mixed"] as const).map((r) => (
                <option key={r} value={r}>
                  {r === "mixed" ? "Not known" : REGION_LABEL[r]}
                </option>
              ))}
            </select>
            <select className={select} value={sector} onChange={(e) => (setSector(e.target.value), reset())} aria-label="Sector">
              <option value="all">All sectors</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {SECTOR_LABEL[s] ?? s}
                </option>
              ))}
            </select>
            <input
              className={cx(select, "w-56")}
              placeholder="Search company or ticker"
              value={q}
              onChange={(e) => (setQ(e.target.value), reset())}
              aria-label="Search companies"
            />
          </>
        )}
      </div>
      <div className="mb-4 flex flex-wrap gap-2 text-[12px]">
        {[10, 25, 100].map(
          (k) =>
            companies.length > k && (
              <span key={k} className="rounded-md bg-selected px-2 py-1">
                Top {k} = <b><Pct value={cum(k)} /></b>
              </span>
            ),
        )}
        <span className="rounded-md bg-selected px-2 py-1">{companies.length.toLocaleString("en-CA")} companies</span>
        {holding !== "all" && (
          <span className="rounded-md bg-selected px-2 py-1">
            <Money value={base} /> in this holding
          </span>
        )}
      </div>

      {view === "flow" ? (
        <>
          <Sankey left={holdingNodes} right={targetNodes} links={flows} scaleHeight={Math.max(360, holdingNodes.length * 34)} />
          <p className="mt-2 text-[12px] text-fg-3">Left: what you hold. Right: what that money is invested in. Hover to follow a holding or company; pick a holding above to see only its contents.</p>
        </>
      ) : (
        <>
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-fg-3">
                <tr>
                  <th className="px-4 py-2 font-medium">#</th>
                  {th("name", "Company")}
                  {th("country", "Country")}
                  {th("sector", "Sector")}
                  {holding === "all" && <th className="px-3 py-2 font-medium">Through</th>}
                  {th("value", "Value", true)}
                  <th className="px-4 py-2 text-right font-medium">{holding === "all" ? "Of portfolio" : "Of this holding"}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l, i) => (
                  <tr key={l.key} className={cx("border-t border-line-subtle", l.bucket && "text-fg-2")}>
                    <td className="px-4 py-1.5 text-fg-3">{p * pageSize + i + 1}</td>
                    <td className="px-3 py-1.5">
                      <span className={cx(!l.bucket && "font-medium")}>{l.name}</span> {l.symbol && <span className="text-fg-3">{l.symbol}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-fg-2">{l.country ? countryName(l.country) : "—"}</td>
                    <td className="px-3 py-1.5 text-fg-2">{l.sector ? (SECTOR_LABEL[l.sector] ?? l.sector) : "—"}</td>
                    {holding === "all" && (
                      <td className="px-3 py-1.5">
                        <div className="flex flex-wrap gap-1">
                          {l.via.slice(0, 5).map(([k]) => (
                            <button key={k} onClick={() => (setHolding(k), reset())} title="Show only this holding">
                              <Badge>{labels.get(k) ?? k}</Badge>
                            </button>
                          ))}
                          {l.via.length > 5 && <span className="text-[11px] text-fg-3">+{l.via.length - 5}</span>}
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-1.5 text-right"><Money value={l.value} /></td>
                    <td className="px-4 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-selected">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (l.value / (filtered[0]?.value || 1)) * 100)}%`, background: colorOf(l) }} />
                        </div>
                        <Pct value={l.value / base} className="w-12" />
                      </div>
                    </td>
                  </tr>
                ))}
                {!shown.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-fg-3">
                      Nothing matches.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px] text-fg-2">
            <span>
              {filtered.length.toLocaleString("en-CA")} rows · <Money value={filteredSum} /> · <Pct value={filteredSum / base} /> of {holding === "all" ? "the portfolio" : "this holding"}
            </span>
            <div className="flex items-center gap-2">
              <select className={cx(select, "h-7")} value={pageSize} onChange={(e) => (setPageSize(Number(e.target.value)), reset())} aria-label="Rows per page">
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} per page
                  </option>
                ))}
              </select>
              <Button disabled={p === 0} onClick={() => setPage(p - 1)}>
                ‹ Prev
              </Button>
              <span>
                Page {p + 1} of {pages}
              </span>
              <Button disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>
                Next ›
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

// ── Inside your funds ───────────────────────────────────────────────────────

export function InsideFunds({ lt, rows }: { lt: LookThrough; rows: Row[] }) {
  const funds = rows.filter((r) => {
    const t = lt.trees.get(r.h.instrument.key);
    return t && t.kind === "fund" && t.children.length > 0 && r.h.instrument.vehicle !== "cash";
  });
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (!funds.length) return null;
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const render = (node: Node, path: string, depth: number, parent: number): ReactNode => {
    const key = `${path}/${node.label}`;
    const kids = node.children.filter((c) => c.value > 0);
    const isOpen = open.has(key);
    const color = node.kind === "fund" ? "var(--accent)" : node.kind === "stock" ? chartColor(0) : node.kind === "bonds" ? MIX_COLOR.bonds : node.kind === "cash" ? MIX_COLOR.cash : "var(--text-3)";
    return (
      <Fragment key={key}>
        <div className="flex items-center gap-2 py-1 text-[13px]" style={{ paddingLeft: depth * 20 }}>
          {kids.length ? (
            <button onClick={() => toggle(key)} className="text-fg-3 hover:text-fg" aria-expanded={isOpen} aria-label={isOpen ? "Collapse" : "Expand"}>
              {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <span className={cx("min-w-0 flex-1 truncate", node.kind === "fund" && "font-medium")}>
            {node.label} {node.symbol && <span className="text-fg-3">{node.symbol}</span>}
            {node.source && <span className="ml-2 text-[11px] font-normal text-fg-3">{node.source}</span>}
          </span>
          <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-selected sm:block">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (node.value / (parent || 1)) * 100)}%`, background: color }} />
          </div>
          <Pct value={node.value / (parent || 1)} className="w-14 text-right text-fg-2" />
          <Money value={node.value} className="w-24 text-right text-fg-3" />
        </div>
        {isOpen && kids.map((c) => render(c, key, depth + 1, node.value))}
      </Fragment>
    );
  };
  return (
    <Card title="Inside your funds" actions={<span className="text-[12px] text-fg-3">funds that hold funds, unrolled down to the companies</span>}>
      <div className="divide-y divide-line-subtle">
        {funds.map((r) => (
          <div key={r.h.instrument.key} className="py-1">
            {render(lt.trees.get(r.h.instrument.key)!, r.h.instrument.key, 0, r.h.marketValue)}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-fg-3">Click ▸ to open a level. Percentages are of the level above; at the top, of your holding.</p>
    </Card>
  );
}

// ── Performance and risk ────────────────────────────────────────────────────

const BENCHMARKS: { symbol: string; label: string; what: string }[] = [
  { symbol: "XEQT.TO", label: "Global stocks (XEQT)", what: "100% stocks across the world, about 25% Canada. The default for long-term, all-equity investors." },
  { symbol: "VGRO.TO", label: "Growth 80/20 (VGRO)", what: "80% stocks, 20% bonds. A common choice for long horizons with a bit of cushion." },
  { symbol: "VBAL.TO", label: "Balanced 60/40 (VBAL)", what: "60% stocks, 40% bonds. The classic balanced portfolio: smaller drops, lower growth." },
  { symbol: "VCNS.TO", label: "Conservative 40/60 (VCNS)", what: "40% stocks, 60% bonds. For money needed within a few years." },
  { symbol: "VFV.TO", label: "S&P 500 (VFV)", what: "The 500 largest US companies. Has led most markets over the last decade." },
  { symbol: "QQC.TO", label: "Nasdaq-100 (QQC)", what: "The 100 largest non-financial Nasdaq companies: tech-heavy, high growth, big swings." },
  { symbol: "XIC.TO", label: "Canada (XIC)", what: "The whole Toronto market: banks, energy, materials." },
  { symbol: "XEF.TO", label: "International (XEF)", what: "Developed markets outside North America: Europe, Japan, Australia." },
  { symbol: "XEC.TO", label: "Emerging markets (XEC)", what: "China, India, Taiwan, Brazil and others: higher growth potential, higher risk." },
  { symbol: "ZAG.TO", label: "Canadian bonds (ZAG)", what: "Government and corporate bonds. Shows what 'safe' returned." },
  { symbol: "CASH.TO", label: "Savings (CASH)", what: "A high-interest savings ETF: roughly what cash earned." },
];

function Performance({ rows, onRisk, policyRate }: { rows: Row[]; onRisk: (r: { drawdown: number | null; volatility: number | null }) => void; policyRate: number | null }) {
  const [range, setRange] = useState<Range>("5y");
  const [bench, setBench] = useState<string[]>(["XEQT.TO", "VBAL.TO"]);
  const priced = rows.filter((r) => r.symbol && r.profile);
  const symbols = [...priced.map((r) => r.symbol!), USDCAD, ...BENCHMARKS.map((b) => b.symbol)];
  const hist = useHistories(symbols, range);
  const data = useMemo(() => {
    if (hist.status !== "ready") return null;
    const m = hist.data;
    const fx = m.get(USDCAD);
    const series = new Map<string, PricePoint[]>();
    for (const r of priced) {
      const h = m.get(r.symbol!);
      if (h) series.set(r.symbol!, inCad(h, fx));
    }
    const weights = new Map<string, number>();
    for (const r of priced) weights.set(r.symbol!, (weights.get(r.symbol!) ?? 0) + r.h.marketValue);
    const mix = backtest(weights, series);
    const covered = priced.filter((r) => series.has(r.symbol!)).reduce((s, r) => s + r.h.marketValue, 0) / (rows.reduce((s, r) => s + r.h.marketValue, 0) || 1);
    const start = mix[0]?.d;
    const benches = new Map(
      BENCHMARKS.flatMap((b) => {
        const h = m.get(b.symbol);
        if (!h) return [];
        return [[b.symbol, inCad(h, fx).filter((p) => !start || p.d >= start)] as const];
      }),
    );
    const corr = correlations(new Map([...series].sort((a, b) => (weights.get(b[0]) ?? 0) - (weights.get(a[0]) ?? 0)).slice(0, 12)));
    return { series, mix, covered, benches, corr, dd: maxDrawdown(mix), vol: volatility(mix) };
  }, [hist, rows]);
  useEffect(() => {
    if (data) onRisk({ drawdown: data.dd?.depth ?? null, volatility: data.vol });
  }, [data?.dd?.depth, data?.vol]);

  const stats = (pts: { d: string; c: number }[]) => {
    const g = cagr(pts as PricePoint[]);
    const v = volatility(pts);
    return { g, v, dd: maxDrawdown(pts)?.depth ?? null, sharpe: g !== null && v ? (g - (policyRate ?? 0) / 100) / v : null };
  };
  const rebase = (pts: { d: string; c: number }[]) => (pts.length ? pts.map((p) => ({ d: p.d, v: (p.c / pts[0]!.c) * 100 })) : []);

  return (
    <Card
      title="How today’s mix would have done"
      actions={
        <Segmented
          label="Period"
          value={range}
          onChange={setRange}
          options={[
            { value: "1y", label: "1Y" },
            { value: "2y", label: "2Y" },
            { value: "5y", label: "5Y" },
            { value: "10y", label: "10Y" },
          ]}
        />
      }
    >
      <MarketGate state={hist} what="price history">
        {() => {
          if (!data) return null;
          const { mix, covered, benches, corr } = data;
          const mine = stats(mix);
          const chosen = BENCHMARKS.filter((b) => bench.includes(b.symbol) && benches.has(b.symbol));
          return (
            <div className="space-y-5">
              <p className="text-[12px] text-fg-3">
                Today’s weights held through the period and rebalanced weekly, dividends reinvested, in CAD. Covers <Pct value={covered} /> of the portfolio
                (cash and holdings without prices left out; linked plan funds use their reference fund’s prices). This is what your current mix would have done, not your actual past returns.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <span className="mr-1 self-center text-[12px] text-fg-3">Compare with:</span>
                {BENCHMARKS.map((b, i) => {
                  const on = bench.includes(b.symbol);
                  return (
                    <button
                      key={b.symbol}
                      title={b.what}
                      onClick={() => setBench(on ? bench.filter((x) => x !== b.symbol) : [...bench, b.symbol])}
                      className={cx("flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px]", on ? "border-accent bg-accent-subtle" : "border-line-subtle text-fg-2 hover:bg-hover")}
                      aria-pressed={on}
                    >
                      <span className="size-2 rounded-full" style={{ background: on ? chartColor(i + 1) : "var(--surface-selected)" }} /> {b.label}
                    </button>
                  );
                })}
              </div>
              <SeriesChart
                label="Backtest of today's mix"
                series={[
                  { key: "mix", label: "Your mix", points: rebase(mix), color: "var(--text-1)" },
                  ...chosen.map((b) => ({ key: b.symbol, label: b.label, points: rebase(benches.get(b.symbol)!), color: chartColor(BENCHMARKS.indexOf(b) + 1), dashed: true })),
                ]}
                format={(v) => v.toFixed(0)}
                height={300}
              />
              <p className="text-[12px] text-fg-3">Every line starts at 100: a value of 150 means $100 became $150.</p>
              <div className="-mx-4 overflow-x-auto">
                <table className="w-full min-w-[860px] text-[13px]">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-fg-3">
                    <tr>
                      <th className="px-4 py-2 font-medium">Compared with</th>
                      <th className="px-3 py-2 text-right font-medium" title="Average yearly growth">Per year</th>
                      <th className="px-3 py-2 text-right font-medium" title="How much it swings in a typical year">Swings</th>
                      <th className="px-3 py-2 text-right font-medium" title="Largest fall from a peak">Worst drop</th>
                      <th className="px-3 py-2 text-right font-medium" title="Return above cash per unit of swing; higher is better">Sharpe</th>
                      <th className="px-4 py-2 font-medium">What it is</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-line-subtle bg-accent-subtle/50 font-medium">
                      <td className="px-4 py-1.5">Your mix</td>
                      <td className="px-3 py-1.5 text-right"><R v={mine.g} /></td>
                      <td className="px-3 py-1.5 text-right">{fmtPct(mine.v)}</td>
                      <td className="px-3 py-1.5 text-right text-neg">{fmtPct(mine.dd)}</td>
                      <td className="px-3 py-1.5 text-right">{fmtNum(mine.sharpe)}</td>
                      <td className="px-4 py-1.5 text-[12px] font-normal text-fg-2">What you hold today</td>
                    </tr>
                    {BENCHMARKS.filter((b) => benches.has(b.symbol)).map((b) => {
                      const s = stats(benches.get(b.symbol)!);
                      const diff = mine.g !== null && s.g !== null ? mine.g - s.g : null;
                      return (
                        <tr key={b.symbol} className={cx("border-t border-line-subtle", !bench.includes(b.symbol) && "text-fg-2")}>
                          <td className="px-4 py-1.5">{b.label}</td>
                          <td className="px-3 py-1.5 text-right">
                            <R v={s.g} />
                            {diff !== null && (
                              <div className="text-[11px] text-fg-3">
                                you {diff >= 0 ? "+" : ""}
                                {(diff * 100).toFixed(1)} pts
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right">{fmtPct(s.v)}</td>
                          <td className="px-3 py-1.5 text-right text-neg">{fmtPct(s.dd)}</td>
                          <td className="px-3 py-1.5 text-right">{fmtNum(s.sharpe)}</td>
                          <td className="max-w-md px-4 py-1.5 text-[12px] text-fg-2">{b.what}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <details className="text-[12px] text-fg-2">
                <summary className="cursor-pointer font-medium text-fg">How to read this</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li><b>Per year</b>: average yearly growth (compound). Small gaps add up: 1 point a year is about 28% more money after 25 years.</li>
                  <li><b>Swings</b> (volatility): how far a typical year strays from average. Higher means a bumpier ride.</li>
                  <li><b>Worst drop</b>: the biggest fall from a high before recovering. The number to picture when markets crash.</li>
                  <li><b>Sharpe</b>: extra return over cash for each unit of swing. Above 0.5 is decent, above 1 is very good.</li>
                  <li>Compare against a benchmark with a similar stock/bond mix: beating a bond fund with an all-stock mix says nothing about skill.</li>
                </ul>
              </details>
              <HoldingReturns rows={priced} series={data.series} />
              {corr.keys.length > 1 && (
                <div>
                  <h3 className="mb-1 text-[13px] font-semibold">How your holdings move together</h3>
                  <p className="mb-3 text-[12px] text-fg-3">Correlation of returns: 1 = always move together, 0 = unrelated. Lower numbers diversify better.</p>
                  <Heatmap labels={corr.keys.map((k) => k.replace(/\.TO$/, ""))} matrix={corr.matrix} />
                </div>
              )}
            </div>
          );
        }}
      </MarketGate>
    </Card>
  );
}

const R = ({ v }: { v: number | null }) => (v === null ? <>—</> : <Pct value={v} tone />);

function HoldingReturns({ rows, series }: { rows: Row[]; series: Map<string, PricePoint[]> }) {
  const seen = new Set<string>();
  const list = rows.filter((r) => series.has(r.symbol!) && !seen.has(r.symbol!) && seen.add(r.symbol!));
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead className="text-left text-[11px] uppercase tracking-wide text-fg-3">
          <tr>
            <th className="px-4 py-2 font-medium">Holding</th>
            <th className="px-3 py-2 text-right font-medium">3 mo</th>
            <th className="px-3 py-2 text-right font-medium">1 yr</th>
            <th className="px-3 py-2 text-right font-medium">Per year</th>
            <th className="px-3 py-2 text-right font-medium">Swings</th>
            <th className="px-4 py-2 text-right font-medium">Worst drop</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => {
            const pts = series.get(r.symbol!)!;
            return (
              <tr key={r.symbol} className="border-t border-line-subtle">
                <td className="px-4 py-1.5">
                  <Link to="/holdings/$key" params={{ key: r.h.instrument.key }} className="font-medium hover:text-accent hover:underline">
                    {r.h.instrument.symbol ?? r.symbol}
                  </Link>
                </td>
                <td className="px-3 py-1.5 text-right"><R v={periodReturn(pts, 91)} /></td>
                <td className="px-3 py-1.5 text-right"><R v={periodReturn(pts, 365)} /></td>
                <td className="px-3 py-1.5 text-right"><R v={cagr(pts)} /></td>
                <td className="px-3 py-1.5 text-right">{fmtPct(volatility(pts))}</td>
                <td className="px-4 py-1.5 text-right text-neg">{fmtPct(maxDrawdown(pts)?.depth ?? null)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Costs and taxes ─────────────────────────────────────────────────────────

const TIER_COLOR: Record<FeeTier, string> = { none: "var(--pos)", low: "var(--pos)", typical: "var(--info)", high: "var(--warn)", "very-high": "var(--neg)" };
const SCALE_MAX = 0.025;

/** Where a fee sits on a 0–2.5% scale with the tier bands behind it. */
function FeeMeter({ fee }: { fee: number | null }) {
  const bands: [number, number, FeeTier][] = [[0, 0.0025, "low"], [0.0025, 0.006, "typical"], [0.006, 0.015, "high"], [0.015, SCALE_MAX, "very-high"]];
  return (
    <div className="relative h-2 w-36 shrink-0 rounded-full">
      {bands.map(([a, b, t]) => (
        <div key={t} className="absolute top-0 h-full first:rounded-l-full last:rounded-r-full" style={{ left: `${(a / SCALE_MAX) * 100}%`, width: `${((b - a) / SCALE_MAX) * 100}%`, background: `color-mix(in oklab, ${TIER_COLOR[t]} 30%, var(--surface-selected))` }} />
      ))}
      {fee !== null && (
        <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel" style={{ left: `${Math.min(fee / SCALE_MAX, 1) * 100}%`, background: TIER_COLOR[feeTier(fee)!] }} />
      )}
    </div>
  );
}

function Costs({ rows, accounts, data }: { rows: Row[]; accounts: Map<string, Account>; data: MarketData }) {
  const privacy = useUi((s) => s.privacy);
  const taxRate = useSettings((s) => s.taxRate);
  const setTaxRate = useSettings((s) => s.setTaxRate);
  const [years, setYears] = useState(20);
  const [growth, setGrowth] = useState(6);
  const [open, setOpen] = useState<string | null>(null);
  const fundFees = useFees(rows.flatMap((r) => (r.symbol ? [r.symbol] : [])));
  const fees = fundFees.status === "ready" ? fundFees.data : new Map<string, FundFees | null>();
  const total = rows.reduce((s, r) => s + r.h.marketValue, 0) || 1;

  // Cost lines per holding (look-through per holding tells where its dividends come from).
  const costs = useMemo(
    () =>
      new Map(
        rows.map((r) => {
          const lt = r.profile ? lookThrough([r], data) : null;
          const lines = costBreakdown({ row: r, fees: r.symbol ? (fees.get(r.symbol) ?? null) : null, lt, accounts, taxRate });
          return [r.h.instrument.key, lines] as const;
        }),
      ),
    [rows, data, fees, accounts, taxRate],
  );
  const line = (r: Row, k: string) => costs.get(r.h.instrument.key)?.find((l) => l.key === k);
  const sorted = [...rows].filter((r) => r.h.instrument.vehicle !== "cash").sort((a, b) => yearlyCost(costs.get(b.h.instrument.key)!).amount - yearlyCost(costs.get(a.h.instrument.key)!).amount);
  const all = sorted.flatMap((r) => costs.get(r.h.instrument.key)!);
  const sumKey = (k: string) => all.filter((l) => l.key === k).reduce((s, l) => s + (l.amount ?? 0), 0);
  const yearlyTotal = sorted.reduce((s, r) => s + yearlyCost(costs.get(r.h.instrument.key)!).amount, 0);
  const missingFee = sorted.filter((r) => line(r, "mer")?.status === "not-published");
  const fee = weighted(rows, feeOf);

  // Per account: value, cost basis, ongoing cost rate → outcome.
  const byAccount = new Map<string, { value: number; cost: number | null; costSum: number }>();
  for (const r of rows) {
    const yearly = yearlyCost(costs.get(r.h.instrument.key) ?? []).amount / (r.h.marketValue || 1);
    for (const l of r.h.lots) {
      const e = byAccount.get(l.accountKey) ?? byAccount.set(l.accountKey, { value: 0, cost: 0, costSum: 0 }).get(l.accountKey)!;
      e.value += l.marketValue;
      e.cost = e.cost === null || l.bookValue === null ? null : e.cost + l.bookValue;
      e.costSum += l.marketValue * yearly;
    }
  }
  const results = [...byAccount]
    .map(([k, e]) => {
      const a = accounts.get(k);
      return {
        key: k,
        name: a?.name ?? "Account",
        type: a ? accountTypeLabel(a.type) : "",
        o: outcome({ value: e.value, cost: e.cost, fee: e.value ? e.costSum / e.value : 0, tax: a?.tax ?? "taxable", growth: growth / 100, years, marginalRate: taxRate }),
      };
    })
    .sort((a, b) => b.o.gross - a.o.gross);
  const maxGross = Math.max(...results.map((r) => r.o.gross), 1);
  const sum = results.reduce((s, r) => ({ fees: s.fees + r.o.fees, tax: s.tax + r.o.tax, kept: s.kept + r.o.kept }), { fees: 0, tax: 0, kept: 0 });
  const ongoing = yearlyTotal / total;
  const curve = Array.from({ length: years + 1 }, (_, y) => ({
    d: `${new Date().getFullYear() + y}-01-01`,
    mine: feeDrag(total, ongoing, growth / 100, y),
    cheap: feeDrag(total, 0.002, growth / 100, y),
  }));
  const money = (v: number) => (privacy ? "•••••" : formatMoney(v, "compact"));
  const cell = (l: CostLine | undefined) =>
    !l ? (
      "—"
    ) : l.status === "not-published" && l.amount === null ? (
      <span className="text-[12px] text-fg-3">n/p</span>
    ) : l.status === "none" ? (
      <span className="text-fg-3">–</span>
    ) : (
      <span title={`${l.rate !== null ? `${(l.rate * 100).toFixed(2)}% · ` : ""}${STATUS[l.status].label}`}>
        <Money value={l.amount ?? 0} />
        {l.status === "estimate" && <span className="text-warn">*</span>}
      </span>
    );

  return (
    <Card title="What it costs you" actions={<span className="text-[12px] text-fg-3">every fee and tax, in dollars, with its source</span>}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Every year, all in" value={<Money value={yearlyTotal} />} sub={<><Pct value={ongoing} /> of what you hold{missingFee.length ? " · some fees unknown" : ""}</>} />
          <Stat label="Fund fees (MER)" value={<Money value={sumKey("mer")} />} sub={fee.value !== null ? `${(fee.value * 100).toFixed(2)}% average` : undefined} />
          <Stat label="Trading inside funds" value={<Money value={sumKey("ter")} />} sub="TER, where published" />
          <Stat label="Foreign withholding" value={<Money value={sumKey("withholding")} />} sub="estimate" />
          <Stat label="Tax on distributions" value={<Money value={sumKey("disttax")} />} sub={`estimate at ${Math.round(taxRate * 100)}%`} />
        </div>
        {missingFee.length > 0 && (
          <Notice tone="warn">
            Fund fee not known for {missingFee.map((r) => r.h.instrument.symbol ?? r.h.instrument.name).join(", ")}: the totals leave it out. Open the holding and
            enter the fee from your plan statement or fund facts.
          </Notice>
        )}

        <div className="grid gap-3 md:grid-cols-4">
          {(Object.keys(FEE_TIER) as FeeTier[])
            .filter((t) => t !== "none")
            .map((t) => {
              const inTier = rows.filter((r) => feeTier(feeOf(r)) === t);
              return (
                <div key={t} className="rounded-md border border-line-subtle p-3" style={{ borderTop: `3px solid ${TIER_COLOR[t]}` }}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] font-semibold">{FEE_TIER[t].label}</span>
                    <span className="text-[12px] text-fg-3">{FEE_TIER[t].range}</span>
                  </div>
                  <div className="mt-1 text-[12px] text-fg-3">{FEE_TIER[t].examples}</div>
                  <div className="mt-2 text-[13px]">
                    {inTier.length ? (
                      <>
                        {inTier.map((r) => r.h.instrument.symbol ?? r.h.instrument.name).join(", ")} · <Money value={inTier.reduce((s, r) => s + r.h.marketValue, 0)} />
                      </>
                    ) : (
                      <span className="text-fg-3">none of yours</span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[13px]">
            <thead className="text-left text-[11px] uppercase tracking-wide text-fg-3">
              <tr>
                <th className="w-8" />
                <th className="px-3 py-2 font-medium">Holding</th>
                <th className="px-3 py-2 font-medium">Fee level</th>
                <th className="px-3 py-2 text-right font-medium" title="Management fee (part of the MER)">Mgmt fee</th>
                <th className="px-3 py-2 text-right font-medium" title="Management expense ratio: all fund fees">MER</th>
                <th className="px-3 py-2 text-right font-medium" title="Trading expense ratio">Trading</th>
                <th className="px-3 py-2 text-right font-medium" title="Estimated foreign withholding tax">Withholding</th>
                <th className="px-3 py-2 text-right font-medium" title="Estimated tax on distributions in non-registered accounts">Dist. tax</th>
                <th className="px-3 py-2 text-right font-medium">Total / yr</th>
                <th className="px-3 py-2 text-right font-medium" title={`Fund fees and other yearly costs over ${years} years at ${growth}% growth`}>Over {years} yrs</th>
                <th className="px-4 py-2 text-right font-medium" title="Exit fee, spread and currency conversion if you sold today">If sold today</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const k = r.h.instrument.key;
                const lines = costs.get(k)!;
                const f = feeOf(r);
                const t = feeTier(f);
                const yearly = yearlyCost(lines);
                const once = lines.filter((l) => l.when === "one-off").reduce((s, l) => s + (l.amount ?? 0), 0);
                const isOpen = open === k;
                return (
                  <Fragment key={k}>
                    <tr className="cursor-pointer border-t border-line-subtle hover:bg-hover" onClick={() => setOpen(isOpen ? null : k)}>
                      <td className="pl-3 text-fg-3">{isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
                      <td className="px-3 py-1.5">
                        <Link to="/holdings/$key" params={{ key: k }} className="font-medium hover:text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                          {r.h.instrument.symbol ?? r.h.instrument.name}
                        </Link>
                        <div className="text-[11px] text-fg-3"><Money value={r.h.marketValue} /></div>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <FeeMeter fee={f} />
                          {t ? <Badge tone={FEE_TIER[t].tone}>{FEE_TIER[t].label}</Badge> : <Badge tone="warn">fee unknown</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-right">{cell(lines.find((l) => l.key === "mgmt"))}</td>
                      <td className="px-3 py-1.5 text-right">{cell(lines.find((l) => l.key === "mer"))}</td>
                      <td className="px-3 py-1.5 text-right">{cell(lines.find((l) => l.key === "ter"))}</td>
                      <td className="px-3 py-1.5 text-right">{cell(lines.find((l) => l.key === "withholding"))}</td>
                      <td className="px-3 py-1.5 text-right">{cell(lines.find((l) => l.key === "disttax"))}</td>
                      <td className="px-3 py-1.5 text-right font-medium">
                        <Money value={yearly.amount} />
                        {yearly.missing && <span className="text-warn" title="Fund fee unknown">+?</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Money value={feeDrag(r.h.marketValue, yearly.amount / (r.h.marketValue || 1), growth / 100, years)} />
                      </td>
                      <td className="px-4 py-1.5 text-right">{once ? <Money value={once} /> : <span className="text-fg-3">–</span>}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-bg-deep/40">
                        <td />
                        <td colSpan={10} className="px-3 py-3">
                          <CostLines lines={lines} value={r.h.marketValue} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 px-4 text-[12px] text-fg-3">
            Click a row for every line with its source. n/p = not published by any source available; * = estimate. Mgmt fee is part of the MER, so it isn’t added
            again in the total.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div>
            <h3 className="mb-1 text-[13px] font-semibold">Costs add up</h3>
            <p className="mb-2 text-[12px] text-fg-3">
              Growth lost to all yearly costs on today’s portfolio at {growth}% a year ({(ongoing * 100).toFixed(2)}% a year) vs a 0.20% index portfolio.
            </p>
            <SeriesChart
              label="Cumulative cost"
              series={[
                { key: "mine", label: `Your costs (${(ongoing * 100).toFixed(2)}%)`, points: curve.map((y) => ({ d: y.d, v: y.mine })), color: "var(--warn)" },
                { key: "cheap", label: "0.20% index portfolio", points: curve.map((y) => ({ d: y.d, v: y.cheap })), color: "var(--pos)", dashed: true },
              ]}
              format={money}
              height={220}
            />
          </div>
          <div>
            <h3 className="mb-1 text-[13px] font-semibold">If you took it all out in {years} years</h3>
            <div className="mb-3 grid grid-cols-3 gap-3 text-[12px]">
              <Slider label="Years" value={years} min={1} max={40} step={1} onChange={setYears} suffix="" />
              <Slider label="Growth / yr" value={growth} min={0} max={10} step={0.5} onChange={setGrowth} suffix="%" />
              <Slider
                label="Your tax rate"
                value={Math.round(taxRate * 100)}
                min={20}
                max={54}
                step={1}
                onChange={(v) => setTaxRate(v / 100)}
                suffix="%"
                hint="Your marginal rate: federal + provincial tax on your next dollar of income. Ontario, roughly: 30% at $60k, 43% at $100k, 53.5% over $250k. Used for every tax estimate."
              />
            </div>
            <ul className="space-y-2.5">
              {results.map((r) => (
                <li key={r.key} title={r.o.taxNote}>
                  <div className="mb-0.5 flex justify-between gap-3 text-[12px]">
                    <span className="truncate">
                      <span className="font-medium">{r.name}</span> <span className="text-fg-3">{r.type}</span>
                    </span>
                    <span>
                      keep <Money value={r.o.kept} className="font-semibold" />
                    </span>
                  </div>
                  <div className="flex h-3 overflow-hidden rounded-full bg-selected" style={{ width: `${(r.o.gross / maxGross) * 100}%` }}>
                    <div style={{ width: `${(r.o.kept / r.o.gross) * 100}%`, background: "var(--pos)" }} />
                    <div style={{ width: `${(r.o.tax / r.o.gross) * 100}%`, background: "var(--info)" }} />
                    <div style={{ width: `${(r.o.fees / r.o.gross) * 100}%`, background: "var(--warn)" }} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-2">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-pos" /> You keep <Money value={sum.kept} /></span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-info" /> Tax when withdrawn <Money value={sum.tax} /></span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-warn" /> Fees and yearly costs <Money value={sum.fees} /></span>
            </div>
            <p className="mt-2 text-[12px] text-fg-3">
              Rough guide: steady growth, no new money, all yearly costs above taken along the way, everything withdrawn at the end under today’s rules (TFSA/FHSA
              tax-free, RRSP and pension withdrawals taxed as income, non-registered gains 50% taxable). Hover an account for its rule.
            </p>
          </div>
        </div>

        <details className="rounded-md border border-line-subtle p-3 text-[13px]">
          <summary className="cursor-pointer font-medium">What these costs mean</summary>
          <dl className="mt-3 grid gap-x-8 gap-y-3 text-fg-2 md:grid-cols-2">
            {[
              ["Management fee", "What the fund manager charges to run the fund, as a % of what you hold each year. Part of the MER."],
              ["MER (management expense ratio)", "All of the fund's yearly charges: management fee + operating costs (audit, legal, custody, index licence) + GST/HST. Taken from the fund's value daily; you never get a bill. 0.20% on $10,000 = $20 a year."],
              ["Trading expense ratio (TER)", "Brokerage commissions the fund pays when it trades, on top of the MER. Tiny for index funds, larger for active ones."],
              ["Plan / segregated fund fee", "Group plans (e.g. Sun Life) charge their own fee on their version of a fund; it's on your plan statement, not on the underlying fund's page. Enter it on the holding's page."],
              ["Foreign withholding tax", "Other countries keep part of dividends paid to foreign investors (US: 15%). A non-registered account gets it back as a foreign tax credit; TFSAs, FHSAs and (for Canadian-listed funds) RRSPs can't."],
              ["Tax on distributions", "In a non-registered account, dividends and interest paid out are taxed each year, even if reinvested. Canadian dividends get the dividend tax credit."],
              ["Front-end load", "A sales commission taken when you buy (some advisor-sold mutual funds)."],
              ["Deferred sales charge (exit fee)", "A fee for selling within a set number of years (often 5–7%, shrinking yearly). Banned for new purchases in Canada since June 2022."],
              ["Trailing commission", "Part of a mutual fund's MER paid to the dealer every year (often 0.25–1%). Already inside the MER."],
              ["Bid-ask spread", "The gap between buying and selling prices of an ETF or stock; you lose about half of it per trade."],
              ["Currency conversion", "Converting between CAD and USD at a broker or bank usually costs 1–2.5% each way."],
              ["Capital gains tax", "Selling for more than you paid in a non-registered account: half the gain is added to your income."],
            ].map(([t, d]) => (
              <div key={t}>
                <dt className="font-medium text-fg">{t}</dt>
                <dd className="text-[12px]">{d}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </Card>
  );
}

function Slider({ label, value, min, max, step, onChange, suffix, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix: string; hint?: string }) {
  return (
    <label className="block" title={hint}>
      <div className="flex justify-between text-fg-3">
        <span>{label}</span>
        <span className="num font-medium text-fg">
          {value}
          {suffix}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
    </label>
  );
}

// ── Overlap ─────────────────────────────────────────────────────────────────

function Overlap({ rows, data }: { rows: Row[]; data: MarketData }) {
  const funds = rows.filter((r) => r.symbol && r.profile?.fund && (r.profile.fund.stock ?? 0) > 0.3).slice(0, 10);
  const matrix = useMemo(() => funds.map((a, i) => funds.map((b, j) => (i === j ? 1 : overlap(a.symbol!, b.symbol!, data).share))), [rows, data]);
  if (funds.length < 2) return null;
  const labels = funds.map((r) => (r.h.instrument.symbol ?? r.symbol!).replace(/\.TO$/, ""));
  return (
    <Card title="Fund overlap" actions={<span className="text-[12px] text-fg-3">share of stocks held in common</span>}>
      <Heatmap labels={labels} matrix={matrix} />
      <p className="mt-3 text-[12px] text-fg-3">
        Uses complete holdings where the fund publishes them (top holdings otherwise), looking through funds of funds. High overlap means two funds mostly
        hold the same companies.
      </p>
    </Card>
  );
}

// ── Macro ───────────────────────────────────────────────────────────────────

function MacroCard() {
  const macro = useMacro();
  return (
    <Card title="Canadian rates and inflation" actions={<span className="text-[12px] text-fg-3">Bank of Canada</span>}>
      <MarketGate state={macro} what="Bank of Canada data">
        {(m) => {
          const item = (label: string, v: typeof m.policyRate, unit: string, hint?: string): [string, ReactNode, string?] => [
            label,
            v ? (
              <>
                {v.value.toFixed(unit === "" ? 4 : 2)}
                {unit}
                {v.yearAgo !== null && (
                  <span className="ml-1.5 text-[12px] font-normal text-fg-3">
                    {v.value >= v.yearAgo ? "▲" : "▼"} from {v.yearAgo.toFixed(unit === "" ? 4 : 2)}
                    {unit} a year ago
                  </span>
                )}
              </>
            ) : (
              "—"
            ),
            v ? `${hint ?? ""} As of ${formatDate(v.date)}.` : hint,
          ];
          const real = m.policyRate && m.cpi ? m.policyRate.value - m.cpi.value : null;
          return (
            <>
              <Facts
                items={[
                  item("Policy rate", m.policyRate, "%", "Drives savings-account and GIC rates."),
                  item("Inflation (CPI)", m.cpi, "%", "Year-over-year change in consumer prices."),
                  item("10-year bond yield", m.bond10y, "%", "Government of Canada benchmark."),
                  item("USD/CAD", m.usdcad, "", "Canadian dollars per US dollar."),
                ]}
              />
              {real !== null && (
                <div className="mt-4">
                  <Notice tone={real < 0 ? "warn" : "info"}>
                    Cash at the policy rate {real < 0 ? "loses" : "beats"} inflation by about {Math.abs(real).toFixed(2)} points a year
                    {real < 0 ? ": money parked in cash is shrinking in real terms." : "."}
                  </Notice>
                </div>
              )}
            </>
          );
        }}
      </MarketGate>
    </Card>
  );
}
