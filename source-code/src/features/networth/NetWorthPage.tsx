import { useMemo, useState } from "react";
import { DataGate } from "@/components/DataGate";
import { LineChart } from "@/components/LineChart";
import { BarList, Money, Pct, Stat, chartColor } from "@/components/money";
import { StackedBarChart } from "@/components/StackedBarChart";
import { Treemap } from "@/components/Treemap";
import { Waterfall } from "@/components/Waterfall";
import { Card, Notice, Segmented, cx } from "@/components/ui";
import { useAppData } from "@/data/appDataSync";
import { accountTypeLabel, shortInstitution } from "@/data/build";
import { buildHistory, changeOver, type HistoryPoint, type SnapshotRow } from "@/data/history";
import type { Bucket, Dataset } from "@/data/model";
import { allAccounts, BUCKETS, groupSum, netWorth, scopeAccounts, scopeTransactions, shareOf } from "@/data/select";
import { spendByMonth } from "@/data/spending";
import { formatDate } from "@/lib/format";
import { useUi } from "@/lib/ui-store";

export function NetWorthPage() {
  return <DataGate>{(ds) => <NetWorth ds={ds} />}</DataGate>;
}

const NO_SNAPSHOTS: never[] = [];
const WINDOWS: [label: string, days: number][] = [["1 month", 30], ["3 months", 91], ["12 months", 365]];
const BUCKET_COLOR: Record<Bucket, string> = { cash: chartColor(8), investments: chartColor(0), retirement: chartColor(3), debt: "var(--neg)" };
const BUCKET_LABEL = Object.fromEntries(BUCKETS.map((b) => [b.id, b.label])) as Record<Bucket, string>;
const TAX_LABEL = { "tax-free": "Tax-free (TFSA, FHSA)", "tax-deferred": "Tax-deferred (RRSP, pension)", taxable: "Taxable", "n/a": "Cash and debt" } as const;

function NetWorth({ ds }: { ds: Dataset }) {
  const person = useUi((s) => s.person);
  const demo = useUi((s) => s.demo);
  const app = useAppData();
  const snapshots = !demo && app.status === "ready" ? app.snapshots : NO_SNAPSHOTS;
  const points = useMemo(() => buildHistory(ds, snapshots, person), [ds, snapshots, person]);
  const firstActual = points.find((p) => !p.estimated);
  const hasEstimate = points.some((p) => p.estimated);
  const accounts = scopeAccounts(ds, person);
  const nw = netWorth(accounts);

  return (
    <div className="space-y-5">
      <StorageStatus />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net worth" value={<Money value={points.at(-1)?.net ?? 0} />} sub={ds.asOf ? `as of ${formatDate(ds.asOf)}` : undefined} />
        {WINDOWS.map(([label, days]) => {
          const c = changeOver(points, days);
          return (
            <Stat
              key={label}
              label={`Change, ${label}`}
              value={c ? <Money value={c.change} signed tone /> : "—"}
              sub={c ? <>{c.pct !== null && <Pct value={c.pct} tone />} {c.from.estimated && <span className="text-warn">· from estimate</span>}</> : "not enough history"}
            />
          );
        })}
      </div>

      <Ratios ds={ds} points={points} />

      <Card title="Net worth over time">
        <LineChart
          points={points.map((p) => ({
            date: p.date,
            value: p.net,
            estimated: p.estimated,
            extra: [
              { label: "Cash", value: p.byBucket.cash },
              { label: "Investments", value: p.byBucket.investments },
              { label: "Retirement", value: p.byBucket.retirement },
              { label: "Debt", value: p.byBucket.debt },
            ],
          }))}
        />
        {hasEstimate && (
          <p className="mt-3 text-[12px] text-fg-3">
            Dashed line: estimated from transactions before {firstActual ? formatDate(firstActual.date) : "the first snapshot"}. Cash
            and credit balances are exact; investment accounts include deposits and withdrawals but not market gains or losses,
            so the estimate understates past swings.
          </p>
        )}
      </Card>

      <Composition ds={ds} />

      <WhatChanged ds={ds} points={points} snapshots={snapshots} />

      <Monthly points={points} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="By tax treatment">
          <BarList
            rows={groupSum(accounts.filter((a) => a.value > 0), (a) => a.tax, (a) => a.value).map((g, i) => ({ key: g.key, label: TAX_LABEL[g.key as keyof typeof TAX_LABEL], value: g.value, color: chartColor(i) }))}
            total={nw.assets}
          />
        </Card>
        <Card title="By institution">
          <BarList rows={groupSum(accounts, (a) => shortInstitution(a.institution), (a) => a.value).map((g, i) => ({ key: g.key, label: g.key, value: g.value, color: chartColor(i + 4) }))} total={nw.assets} />
        </Card>
      </div>
    </div>
  );
}

