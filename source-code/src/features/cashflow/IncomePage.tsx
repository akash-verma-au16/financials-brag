import { useMemo, useState } from "react";
import { DataGate } from "@/components/DataGate";
import { DataTable, type Column } from "@/components/DataTable";
import { StackedBarChart } from "@/components/StackedBarChart";
import { Money, Pct, Stat, chartColor } from "@/components/money";
import { Card, Segmented } from "@/components/ui";
import { PERIOD_LABEL, inRange, monthOf, monthlyBy, periodRange, type Period, type ScopedTxn } from "@/data/cashflow";
import { holdings } from "@/data/holdings";
import type { Dataset } from "@/data/model";
import { allAccounts, scopeTransactions } from "@/data/select";
import { daysBetween, formatDate, formatMonth, todayIso } from "@/lib/format";
import { useUi } from "@/lib/ui-store";

/** Dividends, distributions and interest — gross, withholding tax and net, by holding/account/type. */
export function IncomePage() {
  return <DataGate>{(ds) => <Income ds={ds} />}</DataGate>;
}

const TYPE_LABEL: Record<string, string> = { dividend: "Dividends", distribution: "Distributions", interest: "Interest", tax: "Withholding tax" };
type SplitBy = "holding" | "account" | "type";

const holdingOf = (t: ScopedTxn) => t.symbol ?? (t.type === "interest" ? "Cash interest" : "Other");
const value = (t: ScopedTxn) => t.amount * t.share;

function Income({ ds }: { ds: Dataset }) {
  const person = useUi((s) => s.person);
  const [period, setPeriod] = useState<Period>("12m");
  const [split, setSplit] = useState<SplitBy>("holding");
  const all = useMemo(() => scopeTransactions(ds, person).filter((t) => t.kind === "investment-income" || t.kind === "tax"), [ds, person]);
  const range = periodRange(period, todayIso(), ds.transactions.at(-1)?.date ?? todayIso());
  const txns = all.filter((t) => inRange(t, range));
  const names = new Map(allAccounts(ds).map((a) => [a.key, a.name]));

  const gross = txns.filter((t) => t.kind === "investment-income").reduce((s, t) => s + value(t), 0);
  const tax = txns.filter((t) => t.kind === "tax").reduce((s, t) => s + value(t), 0);
  const net = gross + tax;
  const fullMonths = Math.max(1, Math.round(daysBetween(range[0], range[1]) / 30.44) - (range[1].slice(0, 7) === todayIso().slice(0, 7) ? 1 : 0));

  // Trailing-12-month net income vs today's market value → yield.
  const t12: [string, string] = periodRange("12m", todayIso(), "1900-01-01");
  const hs = holdings(ds, person);
  const portfolio = hs.reduce((s, h) => s + h.marketValue, 0);
  const net12 = all.filter((t) => inRange(t, t12)).reduce((s, t) => s + value(t), 0);

  const keyFn = (t: ScopedTxn) => (split === "holding" ? holdingOf(t) : split === "account" ? (names.get(t.accountKey) ?? "Unknown") : t.kind === "tax" ? "tax" : t.type);
  const gross12 = monthlyBy(txns.filter((t) => t.kind === "investment-income"), range, keyFn, value);
  const taxBy = monthlyBy(txns.filter((t) => t.kind === "tax"), range, () => "tax", value);
  const series = [
    ...gross12.series.map((s, i) => ({ key: s.key, label: split === "type" ? (TYPE_LABEL[s.key] ?? s.key) : s.key, values: s.values, color: chartColor(i) })),
    ...taxBy.series.map((s) => ({ key: "tax", label: "Withholding tax", values: s.values, color: "var(--neg)" })),
  ];
  const netLine = gross12.months.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0));

  if (!all.length) return <Card title="Investment income">No dividends, distributions or interest found yet.</Card>;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Segmented label="Period" value={period} onChange={setPeriod} options={(Object.keys(PERIOD_LABEL) as Period[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Gross income" value={<Money value={gross} />} sub={`${txns.filter((t) => t.kind === "investment-income").length} payments`} />
        <Stat label="Withholding tax" value={<Money value={tax} />} sub={gross > 0 ? <><Pct value={-tax / gross} /> of gross</> : undefined} />
        <Stat label="Net income" value={<Money value={net} />} sub="what you kept" />
        <Stat label="Monthly average" value={<Money value={net / fullMonths} />} sub={`net, over ${fullMonths} months`} />
        <Stat
          label="Yield (12 months)"
          value={portfolio > 0 ? <Pct value={net12 / portfolio} /> : "—"}
          sub={<>on <Money value={portfolio} /> invested</>}
          hint="Net income over the last 12 months ÷ today's market value of your holdings"
        />
      </div>

      <Card
        title="Income by month"
        actions={
          <Segmented
            label="Split by"
            value={split}
            onChange={setSplit}
            options={[{ value: "holding", label: "Holding" }, { value: "account", label: "Account" }, { value: "type", label: "Type" }]}
          />
        }
      >
        <StackedBarChart labels={gross12.months} series={series} line={{ label: "Net income", values: netLine }} />
      </Card>

      <Card title="By holding">
        <HoldingSummary txns={txns} hs={hs} all={all} />
      </Card>

      <Card title="All payments">
        <PaymentsTable txns={txns} names={names} />
      </Card>
    </div>
  );
}

interface HoldingRow {
  holding: string;
  payments: number;
  gross: number;
  tax: number;
  net: number;
  lastPaid: string;
  frequency: string;
  yieldPct: number | null;
}

function frequencyOf(dates: string[]): string {
  if (dates.length < 2) return "—";
  const sorted = [...new Set(dates.map((d) => d.slice(0, 7)))].sort();
  if (sorted.length < 2) return "—";
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(`${sorted[i - 1]}-01`, `${sorted[i]}-01`) / 30.44);
  const g = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;
  return g < 1.5 ? "Monthly" : g < 4.5 ? "Quarterly" : g < 8 ? "Semi-annual" : "Annual";
}

