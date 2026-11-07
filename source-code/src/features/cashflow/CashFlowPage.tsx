import { useMemo, useState } from "react";
import { DataGate } from "@/components/DataGate";
import { DataTable, type Column } from "@/components/DataTable";
import { StackedBarChart } from "@/components/StackedBarChart";
import { BarList, Money, Pct, Stat, chartColor } from "@/components/money";
import { Card, Segmented, cx } from "@/components/ui";
import { accountTypeLabel, shortInstitution } from "@/data/build";
import { CATEGORIES, CATEGORY_BY_ID } from "@/data/categories";
import {
  PERIOD_LABEL, byCategory, inRange, isSpendCategory, merchantKey, monthOf, monthly, monthlyBy, periodRange, totals, type Period, type ScopedTxn,
} from "@/data/cashflow";
import type { Account, Dataset } from "@/data/model";
import { allAccounts, scopeTransactions } from "@/data/select";
import { useSettings } from "@/data/settings";
import { formatDate, formatMonth, todayIso } from "@/lib/format";
import { useUi } from "@/lib/ui-store";

export function CashFlowPage() {
  return <DataGate>{(ds) => <CashFlow ds={ds} />}</DataGate>;
}

type View = "everyday" | "cards" | "bank" | "investing";

const VIEWS: { id: View; label: string; hint: string; accounts: (a: Account) => boolean }[] = [
  { id: "everyday", label: "Everyday", hint: "Credit cards and bank accounts: what you earn and spend", accounts: (a) => a.bucket === "cash" || a.bucket === "debt" },
  { id: "cards", label: "Credit cards", hint: "Spending by card; payments to the cards are transfers", accounts: (a) => a.bucket === "debt" },
  { id: "bank", label: "Bank accounts", hint: "Chequing and savings", accounts: (a) => a.bucket === "cash" },
  { id: "investing", label: "Investment accounts", hint: "Money moved into and out of TFSA, RRSP, pensions and brokerage accounts", accounts: (a) => a.bucket === "investments" || a.bucket === "retirement" },
];

/** Spending / Income / Moving money (own accounts, circle, card payments) / Investing. */
function movementOf(t: ScopedTxn): string {
  if (t.kind === "transfer") return "Moving money";
  if (t.kind !== "flow") return "Investing";
  const g = CATEGORY_BY_ID.get(t.category ?? "")?.group;
  return g === "income" ? "Income" : g === "transfer" ? "Moving money" : "Spending";
}

const KIND_LABEL: Record<string, string> = {
  flow: "Income / spending", transfer: "Transfer between your accounts", contribution: "Contribution", withdrawal: "Withdrawal",
  trade: "Buy / sell", "investment-income": "Investment income", tax: "Withholding tax", ignore: "Bookkeeping",
};

