import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { BarChart } from "@/components/BarChart";
import { Donut } from "@/components/Donut";
import { LineChart } from "@/components/LineChart";
import { Money, Pct, chartColor } from "@/components/money";
import { StackedBarChart } from "@/components/StackedBarChart";
import { Card } from "@/components/ui";
import { useAppData } from "@/data/appDataSync";
import { PARENT_BY_ID } from "@/data/categories";
import { monthOf, monthly, type ScopedTxn } from "@/data/cashflow";
import { buildHistory } from "@/data/history";
import { ASSET_CLASS_LABEL, holdings } from "@/data/holdings";
import { useLimits } from "@/data/limits";
import { addMonths, expectedMonth, lastFullMonths, monthPace, monthsBetween } from "@/data/months";
import type { Dataset } from "@/data/model";
import { defaultGroups, runProjections, sumProjections, useProjections } from "@/data/projections";
import { ROOM_LABEL, computeRoom } from "@/data/room";
import { allAccounts, scopeAccounts, scopeTransactions } from "@/data/select";
import { useSettings } from "@/data/settings";
import { byParent, isSpend, recurring, spendByMonth, spendValue } from "@/data/spending";
import type { StatementBundle } from "@/data/statement-types";
import { formatMonth, todayIso } from "@/lib/format";
import { getStatements } from "@/lib/private-files";
import { useUi } from "@/lib/ui-store";
import { useSpendView } from "@/features/spending/selection";
import { PARENT_COLOR } from "@/features/spending/WhereItWent";

/** Overview widgets: a glance at every section, each linking to its page. */

function More({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-[13px] font-medium text-accent hover:underline">
      {children} →
    </Link>
  );
}

const everyday = (ds: Dataset) => new Set(allAccounts(ds).filter((a) => a.bucket === "cash" || a.bucket === "debt").map((a) => a.key));

export function Widgets({ ds }: { ds: Dataset }) {
  const person = useUi((s) => s.person);
  const txns = useMemo(() => scopeTransactions(ds, person), [ds, person]);
  const spendTxns = useMemo(() => {
    const keys = everyday(ds);
    return txns.filter((t) => keys.has(t.accountKey));
  }, [ds, txns]);
  return (
    <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
      <NetWorthWidget ds={ds} />
      <SpendingWidget txns={spendTxns} />
      <CashFlowWidget txns={spendTxns} />
      <AllocationWidget ds={ds} />
      <InvestmentIncomeWidget txns={txns} />
      <ProjectionWidget ds={ds} />
      <RoomWidget ds={ds} />
      <RecurringWidget txns={spendTxns} />
      <StatementsWidget />
    </div>
  );
}

// ── Net worth ─────────────────────────────────────────────────────────────────

function NetWorthWidget({ ds }: { ds: Dataset }) {
  const person = useUi((s) => s.person);
  const demo = useUi((s) => s.demo);
  const app = useAppData();
  const snapshots = !demo && app.status === "ready" ? app.snapshots : [];
  const points = useMemo(() => buildHistory(ds, snapshots, person), [ds, snapshots, person]);
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const recent = points.filter((p) => p.date >= since);
  const first = recent[0];
  const last = recent.at(-1);
  return (
    <Card title="Net worth, 12 months" actions={<More to="/networth">Net worth</More>}>
      {first && last && (
        <p className="mb-2 text-[13px] text-fg-2">
          <Money value={last.net} className="text-[17px] font-semibold text-fg" />{" "}
          <Money value={last.net - first.net} signed tone /> {first.net > 0 && <>(<Pct value={(last.net - first.net) / first.net} tone />)</>}
        </p>
      )}
      <LineChart points={recent.map((p) => ({ date: p.date, value: p.net, estimated: p.estimated }))} />
    </Card>
  );
}

// ── Spending ──────────────────────────────────────────────────────────────────

