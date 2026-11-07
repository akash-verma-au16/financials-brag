import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, X } from "lucide-react";
import { DataGate } from "@/components/DataGate";
import { DataTable, type Column } from "@/components/DataTable";
import { CategorySelect } from "@/components/CategorySelect";
import { StackedBarChart } from "@/components/StackedBarChart";
import { Money, Pct, Stat, chartColor } from "@/components/money";
import { Badge, Button, Card, Segmented, cx } from "@/components/ui";
import { shortInstitution } from "@/data/build";
import { PARENT_BY_ID, parentOf } from "@/data/categories";
import { isIncomeCategory, monthOf, type ScopedTxn } from "@/data/cashflow";
import { describeMonths, monthsBetween, previousMonths, spanOf, yearEarlier } from "@/data/months";
import type { Account, Dataset } from "@/data/model";
import { allAccounts, scopeTransactions } from "@/data/select";
import {
  byMerchant, byParent, categoryLabel, incomeOf, isLeftOut, isSpend, merchants, needsReview, recurring, spendByMonth, spendValue, totalsBy, type MerchantRow, type Recurring,
} from "@/data/spending";
import { formatDate, formatMonth, todayIso } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { MonthPicker, useMonthPicker } from "./MonthPicker";
import { useSelectedMonths, useSpendView } from "./selection";
import { Compare, YearOverYear } from "./Trends";
import { PARENT_COLOR, WhereItWent } from "./WhereItWent";

export type SpendScope = "all" | "cards" | "bank";

const SCOPES: Record<SpendScope, { title: string; hint: string; accounts: (a: Account) => boolean }> = {
  all: { title: "Everyday spending", hint: "Credit cards, chequing, savings and cash accounts", accounts: (a) => a.bucket === "cash" || a.bucket === "debt" },
  cards: { title: "Credit cards", hint: "Card purchases only — payments to the cards are transfers, not spending", accounts: (a) => a.type === "credit" },
  bank: { title: "Bank accounts", hint: "Chequing and savings: bills, rent, insurance, car payments, e-Transfers", accounts: (a) => a.bucket === "cash" },
};

export function SpendingPage({ scope }: { scope: SpendScope }) {
  return <DataGate>{(ds) => <Spending key={scope} ds={ds} scope={scope} />}</DataGate>;
}