function HoldingSummary({ txns, hs, all }: { txns: ScopedTxn[]; hs: ReturnType<typeof holdings>; all: ScopedTxn[] }) {
  const mv = new Map(hs.filter((h) => h.instrument.symbol).map((h) => [h.instrument.symbol!, h.marketValue]));
  const t12 = periodRange("12m", todayIso(), "1900-01-01");
  const rows: HoldingRow[] = [...new Set(txns.map(holdingOf))].map((h) => {
    const mine = txns.filter((t) => holdingOf(t) === h);
    const gross = mine.filter((t) => t.kind === "investment-income").reduce((s, t) => s + value(t), 0);
    const tax = mine.filter((t) => t.kind === "tax").reduce((s, t) => s + value(t), 0);
    const paid = mine.filter((t) => t.kind === "investment-income").map((t) => t.date);
    const net12 = all.filter((t) => holdingOf(t) === h && inRange(t, t12)).reduce((s, t) => s + value(t), 0);
    const m = mv.get(h);
    return {
      holding: h,
      payments: paid.length,
      gross,
      tax,
      net: gross + tax,
      lastPaid: paid.sort().at(-1) ?? "",
      frequency: frequencyOf(all.filter((t) => holdingOf(t) === h && t.kind === "investment-income").map((t) => t.date)),
      yieldPct: m ? net12 / m : null,
    };
  });

  const columns: Column<HoldingRow>[] = [
    { id: "holding", header: "Holding", value: (r) => r.holding, pinned: true, render: (r) => <span className="font-medium">{r.holding}</span> },
    { id: "frequency", header: "Pays", value: (r) => r.frequency, facet: true },
    { id: "payments", header: "Payments", value: (r) => r.payments, align: "right" },
    { id: "lastPaid", header: "Last paid", value: (r) => r.lastPaid, render: (r) => <span className="text-[12px] text-fg-3">{formatDate(r.lastPaid)}</span> },
    { id: "gross", header: "Gross", value: (r) => r.gross, sum: true, align: "right", render: (r) => <Money value={r.gross} style="cents" /> },
    { id: "tax", header: "Tax withheld", value: (r) => r.tax, sum: true, align: "right", render: (r) => (r.tax ? <Money value={r.tax} style="cents" tone /> : "—") },
    { id: "taxRate", header: "Tax rate", value: (r) => (r.gross ? -r.tax / r.gross : null), align: "right", render: (r) => (r.tax && r.gross ? <Pct value={-r.tax / r.gross} /> : "—") },
    { id: "net", header: "Net", value: (r) => r.net, sum: true, align: "right", render: (r) => <Money value={r.net} style="cents" className="font-medium" /> },
    { id: "yield", header: "Yield (12m)", value: (r) => r.yieldPct, align: "right", render: (r) => (r.yieldPct === null ? "—" : <Pct value={r.yieldPct} />) },
  ];
  return <DataTable tableId="income-holdings" rows={rows} columns={columns} rowKey={(r) => r.holding} initialSort={{ id: "net", desc: true }} search={(r) => r.holding} />;
}

function PaymentsTable({ txns, names }: { txns: ScopedTxn[]; names: Map<string, string> }) {
  const columns: Column<ScopedTxn>[] = [
    { id: "date", header: "Date", value: (t) => t.date, render: (t) => <span className="num whitespace-nowrap text-[12px] text-fg-3">{formatDate(t.date)}</span> },
    { id: "holding", header: "Holding", value: holdingOf, facet: true, render: (t) => <span className="font-medium">{holdingOf(t)}</span> },
    { id: "type", header: "Type", value: (t) => t.type, facet: true, facetLabel: (v) => TYPE_LABEL[v] ?? v, render: (t) => TYPE_LABEL[t.type] ?? t.type },
    { id: "account", header: "Account", value: (t) => names.get(t.accountKey) ?? "—", facet: true, render: (t) => <span className="text-[12px] text-fg-2">{names.get(t.accountKey)}</span> },
    { id: "month", header: "Month", value: (t) => monthOf(t.date), facet: true, facetLabel: formatMonth, hidden: true },
    { id: "year", header: "Year", value: (t) => t.date.slice(0, 4), facet: true, hidden: true },
    { id: "description", header: "Description", value: (t) => t.description, hidden: true },
    { id: "amount", header: "Amount", value: value, sum: true, align: "right", render: (t) => <Money value={value(t)} style="cents" tone /> },
  ];
  return (
    <DataTable
      tableId="income-payments"
      rows={txns}
      columns={columns}
      rowKey={(t) => t.id}
      initialSort={{ id: "date", desc: true }}
      search={(t) => `${holdingOf(t)} ${t.description} ${names.get(t.accountKey) ?? ""}`}
    />
  );
}