// ── Ratios ──────────────────────────────────────────────────────────────────

const MILESTONES = [10_000, 25_000, 50_000, 100_000, 150_000, 200_000, 250_000, 300_000, 400_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000, 10_000_000];

function Ratios({ ds, points }: { ds: Dataset; points: HistoryPoint[] }) {
  const person = useUi((s) => s.person);
  const nw = netWorth(scopeAccounts(ds, person));
  const liquid = nw.byBucket.cash + nw.byBucket.investments + nw.byBucket.debt;
  const spend = useMemo(() => {
    const byMonth = spendByMonth(scopeTransactions(ds, person));
    const thisMonth = (ds.asOf ?? "").slice(0, 7);
    const full = [...byMonth].filter(([m]) => m < thisMonth).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
    return full.length ? full.reduce((s, [, v]) => s + v, 0) / full.length : null;
  }, [ds, person]);
  const year = changeOver(points, 365);
  const half = changeOver(points, 182);
  const pace = year && !year.from.estimated ? year.change / 12 : half ? half.change / 6 : null;
  const next = MILESTONES.find((m) => m > nw.net);
  const months = pace && pace > 0 && next ? Math.ceil((next - nw.net) / pace) : null;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Assets / debt" value={<Money value={nw.assets} />} sub={<>debt <Money value={nw.liabilities} /> · <Pct value={nw.assets ? -nw.liabilities / nw.assets : 0} /> of assets</>} />
      <Stat
        label="Liquid net worth"
        value={<Money value={liquid} />}
        sub={<>without retirement accounts · <Pct value={nw.net ? liquid / nw.net : 0} /></>}
        hint="Cash + investments − debt: what you could reach without retirement-account rules"
      />
      <Stat
        label="Emergency runway"
        value={spend ? `${(nw.byBucket.cash / spend).toFixed(1)} months` : "—"}
        sub={spend ? <>cash ÷ <Money value={spend} /> average monthly spending</> : "no spending history"}
        hint="Cash accounts divided by average monthly spending over the last 12 full months. 3–6 months is the usual guide."
      />
      <Stat
        label="Pace"
        value={pace !== null ? <><Money value={pace} signed tone /> / mo</> : "—"}
        sub={months !== null && next ? <>at this pace <Money value={next} style="compact" /> in {months < 24 ? `${months} months` : `${(months / 12).toFixed(1)} years`}</> : "average monthly change"}
        hint={year && !year.from.estimated ? "Average over the last 12 months" : "Average over the last 6 months"}
      />
    </div>
  );
}

// ── What it's made of ───────────────────────────────────────────────────────

