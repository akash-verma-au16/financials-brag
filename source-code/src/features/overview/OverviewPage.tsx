import { Link } from "@tanstack/react-router";
import { DataGate } from "@/components/DataGate";
import { BarList, Money, Pct, Stat, StackBar, chartColor } from "@/components/money";
import { Card, Notice } from "@/components/ui";
import { BUCKETS, groupSum, netWorth, scopeAccounts, scopeTransactions } from "@/data/select";
import { monthly, periodRange, totals } from "@/data/cashflow";
import { accountTypeLabel, shortInstitution } from "@/data/build";
import type { Dataset } from "@/data/model";
import { useSettings } from "@/data/settings";
import { formatDate, todayIso } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { Widgets } from "./Widgets";

const BUCKET_COLOR = { cash: chartColor(0), investments: chartColor(2), retirement: chartColor(3), debt: "var(--neg)" } as const;
const TAX_LABEL = { "tax-free": "Tax-free (TFSA, FHSA)", "tax-deferred": "Tax-deferred (RRSP, pensions)", taxable: "Taxable", "n/a": "Debt" } as const;

function CashFlowSummary({ ds, person }: { ds: Dataset; person: string }) {
  if (!ds.transactions.length) return null;
  const range = periodRange("12m", todayIso(), ds.transactions.at(-1)!.date);
  const t = totals(monthly(scopeTransactions(ds, person), range));
  return (
    <Card
      title="Last 12 months"
      actions={
        <Link to="/cashflow" className="text-[13px] font-medium text-accent hover:underline">
          Cash flow →
        </Link>
      }
    >
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ["Income", <Money key="i" value={t.income} />],
          ["Spending", <Money key="s" value={t.spending} />],
          ["Net saved", <Money key="n" value={t.net} signed tone />],
          ["Savings rate", t.savingsRate === null ? "—" : <Pct key="r" value={t.savingsRate} tone />],
          ["Investment income", <Money key="ii" value={t.investmentIncome} />],
        ].map(([label, value]) => (
          <div key={label as string}>
            <dt className="text-[12px] text-fg-3">{label}</dt>
            <dd className="text-[17px] font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function OverviewPage() {
  return <DataGate>{(ds) => <Overview ds={ds} />}</DataGate>;
}

function Overview({ ds }: { ds: Dataset }) {
  const person = useUi((s) => s.person);
  const people = useSettings((s) => s.people);
  const accounts = scopeAccounts(ds, person);
  const nw = netWorth(accounts);
  const assets = accounts.filter((a) => a.value > 0);
  const warnings = ds.issues.filter((i) => i.level === "warn");

  return (
    <div className="space-y-5">
      {warnings.length > 0 && (
        <Notice tone="warn">
          {warnings[0]!.message}
          {warnings.length > 1 && ` (+${warnings.length - 1} more)`}{" "}
          <Link to="/data" className="font-medium underline">
            Data health
          </Link>
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net worth" value={<Money value={nw.net} />} sub={ds.asOf ? `as of ${formatDate(ds.asOf)}` : undefined} />
        <Stat label="Assets" value={<Money value={nw.assets} />} sub={`${assets.length} accounts`} />
        <Stat
          label="Debt"
          value={<Money value={nw.liabilities} />}
          sub={nw.assets > 0 ? <><Pct value={-nw.liabilities / nw.assets} /> of assets</> : undefined}
        />
        <Stat
          label="Cash on hand"
          value={<Money value={nw.byBucket.cash} />}
          sub="chequing, savings, cash"
          hint="Money you can spend today without selling anything"
        />
      </div>

      <Card title="Where your money is">
        <StackBar
          parts={BUCKETS.filter((b) => b.id !== "debt").map((b) => ({
            key: b.id,
            label: b.label,
            value: nw.byBucket[b.id],
            color: BUCKET_COLOR[b.id],
          }))}
        />
        <div className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {BUCKETS.map((b) => (
            <div key={b.id} title={b.hint}>
              <div className="flex items-center gap-1.5 text-[12px] text-fg-3">
                <span className="size-2.5 rounded-sm" style={{ background: BUCKET_COLOR[b.id] }} aria-hidden />
                {b.label}
              </div>
              <Money value={nw.byBucket[b.id]} className="text-[17px] font-semibold" />
            </div>
          ))}
        </div>
      </Card>

      <CashFlowSummary ds={ds} person={person} />

      <Widgets ds={ds} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="By institution">
          <BarList
            rows={groupSum(accounts, (a) => shortInstitution(a.institution), (a) => a.value).map((g) => ({ key: g.key, label: g.key, value: g.value }))}
          />
        </Card>
        <Card title="By tax treatment">
          <BarList
            rows={groupSum(accounts, (a) => a.tax, (a) => a.value).map((g) => ({
              key: g.key,
              label: TAX_LABEL[g.key as keyof typeof TAX_LABEL] ?? g.key,
              value: g.value,
            }))}
          />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Largest accounts"
          actions={
            <Link to="/accounts" className="text-[13px] font-medium text-accent hover:underline">
              All accounts →
            </Link>
          }
        >
          <BarList
            rows={[...accounts]
              .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
              .slice(0, 7)
              .map((a) => ({ key: a.key, label: a.name, value: a.value }))}
            total={nw.assets}
          />
        </Card>
        {person === "all" && people.length > 1 ? (
          <Card title="By person" actions={<span className="text-[12px] text-fg-3">joint accounts split equally</span>}>
            <BarList
              rows={people.map((p) => {
                const mine = scopeAccounts(ds, p.id);
                return { key: p.id, label: p.name, value: mine.reduce((s, a) => s + a.value, 0) };
              })}
            />
          </Card>
        ) : (
          <Card title="By account type">
            <BarList
              rows={groupSum(accounts, (a) => accountTypeLabel(a.type), (a) => a.value).map((g) => ({ key: g.key, label: g.key, value: g.value }))}
            />
          </Card>
        )}
      </div>
    </div>
  );
}