function SpendingWidget({ txns }: { txns: ScopedTxn[] }) {
  const navigate = useNavigate();
  const setMonths = useSpendView((s) => s.setMonths);
  const today = todayIso();
  const now = today.slice(0, 7);
  const cols = monthsBetween(addMonths(now, -11), now);
  const idx = new Map(cols.map((c, i) => [c, i]));
  const series = new Map<string, number[]>();
  for (const t of txns) {
    const i = idx.get(monthOf(t.date));
    if (i === undefined || !isSpend(t)) continue;
    const k = byParent(t);
    const arr = series.get(k) ?? series.set(k, new Array<number>(cols.length).fill(0)).get(k)!;
    arr[i]! += spendValue(t);
  }
  const list = [...series.entries()].sort((a, b) => b[1].reduce((s, v) => s + v, 0) - a[1].reduce((s, v) => s + v, 0));
  const byMonth = spendByMonth(txns);
  const typical = expectedMonth(byMonth, now, now);
  const pace = monthPace(byMonth.get(now) ?? 0, typical, today);
  return (
    <Card title="Spending by month" actions={<More to="/spending">Spending</More>}>
      <p className="mb-2 text-[13px] text-fg-2">
        {formatMonth(now)}: <Money value={byMonth.get(now) ?? 0} className="font-semibold text-fg" /> so far · on pace for <Money value={pace} className="font-medium" /> ·
        typical <Money value={typical} />
      </p>
      <StackedBarChart
        labels={cols}
        height={200}
        maxLegend={6}
        series={list.map(([k, values]) => ({ key: k, label: PARENT_BY_ID.get(k)?.label ?? k, values, color: PARENT_COLOR.get(k) }))}
        onPick={(m) => {
          setMonths([m], m);
          void navigate({ to: "/spending" });
        }}
      />
      <p className="mt-1 text-[11px] text-fg-3">Click a month to open it on the Spending page.</p>
    </Card>
  );
}

function CashFlowWidget({ txns }: { txns: ScopedTxn[] }) {
  const months = lastFullMonths(todayIso(), 12);
  const rows = monthly(txns, [`${months[0]}-01`, `${months.at(-1)}-31`]);
  const income = rows.reduce((s, r) => s + r.income, 0);
  const spent = rows.reduce((s, r) => s + r.spending, 0);
  return (
    <Card title="Money in vs out" actions={<More to="/cashflow">Transactions</More>}>
      <p className="mb-2 text-[13px] text-fg-2">
        Last 12 months: saved <Money value={income - spent} signed tone className="font-semibold" />
        {income > 0 && <> · savings rate <Pct value={(income - spent) / income} tone /></>}
      </p>
      <BarChart
        labels={rows.map((r) => r.month)}
        height={200}
        series={[
          { key: "in", label: "Money in", color: "var(--pos)", values: rows.map((r) => r.income) },
          { key: "out", label: "Spending", color: "var(--neg)", values: rows.map((r) => r.spending) },
        ]}
      />
    </Card>
  );
}

// ── Investing ─────────────────────────────────────────────────────────────────

function AllocationWidget({ ds }: { ds: Dataset }) {
  const person = useUi((s) => s.person);
  const hs = holdings(ds, person);
  const byClass = new Map<string, number>();
  for (const h of hs) byClass.set(h.instrument.assetClass, (byClass.get(h.instrument.assetClass) ?? 0) + h.marketValue);
  const parts = [...byClass.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v], i) => ({ key: k, label: ASSET_CLASS_LABEL[k as keyof typeof ASSET_CLASS_LABEL] ?? k, value: v, color: chartColor(i) }));
  return (
    <Card title="Investments by asset class" actions={<More to="/allocation">Allocation</More>}>
      {parts.length ? <Donut parts={parts} /> : <p className="text-fg-3">No holdings.</p>}
    </Card>
  );
}

function InvestmentIncomeWidget({ txns }: { txns: ScopedTxn[] }) {
  const months = lastFullMonths(todayIso(), 12);
  const rows = monthly(txns, [`${months[0]}-01`, `${months.at(-1)}-31`]);
  const total = rows.reduce((s, r) => s + r.investmentIncome, 0);
  return (
    <Card title="Investment income" actions={<More to="/income">Income</More>}>
      <p className="mb-2 text-[13px] text-fg-2">
        Last 12 months: <Money value={total} className="font-semibold text-fg" /> · <Money value={total / 12} /> a month
      </p>
      <BarChart labels={rows.map((r) => r.month)} height={200} series={[{ key: "ii", label: "Dividends & interest", color: "var(--chart-3)", values: rows.map((r) => Math.max(r.investmentIncome, 0)) }]} />
    </Card>
  );
}

function ProjectionWidget({ ds }: { ds: Dataset }) {
  const st = useProjections();
  const person = useUi((s) => s.person);
  const accounts = scopeAccounts(ds, person);
  const values = new Map(accounts.map((a) => [a.key, a.value]));
  const groups = st.groups.length ? st.groups : defaultGroups(ds.accounts);
  const total = sumProjections(runProjections(groups, (k) => values.get(k) ?? 0, st), "total", "Total");
  const year = new Date().getFullYear();
  const at = (n: number) => total.mid[Math.min(n, total.mid.length - 1)] ?? 0;
  const marks = [10, 20, 30].filter((n) => n < total.mid.length);
  return (
    <Card title="Investments, projected" actions={<More to="/projections">Projections</More>}>
      <div className="mb-2 grid grid-cols-3 gap-2 text-center">
        {marks.map((n) => (
          <div key={n}>
            <div className="text-[11px] text-fg-3">in {n} years ({year + n})</div>
            <Money value={at(n)} style="compact" className="text-[17px] font-semibold" />
          </div>
        ))}
      </div>
      <LineChart points={total.mid.map((v, i) => ({ date: `${year + i}-01-01`, value: v, extra: [{ label: "Low", value: total.low[i] ?? 0 }, { label: "High", value: total.high[i] ?? 0 }] }))} />
      <p className="mt-1 text-[11px] text-fg-3">Expected case, {st.real ? "in today’s dollars" : "nominal"} — rates and contributions are set on the Projections page.</p>
    </Card>
  );
}