function Composition({ ds }: { ds: Dataset }) {
  const person = useUi((s) => s.person);
  const accounts = scopeAccounts(ds, person);
  const nw = netWorth(accounts);
  const debts = accounts.filter((a) => a.value < 0).sort((a, b) => a.value - b.value);
  return (
    <Card title="What it’s made of" actions={<span className="text-[12px] text-fg-3">box size = share of assets</span>}>
      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <div>
          <Treemap
            items={accounts
              .filter((a) => a.value > 0)
              .map((a) => ({ key: a.key, label: a.name, value: a.value, group: `${BUCKET_LABEL[a.bucket]} · ${accountTypeLabel(a.type)}`, color: BUCKET_COLOR[a.bucket] }))}
          />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-2">
            {BUCKETS.filter((b) => b.id !== "debt").map((b) => (
              <span key={b.id} className="flex items-center gap-1.5" title={b.hint}>
                <span className="size-2.5 rounded-sm" style={{ background: BUCKET_COLOR[b.id] }} /> {b.label}
              </span>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-[13px] font-semibold">Assets <Money value={nw.assets} className="ml-1 font-normal text-fg-2" /></h3>
            <BarList
              rows={BUCKETS.filter((b) => b.id !== "debt").map((b) => ({ key: b.id, label: b.label, value: nw.byBucket[b.id], color: BUCKET_COLOR[b.id] }))}
              total={nw.assets}
            />
          </div>
          <div>
            <h3 className="mb-2 text-[13px] font-semibold">Debt <Money value={nw.liabilities} className="ml-1 font-normal text-fg-2" /></h3>
            {debts.length ? (
              <ul className="space-y-1 text-[13px]">
                {debts.map((a) => (
                  <li key={a.key} className="flex justify-between gap-3">
                    <span className="truncate text-fg-2">{a.name}</span>
                    <Money value={a.value} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-fg-3">No debt.</p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── What changed ────────────────────────────────────────────────────────────

const CHANGE_WINDOWS = [
  { value: "30", label: "1M" },
  { value: "91", label: "3M" },
  { value: "ytd", label: "YTD" },
  { value: "365", label: "12M" },
  { value: "all", label: "All" },
] as const;
type ChangeWindow = (typeof CHANGE_WINDOWS)[number]["value"];

function WhatChanged({ ds, points, snapshots }: { ds: Dataset; points: HistoryPoint[]; snapshots: SnapshotRow[] }) {
  const person = useUi((s) => s.person);
  const [win, setWin] = useState<ChangeWindow>("91");
  const end = points.at(-1);
  if (!end || points.length < 2) return null;

  const days =
    win === "all"
      ? Infinity
      : win === "ytd"
        ? Math.round((Date.parse(`${end.date}T00:00:00Z`) - Date.UTC(Number(end.date.slice(0, 4)), 0, 1)) / 86_400_000)
        : Number(win);
  const c = Number.isFinite(days) ? changeOver(points, days) : { from: points[0]!, change: end.net - points[0]!.net, pct: null };
  const from = c?.from ?? points[0]!;

  const accounts = new Map(allAccounts(ds).map((a) => [a.key, a]));
  let contributions = 0;
  for (const t of scopeTransactions(ds, person)) {
    if (t.date <= from.date || t.date > end.date) continue;
    const a = accounts.get(t.accountKey);
    if (!a || (a.bucket !== "investments" && a.bucket !== "retirement")) continue;
    if (t.kind === "contribution" || t.kind === "withdrawal" || t.kind === "transfer") contributions += t.amount * t.share;
  }
  const d = (b: Bucket) => end.byBucket[b] - from.byBucket[b];
  const invested = d("investments") + d("retirement");
  const market = invested - contributions;

  // Per account: balance on (or before) the start date from saved snapshots.
  const start = new Map<string, number>();
  const ordered = snapshots.filter((s) => s.date <= from.date).sort((a, b) => a.date.localeCompare(b.date) || a.recordedAt.localeCompare(b.recordedAt));
  for (const s of ordered) start.set(s.accountKey, s.balance);
  const rows = scopeAccounts(ds, person)
    .map((a) => {
      const was = start.has(a.key) ? start.get(a.key)! * shareOf(a, person) : null;
      return { a, was, change: was === null ? null : a.value - was };
    })
    .sort((x, y) => Math.abs(y.change ?? 0) - Math.abs(x.change ?? 0));

  return (
    <Card title="What changed" actions={<Segmented label="Period" value={win} onChange={setWin} options={[...CHANGE_WINDOWS]} />}>
      <p className="mb-3 text-[12px] text-fg-3">
        {formatDate(from.date)} → {formatDate(end.date)}
        {from.estimated && <span className="text-warn"> · starts from an estimate, so market growth before the first snapshot shows as zero</span>}
      </p>
      <Waterfall
        steps={[
          { key: "start", label: "Start", value: from.net, total: true },
          { key: "cash", label: "Cash accounts", value: d("cash"), hint: "Change in chequing and savings: what you saved, less what you moved into investments." },
          { key: "contrib", label: "Added to investments", value: contributions, hint: "Deposits, transfers and withdrawals for investment and retirement accounts (incl. employer pension contributions)." },
          { key: "market", label: "Market & income", value: market, hint: "Investment and retirement change not explained by money added: price moves, dividends and interest, less fees." },
          { key: "debt", label: "Debt", value: d("debt"), hint: "Credit cards and loans: positive means debt went down." },
          { key: "end", label: "Now", value: end.net, total: true },
        ]}
      />
      {rows.every((r) => r.was === null) ? (
        <p className="mt-3 text-[12px] text-fg-3">Per-account changes appear once daily balances have been saved for the start of this period.</p>
      ) : (
      <div className="-mx-4 -mb-4 mt-4 overflow-x-auto border-t border-line-subtle">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="text-left text-[11px] uppercase tracking-wide text-fg-3">
            <tr>
              <th className="px-4 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Bucket</th>
              <th className="px-3 py-2 text-right font-medium">Then</th>
              <th className="px-3 py-2 text-right font-medium">Now</th>
              <th className="px-4 py-2 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, was, change }) => (
              <tr key={a.key} className="border-t border-line-subtle">
                <td className="px-4 py-1.5">{a.name}</td>
                <td className="px-3 py-1.5 text-fg-2">{BUCKET_LABEL[a.bucket]}</td>
                <td className="px-3 py-1.5 text-right text-fg-2">{was === null ? "—" : <Money value={was} />}</td>
                <td className="px-3 py-1.5 text-right"><Money value={a.value} /></td>
                <td className={cx("px-4 py-1.5 text-right")}>
                  {change === null ? <span className="text-fg-3" title="No saved balance from that date">—</span> : (
                    <>
                      <Money value={change} signed tone />
                      {was ? <div className="text-[11px]"><Pct value={change / Math.abs(was)} tone /></div> : null}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </Card>
  );
}

// ── Month by month ──────────────────────────────────────────────────────────

function Monthly({ points }: { points: HistoryPoint[] }) {
  const [view, setView] = useState<"composition" | "change">("composition");
  // Last point of each month.
  const byMonth = new Map<string, HistoryPoint>();
  for (const p of points) byMonth.set(p.date.slice(0, 7), p);
  const allMonths = [...byMonth.keys()];
  const shown = Math.min(36, allMonths.length);
  const months = allMonths.slice(-shown);
  const at = months.map((m) => byMonth.get(m)!);
  if (months.length < 2) return null;
  const buckets: Bucket[] = ["cash", "investments", "retirement", "debt"];
  const prev = (i: number) => byMonth.get(allMonths[allMonths.length - shown + i - 1] ?? "") ?? null;

  return (
    <Card
      title="Month by month"
      actions={
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "composition", label: "Composition" },
            { value: "change", label: "Change" },
          ]}
        />
      }
    >
      {view === "composition" ? (
        <StackedBarChart
          labels={months}
          series={buckets.map((b) => ({ key: b, label: BUCKET_LABEL[b], values: at.map((p) => p.byBucket[b]), color: BUCKET_COLOR[b] }))}
          line={{ label: "Net worth", values: at.map((p) => p.net) }}
        />
      ) : (
        <StackedBarChart
          labels={months}
          series={buckets.map((b) => ({
            key: b,
            label: BUCKET_LABEL[b],
            values: at.map((p, i) => {
              const q = prev(i);
              return q ? p.byBucket[b] - q.byBucket[b] : 0;
            }),
            color: BUCKET_COLOR[b],
          }))}
          line={{
            label: "Net change",
            values: at.map((p, i) => {
              const q = prev(i);
              return q ? p.net - q.net : 0;
            }),
          }}
        />
      )}
      <p className="mt-2 text-[12px] text-fg-3">Month-end balances{points.some((p) => p.estimated) ? "; earlier months are estimates" : ""}. Click a legend item to hide it.</p>
    </Card>
  );
}

function StorageStatus() {
  const demo = useUi((s) => s.demo);
  const app = useAppData();
  if (demo) return <Notice tone="info">Demo mode: history is estimated from demo transactions; nothing is saved.</Notice>;
  switch (app.status) {
    case "ready":
      return (
        <p className="text-[12px] text-fg-3">
          Daily balances are saved to <code className="font-mono">data/history.csv</code> on your machine ({new Set(app.snapshots.map((s) => s.date)).size} days so far).
          {app.saveError && <span className="text-neg"> Last save failed: {app.saveError}</span>}
        </p>
      );
    case "loading":
      return <p className="text-[12px] text-fg-3">Loading saved history…</p>;
    case "error":
      return <Notice tone="neg">Couldn’t read the saved history: {app.error}</Notice>;
    default:
      return null;
  }
}