/** Accounts switched off per view, remembered in this browser. */
function useOffAccounts(view: View): [Set<string>, (key: string) => void] {
  const storageKey = `cashflow-off:${view}`;
  const [all, setAll] = useState<Record<string, string[]>>({});
  const off = new Set(all[view] ?? readOff(storageKey));
  const toggle = (key: string) => {
    const next = off.has(key) ? [...off].filter((k) => k !== key) : [...off, key];
    setAll((a) => ({ ...a, [view]: next }));
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  return [off, toggle];
}
function readOff(k: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function CashFlow({ ds }: { ds: Dataset }) {
  const person = useUi((s) => s.person);
  const [view, setView] = useState<View>("everyday");
  const [period, setPeriod] = useState<Period>("12m");
  const [off, toggleAccount] = useOffAccounts(view);
  const v = VIEWS.find((x) => x.id === view)!;

  const allTxns = useMemo(() => scopeTransactions(ds, person), [ds, person]);
  const viewAccounts = allAccounts(ds).filter(v.accounts).filter((a) => allTxns.some((t) => t.accountKey === a.key));
  const selected = new Set(viewAccounts.filter((a) => !off.has(a.key)).map((a) => a.key));
  const txns = allTxns.filter((t) => selected.has(t.accountKey));
  const names = new Map(allAccounts(ds).map((a) => [a.key, a.name]));
  const [from, to] = periodRange(period, todayIso(), ds.transactions.at(-1)?.date ?? todayIso());
  const range: [string, string] = [from, to];

  if (!ds.transactions.length) return <Card title="Cash flow">No transactions found. Add your Wealthica Transactions export on the Data page.</Card>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="View" value={view} onChange={setView} options={VIEWS.map((x) => ({ value: x.id, label: x.label }))} />
        <Segmented label="Period" value={period} onChange={setPeriod} options={(Object.keys(PERIOD_LABEL) as Period[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} />
      </div>

      <div>
        <p className="mb-2 text-[12px] text-fg-3">{v.hint}. Click an account to include or exclude it.</p>
        <div className="flex flex-wrap gap-1.5">
          {viewAccounts.map((a, i) => {
            const on = selected.has(a.key);
            return (
              <button
                key={a.key}
                onClick={() => toggleAccount(a.key)}
                aria-pressed={on}
                className={cx("flex h-8 items-center gap-2 rounded-full border px-3 text-[12px] transition-colors", on ? "border-accent bg-accent-subtle text-fg" : "border-line text-fg-3 line-through hover:text-fg")}
              >
                <span className="size-2.5 rounded-full" style={{ background: chartColor(i), opacity: on ? 1 : 0.3 }} />
                {a.name}
                <span className="text-fg-3">{shortInstitution(a.institution)}</span>
              </button>
            );
          })}
          {viewAccounts.length === 0 && <span className="text-fg-3">No accounts with transactions in this view.</span>}
        </div>
      </div>

      {view === "investing" ? (
        <InvestingFlows txns={txns} range={range} names={names} accounts={viewAccounts} />
      ) : view === "cards" ? (
        <CardFlows txns={txns} range={range} accounts={viewAccounts} />
      ) : (
        <EverydayFlows txns={txns} range={range} />
      )}

      <Card title="Transactions">
        <TransactionsTable ds={ds} txns={txns.filter((t) => inRange(t, range))} names={names} view={view} />
      </Card>
    </div>
  );
}

const spendOf = (t: ScopedTxn) => (t.kind === "flow" && isSpendCategory(t.category) ? -t.amount * t.share : 0);

function EverydayFlows({ txns, range }: { txns: ScopedTxn[]; range: [string, string] }) {
  const rows = monthly(txns, range);
  const t = totals(rows);
  const full = rows.filter((r) => r.month < todayIso().slice(0, 7)).length || 1;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Income" value={<Money value={t.income} />} sub={<>avg <Money value={t.income / full} /> / month</>} />
        <Stat label="Spending" value={<Money value={t.spending} />} sub={<>avg <Money value={t.spending / full} /> / month</>} />
        <Stat label="Net saved" value={<Money value={t.net} signed tone />} sub="income − spending" />
        <Stat label="Savings rate" value={t.savingsRate === null ? "—" : <Pct value={t.savingsRate} tone />} sub="share of income not spent" />
      </div>
      <Card title="Income and spending by month">
        <StackedBarChart
          labels={rows.map((r) => r.month)}
          series={[
            { key: "income", label: "Income", values: rows.map((r) => r.income), color: "var(--pos)" },
            { key: "spending", label: "Spending", values: rows.map((r) => -r.spending), color: "var(--chart-2)" },
          ]}
          line={{ label: "Net saved", values: rows.map((r) => r.net) }}
        />
      </Card>
      <CategoryCards txns={txns} range={range} />
    </>
  );
}

function CardFlows({ txns, range, accounts }: { txns: ScopedTxn[]; range: [string, string]; accounts: Account[] }) {
  const byCard = monthlyBy(txns, range, (t) => t.accountKey, spendOf);
  const color = new Map(accounts.map((a, i) => [a.key, chartColor(i)]));
  const spend = byCard.series.reduce((s, x) => s + x.total, 0);
  const refunds = txns.filter((t) => inRange(t, range) && t.kind === "flow" && t.category === "refunds").reduce((s, t) => s + t.amount * t.share, 0);
  const payments = txns.filter((t) => inRange(t, range) && t.kind === "transfer" && t.amount > 0).reduce((s, t) => s + t.amount * t.share, 0);
  const full = byCard.months.filter((m) => m < todayIso().slice(0, 7)).length || 1;
  const name = (k: string) => accounts.find((a) => a.key === k)?.name ?? k;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Card spending" value={<Money value={spend} />} sub="net of refunds" />
        <Stat label="Monthly average" value={<Money value={spend / full} />} sub={`over ${full} full months`} />
        <Stat label="Refunds & credits" value={<Money value={refunds} />} />
        <Stat label="Paid to cards" value={<Money value={payments} />} sub="from your bank accounts" />
      </div>
      <Card title="Spending by card, per month">
        <StackedBarChart
          labels={byCard.months}
          series={byCard.series.map((s) => ({ key: s.key, label: name(s.key), values: s.values, color: color.get(s.key) }))}
          line={{ label: "Total", values: byCard.months.map((_, i) => byCard.series.reduce((s, x) => s + x.values[i]!, 0)) }}
        />
      </Card>
      <CategoryCards txns={txns} range={range} />
    </>
  );
}

function InvestingFlows({ txns, range, names, accounts }: { txns: ScopedTxn[]; range: [string, string]; names: Map<string, string>; accounts: Account[] }) {
  const moneyIn = (t: ScopedTxn) => (t.kind === "contribution" || t.kind === "withdrawal" || t.kind === "transfer" ? t.amount * t.share : 0);
  const by = monthlyBy(txns, range, (t) => t.accountKey, moneyIn);
  const color = new Map(accounts.map((a, i) => [a.key, chartColor(i)]));
  const inflow = txns.filter((t) => inRange(t, range) && moneyIn(t) > 0).reduce((s, t) => s + moneyIn(t), 0);
  const outflow = txns.filter((t) => inRange(t, range) && moneyIn(t) < 0).reduce((s, t) => s + moneyIn(t), 0);
  const income = txns.filter((t) => inRange(t, range) && (t.kind === "investment-income" || t.kind === "tax")).reduce((s, t) => s + t.amount * t.share, 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Money in" value={<Money value={inflow} />} sub="contributions and transfers in" />
        <Stat label="Money out" value={<Money value={outflow} />} sub="withdrawals and transfers out" />
        <Stat label="Net added" value={<Money value={inflow + outflow} signed tone />} />
        <Stat label="Investment income" value={<Money value={income} />} sub="after withholding tax" />
      </div>
      <Card title="Money in and out by account, per month">
        <StackedBarChart
          labels={by.months}
          series={by.series.map((s) => ({ key: s.key, label: names.get(s.key) ?? s.key, values: s.values, color: color.get(s.key) }))}
          line={{ label: "Net", values: by.months.map((_, i) => by.series.reduce((s, x) => s + x.values[i]!, 0)) }}
        />
      </Card>
    </>
  );
}

function CategoryCards({ txns, range }: { txns: ScopedTxn[]; range: [string, string] }) {
  const spend = byCategory(txns, range, "expense");
  const income = byCategory(txns, range, "income");
  const byCat = monthlyBy(txns.filter((t) => t.kind === "flow" && isSpendCategory(t.category)), range, (t) => t.category ?? "uncategorised", spendOf);
  return (
    <>
      <Card title="Spending by category, per month">
        <StackedBarChart
          labels={byCat.months}
          series={byCat.series.map((s, i) => ({ key: s.key, label: CATEGORY_BY_ID.get(s.key)?.label ?? s.key, values: s.values, color: chartColor(i) }))}
        />
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Spending by category">
          {spend.length ? <BarList rows={spend.map((c) => ({ key: c.category, label: <>{CATEGORY_BY_ID.get(c.category)?.label ?? c.category} <span className="text-fg-3">· {c.count}</span></>, value: c.total }))} /> : <p className="text-fg-3">Nothing in this period.</p>}
        </Card>
        <Card title="Income by source">
          {income.length ? <BarList rows={income.map((c) => ({ key: c.category, label: <>{CATEGORY_BY_ID.get(c.category)?.label ?? c.category} <span className="text-fg-3">· {c.count}</span></>, value: c.total }))} /> : <p className="text-fg-3">Nothing in this period.</p>}
        </Card>
      </div>
    </>
  );
}

function TransactionsTable({ ds, txns, names, view }: { ds: Dataset; txns: ScopedTxn[]; names: Map<string, string>; view: View }) {
  const rules = useSettings((s) => s.rules);
  const setRules = useSettings((s) => s.setRules);
  const types = new Map(allAccounts(ds).map((a) => [a.key, accountTypeLabel(a.type)]));
  const rows = view === "investing" ? txns.filter((t) => t.kind !== "ignore") : txns.filter((t) => t.kind === "flow" || t.kind === "transfer");

  function recategorise(t: ScopedTxn, cat: string) {
    const match = merchantKey(t.description);
    const direction = t.amount >= 0 ? "in" : "out";
    setRules([{ match, category: cat, direction }, ...rules.filter((r) => !(r.match.toUpperCase() === match.toUpperCase() && r.direction === direction))]);
  }

  const columns: Column<ScopedTxn>[] = [
    { id: "date", header: "Date", value: (t) => t.date, render: (t) => <span className="num whitespace-nowrap text-[12px] text-fg-3">{formatDate(t.date)}</span>, width: "8rem" },
    {
      id: "description",
      header: "Description",
      value: (t) => t.description,
      pinned: true,
      render: (t) => <span className="line-clamp-1" title={t.description}>{t.description}</span>,
    },
    { id: "account", header: "Account", value: (t) => names.get(t.accountKey) ?? "—", facet: true, render: (t) => <span className="text-[12px] text-fg-2">{names.get(t.accountKey)}</span> },
    { id: "accountType", header: "Account type", value: (t) => types.get(t.accountKey) ?? "—", facet: true, hidden: true },
    {
      id: "category",
      header: "Category",
      value: (t) => (t.kind === "flow" ? (t.category ?? "uncategorised") : t.kind),
      facet: true,
      facetLabel: (v) => CATEGORY_BY_ID.get(v)?.label ?? KIND_LABEL[v] ?? v,
      render: (t) =>
        t.kind === "flow" ? (
          <select
            aria-label={`Category for ${t.description}`}
            value={t.category}
            onChange={(e) => recategorise(t, e.target.value)}
            className="h-7 max-w-48 rounded border border-transparent bg-transparent px-1 text-[12px] text-fg-2 hover:border-line"
          >
            {CATEGORIES.filter((c) => (t.amount >= 0 ? c.group !== "expense" || c.id === "refunds" : c.group !== "income")).map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        ) : (
          <span className="text-[12px] text-fg-3">{KIND_LABEL[t.kind]}</span>
        ),
    },
    { id: "movement", header: "Type", value: movementOf, facet: true, hidden: true },
    { id: "kind", header: "Kind", value: (t) => t.kind, facet: true, facetLabel: (v) => KIND_LABEL[v] ?? v, hidden: true },
    { id: "direction", header: "Direction", value: (t) => (t.amount >= 0 ? "Money in" : "Money out"), facet: true, hidden: true },
    { id: "month", header: "Month", value: (t) => monthOf(t.date), facet: true, facetLabel: formatMonth, hidden: true },
    { id: "merchant", header: "Merchant", value: (t) => merchantKey(t.description), facet: true, hidden: true },
    { id: "amount", header: "Amount", value: (t) => t.amount * t.share, sum: true, align: "right", render: (t) => <Money value={t.amount * t.share} style="cents" tone={t.amount > 0} /> },
  ];

  return (
    <DataTable
      key={view}
      tableId={`cashflow-v2-${view}`}
      rows={rows}
      columns={columns}
      rowKey={(t) => t.id}
      initialSort={{ id: "date", desc: true }}
      initialFilters={view === "investing" ? {} : { movement: ["Spending", "Income"] }}
      search={(t) => `${t.description} ${names.get(t.accountKey) ?? ""} ${CATEGORY_BY_ID.get(t.category ?? "")?.label ?? ""}`}
      rowClassName={(t) => (movementOf(t) === "Moving money" ? "text-fg-3" : undefined)}
    />
  );
}