function RoomWidget({ ds }: { ds: Dataset }) {
  const people = useSettings((s) => s.people);
  const exclusionList = useSettings((s) => s.roomExclusions);
  const limitsState = useLimits();
  const year = new Date().getFullYear();
  const primary = people[0];
  if (!primary) return null;
  const limits = limitsState.status === "ready" ? (limitsState.limits.years[year] ?? {}) : {};
  const results = computeRoom(ds, primary.id, { year, ...limits }, new Set(exclusionList));
  return (
    <Card title={`Contribution room ${year}`} actions={<More to="/room">Room</More>}>
      <ul className="space-y-3">
        {results.map((r) => {
          const used = r.room ? Math.min(1, Math.max(0, r.contributed / r.room)) : 0;
          return (
            <li key={r.kind}>
              <div className="mb-1 flex items-baseline justify-between text-[13px]">
                <span className="font-medium">{ROOM_LABEL[r.kind]}</span>
                <span className="text-fg-2">
                  {r.remaining === null ? (
                    <span className="text-fg-3">limit not set</span>
                  ) : (
                    <>
                      <Money value={r.remaining} className="font-semibold text-fg" /> left of <Money value={r.room ?? 0} />
                    </>
                  )}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-selected">
                <div className="h-full rounded-full bg-accent" style={{ width: `${used * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {primary && people.length > 1 && <p className="mt-2 text-[11px] text-fg-3">{primary.name}’s accounts.</p>}
    </Card>
  );
}

// ── Recurring & statements ────────────────────────────────────────────────────

function RecurringWidget({ txns }: { txns: ScopedTxn[] }) {
  const active = recurring(txns, todayIso()).filter((r) => r.active);
  const monthlyCost = active.reduce((s, r) => s + r.monthlyCost, 0);
  const top = active.slice(0, 6);
  const max = Math.max(1, ...top.map((r) => r.monthlyCost));
  return (
    <Card title="Recurring payments" actions={<More to="/spending">Spending</More>}>
      <p className="mb-3 text-[13px] text-fg-2">
        <Money value={monthlyCost} className="font-semibold text-fg" /> a month across {active.length} bills and subscriptions
      </p>
      <ul className="space-y-2">
        {top.map((r, i) => (
          <li key={r.merchant}>
            <div className="mb-0.5 flex justify-between gap-3 text-[12px]">
              <span className="truncate">{r.merchant}</span>
              <span className="shrink-0 text-fg-2"><Money value={r.monthlyCost} />/mo</span>
            </div>
            <div className="h-1.5 rounded-full bg-selected">
              <div className="h-full rounded-full" style={{ width: `${(r.monthlyCost / max) * 100}%`, background: chartColor(i) }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function StatementsWidget() {
  const [b, setB] = useState<StatementBundle | null>(null);
  useEffect(() => {
    getStatements().then(setB).catch(() => setB(null));
  }, []);
  const demo = useUi((s) => s.demo);
  if (demo || !b?.accounts.length) return null;
  const now = todayIso().slice(0, 7);
  return (
    <Card title="Statements" actions={<More to="/upload">Upload</More>}>
      <ul className="space-y-2 text-[13px]">
        {b.accounts.map((a) => {
          const latest = a.files.map((f) => f.period?.[1]?.slice(0, 7)).filter((m): m is string => !!m).sort().at(-1);
          const behind = latest ? monthsBetween(latest, now).length - 1 : null;
          const problems = a.files.filter((f) => f.error || (f.check && f.check !== "ok")).length;
          return (
            <li key={a.folder} className="flex items-center justify-between gap-3">
              <span className="truncate">{a.meta.name ?? a.folder}</span>
              <span className={behind !== null && behind > 1 ? "shrink-0 text-warn" : "shrink-0 text-fg-3"}>
                {latest ? `up to ${formatMonth(latest)}` : "no PDFs"}
                {behind !== null && behind > 1 && ` · ${behind - 1} missing`}
                {problems > 0 && ` · ${problems} to check`}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-fg-3">Statements are monthly; drop new ones on the Upload page.</p>
    </Card>
  );
}