function useOffAccounts(scope: SpendScope): [Set<string>, (k: string) => void] {
  const key = `spending-off:${scope}`;
  const [off, setOff] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const toggle = (k: string) => {
    const next = off.includes(k) ? off.filter((x) => x !== k) : [...off, k];
    setOff(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  return [new Set(off), toggle];
}

const sumSpend = (txns: ScopedTxn[]) => txns.reduce((s, t) => s + spendValue(t), 0);
const sumMonths = (byMonth: Map<string, number>, ms: string[]) => ms.reduce((s, m) => s + (byMonth.get(m) ?? 0), 0);

// ── Page ──────────────────────────────────────────────────────────────────────

function Spending({ ds, scope }: { ds: Dataset; scope: SpendScope }) {
  const person = useUi((s) => s.person);
  const def = SCOPES[scope];
  const [off, toggle] = useOffAccounts(scope);
  const sel = useSelectedMonths();
  const selKey = sel.join();
  const selSet = useMemo(() => new Set(sel), [selKey]);
  const excluded = useSpendView((s) => s.excluded);
  const ex = useMemo(() => new Set(excluded), [excluded]);
  const picker = useMonthPicker();

  const all = useMemo(() => scopeTransactions(ds, person), [ds, person]);
  const accounts = allAccounts(ds).filter(def.accounts).filter((a) => all.some((t) => t.accountKey === a.key));
  const selected = new Set(accounts.filter((a) => !off.has(a.key)).map((a) => a.key));
  const txns = useMemo(() => all.filter((t) => selected.has(t.accountKey)), [all, [...selected].join()]);
  const kept = useMemo(() => (ex.size ? txns.filter((t) => !isLeftOut(t, ex)) : txns), [txns, ex]);
  const selAll = useMemo(() => txns.filter((t) => selSet.has(monthOf(t.date))), [txns, selSet]);
  const selKept = useMemo(() => kept.filter((t) => selSet.has(monthOf(t.date))), [kept, selSet]);
  const keptByMonth = useMemo(() => spendByMonth(kept), [kept]);
  const today = todayIso();
  const now = today.slice(0, 7);
  const first = monthOf(txns.reduce((m, t) => (t.date < m ? t.date : m), today));
  const range = spanOf(sel);

  if (!accounts.length) return <Card title={def.title}>No {scope === "cards" ? "credit-card" : scope === "bank" ? "bank-account" : ""} transactions yet. Add statements on the Data page.</Card>;

  const spent = sumSpend(selKept);
  const leftOut = sumSpend(selAll) - spent;
  const spentPrev = sumMonths(keptByMonth, previousMonths(sel));
  const spentLy = sumMonths(keptByMonth, yearEarlier(sel));
  const complete = sel.filter((m) => m < now);
  const income = sel.length ? incomeOf(selAll, range) : 0;
  const parents = totalsBy(selKept, range, byParent);
  const top = parents[0];

  return (
    <div className="space-y-5">
      <p className="text-[12px] text-fg-3">{def.hint}.</p>

      {accounts.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {accounts.map((a, i) => {
            const on = selected.has(a.key);
            return (
              <button
                key={a.key}
                onClick={() => toggle(a.key)}
                aria-pressed={on}
                className={cx("flex h-8 items-center gap-2 rounded-full border px-3 text-[12px]", on ? "border-accent bg-accent-subtle" : "border-line text-fg-3 line-through")}
              >
                <span className="size-2.5 rounded-full" style={{ background: chartColor(i), opacity: on ? 1 : 0.3 }} />
                {a.name} <span className="text-fg-3">{shortInstitution(a.institution)}</span>
              </button>
            );
          })}
        </div>
      )}

      <MonthByMonth txns={txns} kept={kept} ex={ex} first={first} sel={selSet} scope={scope} accounts={accounts} byMonth={keptByMonth} onPick={picker.pick} />

      {ex.size > 0 && <LeftOutBar txns={txns} amount={leftOut} />}

      {!sel.length ? (
        <Card>Tick one or more months above to see where the money went.</Card>
      ) : (
        <>
          <div className={cx("grid grid-cols-2 gap-3", ex.size ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
            <Stat
              label={`Spent · ${describeMonths(sel)}`}
              value={<Money value={spent} />}
              sub={
                <span className="flex flex-col">
                  {spentPrev > 0 && <Change now={spent} before={spentPrev} label="vs previous" />}
                  {spentLy > 0 && <Change now={spent} before={spentLy} label="vs last year" />}
                  {!spentPrev && !spentLy && "net of returns"}
                </span>
              }
            />
            <Stat
              label="Per month"
              value={<Money value={complete.length ? sumMonths(keptByMonth, complete) / complete.length : spent} />}
              sub={complete.length ? `average of ${complete.length} complete month${complete.length > 1 ? "s" : ""}` : "this month so far"}
            />
            {scope === "cards" ? (
              <Stat label="Interest & card fees" value={<Money value={sumCats(selAll, ["interest-charges", "bank-fees"])} />} sub="paid to the card issuers" />
            ) : (
              <Stat label="Money in" value={<Money value={income} />} sub={income > 0 ? <>spent <Pct value={spent / income} /> of it</> : "no income in these accounts"} />
            )}
            <Stat
              label="Biggest area"
              value={top ? PARENT_BY_ID.get(top.key)?.label ?? top.key : "—"}
              sub={top && spent > 0 ? <><Money value={top.total} /> · <Pct value={top.total / spent} /></> : undefined}
            />
            {ex.size > 0 && <Stat label="Left out" value={<Money value={leftOut} />} sub={<>would be <Money value={spent + leftOut} /> with everything</>} />}
          </div>

          <WhereItWent txns={selAll} sel={sel} onOnly={picker.only} />
        </>
      )}

      <YearOverYear byMonth={keptByMonth} today={today} leftOut={ex.size > 0} />

      <div className="grid gap-5 xl:grid-cols-2">
        {sel.length > 0 && <Compare kept={kept} sel={sel} byMonth={keptByMonth} />}
        <RecurringCard txns={txns} asOf={today} />
      </div>

      {sel.length > 0 && (
        <>
          {scope === "bank" && <BankFlows txns={selKept} sel={sel} />}

          <Card title="Merchants">
            <MerchantTable txns={selAll} range={range} sel={sel} ex={ex} tableId={`merchants-${scope}`} />
          </Card>

          <Card title="Transactions">
            <TransactionsTable txns={selAll} ex={ex} accounts={accounts} tableId={`spend-txns-${scope}`} />
          </Card>

          <ReviewCard txns={selAll} range={range} />
        </>
      )}
    </div>
  );
}

const sumCats = (txns: ScopedTxn[], cats: string[]) =>
  txns.filter((t) => t.kind === "flow" && cats.includes(t.category ?? "")).reduce((s, t) => s - t.amount * t.share, 0);

function Change({ now, before, label }: { now: number; before: number; label: string }) {
  const d = (now - before) / before;
  const up = d > 0;
  return (
    <span className={cx("inline-flex items-center gap-1", up ? "text-neg" : "text-pos")}>
      {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      <Pct value={Math.abs(d)} /> <span className="text-fg-3">{label}</span>
    </span>
  );
}

// ── Month by month: the whole history; click bars to choose months ────────────

type ChartMode = "area" | "flow" | "card";

function MonthByMonth({ txns, kept, ex, first, sel, scope, accounts, byMonth, onPick }: {
  txns: ScopedTxn[];
  kept: ScopedTxn[];
  ex: ReadonlySet<string>;
  first: string;
  sel: ReadonlySet<string>;
  scope: SpendScope;
  accounts: Account[];
  byMonth: Map<string, number>;
  onPick: (m: string, e: React.MouseEvent) => void;
}) {
  const [mode, setMode] = useState<ChartMode>("area");
  const [showPicker, setShowPicker] = useState(true);
  const cols = monthsBetween(first, todayIso().slice(0, 7));
  const idx = new Map(cols.map((c, i) => [c, i]));
  const series = new Map<string, number[]>();
  const add = (k: string, t: ScopedTxn, v: number) => {
    const i = idx.get(monthOf(t.date));
    if (i === undefined) return;
    const arr = series.get(k) ?? series.set(k, new Array<number>(cols.length).fill(0)).get(k)!;
    arr[i]! += v;
  };
  if (mode === "flow") {
    for (const t of kept) {
      if (isSpend(t)) add("out", t, -spendValue(t));
      else if (t.kind === "flow" && isIncomeCategory(t.category)) add("in", t, t.amount * t.share);
    }
  } else {
    for (const t of kept) if (isSpend(t)) add(mode === "card" ? t.accountKey : byParent(t), t, spendValue(t));
  }
  const ordered = [...series.entries()].sort((a, b) => b[1].reduce((s, v) => s + Math.abs(v), 0) - a[1].reduce((s, v) => s + Math.abs(v), 0));
  const leftOut = new Array<number>(cols.length).fill(0);
  if (ex.size && mode !== "flow")
    for (const t of txns) {
      const i = idx.get(monthOf(t.date));
      if (i !== undefined && isLeftOut(t, ex)) leftOut[i]! += spendValue(t);
    }
  const names = new Map(accounts.map((a) => [a.key, a.name]));
  const label = (k: string) => (mode === "flow" ? (k === "in" ? "Money in" : "Spending") : mode === "card" ? (names.get(k) ?? k) : (PARENT_BY_ID.get(k)?.label ?? k));
  const color = (k: string, i: number) => (mode === "flow" ? (k === "in" ? "var(--pos)" : "var(--neg)") : mode === "card" ? chartColor(i) : PARENT_COLOR.get(k));

  const modes: { value: ChartMode; label: string }[] = [{ value: "area", label: "By area" }];
  if (scope !== "cards") modes.push({ value: "flow", label: "In vs out" });
  if (accounts.length > 1) modes.push({ value: "card", label: scope === "cards" ? "By card" : "By account" });

  return (
    <Card
      title="Month by month"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Chart" value={mode} onChange={setMode} options={modes} />
          <Button variant="ghost" onClick={() => setShowPicker((s) => !s)}>{showPicker ? "Hide month grid" : "Pick months"}</Button>
        </div>
      }
    >
      <StackedBarChart
        labels={cols}
        series={[
          ...ordered.map(([k, values], i) => ({ key: k, label: label(k), values, color: color(k, i) })),
          ...(leftOut.some((v) => v) ? [{ key: "__left", label: "Left out", values: leftOut, color: "var(--border-strong)" }] : []),
        ]}
        line={{ label: mode === "flow" ? "Net" : "Counted spending", values: cols.map((_, i) => ordered.reduce((s, [, v]) => s + v[i]!, 0)) }}
        selected={sel}
        onPick={onPick}
        height={240}
      />
      {showPicker && (
        <div className="mt-4 border-t border-line-subtle pt-4">
          <MonthPicker first={first} totals={byMonth} />
        </div>
      )}
    </Card>
  );
}

function LeftOutBar({ txns, amount }: { txns: ScopedTxn[]; amount: number }) {
  const excluded = useSpendView((s) => s.excluded);
  const toggle = useSpendView((s) => s.toggleExcluded);
  const setExcluded = useSpendView((s) => s.setExcluded);
  const byId = new Map(txns.map((t) => [t.id, t]));
  const label = (k: string) => {
    const [p, ...rest] = k.split(":");
    const v = rest.join(":");
    if (p === "p") return PARENT_BY_ID.get(v)?.label ?? v;
    if (p === "c") return categoryLabel(v);
    if (p === "t") {
      const t = byId.get(v);
      return t ? `${byMerchant(t)} · ${formatDate(t.date)}` : "1 transaction";
    }
    return v;
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-warn-subtle px-4 py-2.5 text-[13px]">
      <span className="font-medium">Left out of every total:</span>
      {excluded.map((k) => (
        <button key={k} onClick={() => toggle(k)} className="flex h-7 items-center gap-1 rounded-full border border-line bg-raised px-2.5 text-[12px] hover:border-line-strong" title="Count it again">
          {label(k)} <X className="size-3" />
        </button>
      ))}
      <span className="text-fg-2">
        <Money value={amount} /> in the selected months
      </span>
      <button className="ml-auto text-[12px] text-accent hover:underline" onClick={() => setExcluded([])}>Count everything</button>
    </div>
  );
}

// ── Recurring ─────────────────────────────────────────────────────────────────

function RecurringCard({ txns, asOf }: { txns: ScopedTxn[]; asOf: string }) {
  const [showAll, setShowAll] = useState(false);
  const all = recurring(txns, asOf);
  const active = all.filter((r) => r.active);
  const list = showAll ? all : active;
  const monthly = active.reduce((s, r) => s + r.monthlyCost, 0);
  return (
    <Card
      title="Recurring payments"
      actions={<Button variant="ghost" onClick={() => setShowAll((s) => !s)}>{showAll ? "Active only" : `Show stopped (${all.length - active.length})`}</Button>}
    >
      <p className="mb-3 text-[13px] text-fg-2">
        <Money value={monthly} className="font-semibold text-fg" /> a month · <Money value={monthly * 12} /> a year across {active.length} active subscriptions, bills and payments.
      </p>
      {list.length === 0 ? (
        <p className="text-fg-3">None detected yet.</p>
      ) : (
        <ul className="divide-y divide-line-subtle">
          {list.slice(0, 25).map((r: Recurring) => (
            <li key={r.merchant} className={cx("flex items-center gap-3 py-1.5 text-[13px]", !r.active && "text-fg-3")}>
              <span className="min-w-0 flex-1 truncate font-medium" title={r.merchant}>{r.merchant}</span>
              <CategorySelect merchant={r.merchant} value={r.category} />
              <span className="w-20 text-right text-[12px] text-fg-3">{r.frequency}</span>
              <span className="w-24 text-right"><Money value={r.amount} style="cents" /></span>
              <span className="w-24 text-right text-[12px] text-fg-3">{r.active ? <><Money value={r.annualCost} />/yr</> : `last ${formatDate(r.last)}`}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── Bank-specific flows ───────────────────────────────────────────────────────

function BankFlows({ txns, sel }: { txns: ScopedTxn[]; sel: string[] }) {
  const cols = [...sel].sort().slice(-24);
  const by = (cats: string[]) =>
    cols.map((m) => txns.filter((t) => t.kind === "flow" && monthOf(t.date) === m && cats.includes(t.category ?? "")).reduce((s, t) => s + t.amount * t.share, 0));
  return (
    <Card title="e-Transfers, bills and big payments by month">
      <StackedBarChart
        labels={cols}
        series={[
          { key: "interac-in", label: "e-Transfers in", values: by(["interac-in"]), color: "var(--pos)" },
          { key: "interac-out", label: "e-Transfers out", values: by(["interac-out"]), color: "var(--chart-2)" },
          { key: "housing", label: "Rent & mortgage", values: by(["rent", "mortgage", "property-tax"]), color: "var(--chart-4)" },
          { key: "bills", label: "Bills & utilities", values: by(["utilities", "phone-internet", "bill-payments"]), color: "var(--chart-6)" },
          { key: "car", label: "Car payment & insurance", values: by(["car-payment", "insurance"]), color: "var(--chart-5)" },
        ]}
      />
    </Card>
  );
}

// ── Tables ────────────────────────────────────────────────────────────────────

function IncludeBox({ checked, disabled, onChange, title }: { checked: boolean; disabled?: boolean; onChange: () => void; title: string }) {
  return <input type="checkbox" className="size-3.5 cursor-pointer accent-accent disabled:cursor-not-allowed" checked={checked} disabled={disabled} onChange={onChange} title={title} aria-label={title} />;
}

const shortMonth = (m: string) => {
  const [mon, yr] = formatMonth(m).split(" ");
  return `${mon} '${yr?.slice(-2)}`;
};

type MRow = MerchantRow & { off: boolean };

function MerchantTable({ txns, range, sel, ex, tableId }: { txns: ScopedTxn[]; range: [string, string]; sel: string[]; ex: ReadonlySet<string>; tableId: string }) {
  const toggle = useSpendView((s) => s.toggleExcluded);
  const [monthCols, setMonthCols] = useState(false);
  // Merchants left out on their own stay listed (unticked); ones left out with their area/category drop out.
  const rows: MRow[] = merchants(txns.filter((t) => !isLeftOut(t, ex, `m:${byMerchant(t)}`)), range).map((r) => ({ ...r, off: ex.has(`m:${r.merchant}`) }));
  const counted = (r: MRow, v: number) => (r.off ? 0 : v);
  const columns: Column<MRow>[] = [
    {
      id: "on", header: "Counted", value: (r) => (r.off ? "Left out" : "Counted"), facet: true, pinned: true, width: "4.5rem",
      render: (r) => <IncludeBox checked={!r.off} onChange={() => toggle(`m:${r.merchant}`)} title={r.off ? "Count this merchant again" : "Leave this merchant out of every total"} />,
    },
    { id: "merchant", header: "Merchant", value: (r) => r.merchant, pinned: true, render: (r) => <span className={cx("font-medium", r.off && "text-fg-3 line-through")}>{r.merchant}</span> },
    { id: "area", header: "Area", value: (r) => parentOf(r.category).label, facet: true },
    { id: "category", header: "Category", value: (r) => categoryLabel(r.category), facet: true, render: (r) => <CategorySelect merchant={r.merchant} value={r.category} /> },
    { id: "average", header: "Typical purchase", value: (r) => r.average, align: "right", render: (r) => <Money value={r.average} style="cents" className="text-fg-2" /> },
    { id: "count", header: "Purchases", value: (r) => r.count, align: "right", hidden: true },
    { id: "months", header: "Months", value: (r) => r.months, align: "right", hidden: true },
    { id: "last", header: "Last", value: (r) => r.last, render: (r) => <span className="text-[12px] text-fg-3">{formatDate(r.last)}</span> },
    ...(monthCols
      ? [...sel].sort().map((m): Column<MRow> => ({
          id: `m-${m}`, header: shortMonth(m), align: "right", sum: true,
          value: (r) => counted(r, r.byMonth[m] ?? 0),
          render: (r) => (r.byMonth[m] ? <Money value={r.byMonth[m]!} className={cx("text-[12px]", r.off && "text-fg-3 line-through")} /> : <span className="text-fg-3">·</span>),
        }))
      : []),
    {
      id: "total", header: "Total", value: (r) => counted(r, r.total), sum: true, align: "right",
      render: (r) => <Money value={r.total} className={cx("font-medium", r.off && "text-fg-3 line-through")} />,
    },
  ];
  return (
    <DataTable
      tableId={tableId}
      rows={rows}
      columns={columns}
      rowKey={(r) => r.merchant}
      initialSort={{ id: "total", desc: true }}
      search={(r) => `${r.merchant} ${categoryLabel(r.category)}`}
      pageSize={25}
      toolbarExtra={
        <Button variant={monthCols ? "primary" : "secondary"} className="h-8" onClick={() => setMonthCols((v) => !v)} title="A column for each selected month">
          Month columns
        </Button>
      }
    />
  );
}

interface TRow {
  t: ScopedTxn;
  /** Unticked on its own. */
  own: boolean;
  /** Left out with its area, category or merchant. */
  other: boolean;
  off: boolean;
  spend: boolean;
}

function TransactionsTable({ txns, ex, accounts, tableId }: { txns: ScopedTxn[]; ex: ReadonlySet<string>; accounts: Account[]; tableId: string }) {
  const toggle = useSpendView((s) => s.toggleExcluded);
  const names = new Map(accounts.map((a) => [a.key, a.name]));
  const rows: TRow[] = txns
    .filter((t) => t.kind === "flow")
    .map((t) => {
      const own = ex.has(`t:${t.id}`);
      const other = isLeftOut(t, ex, `t:${t.id}`);
      return { t, own, other, off: own || other, spend: isSpend(t) };
    });
  const columns: Column<TRow>[] = [
    {
      id: "on", header: "Counted", value: (r) => (!r.spend ? "Money in" : r.off ? "Left out" : "Counted"), facet: true, pinned: true, width: "4.5rem",
      render: (r) =>
        r.spend ? (
          <IncludeBox
            checked={!r.off}
            disabled={r.other && !r.own}
            onChange={() => toggle(`t:${r.t.id}`)}
            title={r.other && !r.own ? "Left out with its area, category or merchant" : r.off ? "Count this transaction again" : "Leave this transaction out of every total"}
          />
        ) : null,
    },
    { id: "date", header: "Date", value: (r) => r.t.date, render: (r) => <span className="whitespace-nowrap text-[12px]">{formatDate(r.t.date)}</span> },
    { id: "month", header: "Month", value: (r) => monthOf(r.t.date), facet: true, facetLabel: formatMonth, hidden: true },
    {
      id: "description", header: "Description", value: (r) => r.t.description, pinned: true,
      render: (r) => <span className={cx("block max-w-80 truncate", r.off && "text-fg-3 line-through")} title={r.t.description}>{r.t.description}</span>,
    },
    { id: "merchant", header: "Merchant", value: (r) => byMerchant(r.t), hidden: true },
    { id: "account", header: "Account", value: (r) => names.get(r.t.accountKey) ?? r.t.accountKey, facet: true },
    { id: "area", header: "Area", value: (r) => parentOf(r.t.category).label, facet: true },
    {
      id: "category", header: "Category", value: (r) => categoryLabel(r.t.category ?? "uncategorised"), facet: true,
      render: (r) => <CategorySelect merchant={byMerchant(r.t)} value={r.t.category} />,
    },
    {
      id: "amount", header: "Amount", align: "right", sum: true, value: (r) => (r.off ? 0 : r.t.amount * r.t.share),
      render: (r) => <Money value={r.t.amount * r.t.share} style="cents" tone={!r.off} className={cx(r.off && "text-fg-3 line-through")} />,
    },
  ];
  return (
    <DataTable
      tableId={tableId}
      rows={rows}
      columns={columns}
      rowKey={(r) => r.t.id}
      initialSort={{ id: "date", desc: true }}
      search={(r) => `${r.t.description} ${categoryLabel(r.t.category ?? "")}`}
      pageSize={50}
      empty="No transactions in the selected months."
    />
  );
}

function ReviewCard({ txns, range }: { txns: ScopedTxn[]; range: [string, string] }) {
  const rows = needsReview(txns, range);
  const total = rows.reduce((s, r) => s + r.total, 0);
  if (!rows.length) return null;
  return (
    <Card title="Needs a category" actions={<span className="text-[12px] text-fg-3"><Money value={total} /> across {rows.length} merchants</span>}>
      <p className="mb-3 text-[12px] text-fg-3">
        These merchants landed in a catch-all (unidentified in-store/online, refunds, other income). Pick a category once and every past and future transaction from that merchant follows it.
      </p>
      <ul className="divide-y divide-line-subtle">
        {rows.slice(0, 30).map((r) => (
          <li key={r.merchant} className="flex flex-wrap items-center gap-3 py-1.5 text-[13px]">
            <span className="min-w-0 flex-1 truncate font-medium" title={r.merchant}>{r.merchant}</span>
            <Badge tone="warn">{categoryLabel(r.category)}</Badge>
            <Money value={r.total} className="w-24 text-right" />
            <CategorySelect merchant={r.merchant} placeholder="Choose a category…" className="w-56 border-line bg-raised" />
          </li>
        ))}
      </ul>
    </Card>
  );
}
