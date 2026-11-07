import { useState } from "react";
import { Money, Pct, Stat, chartColor } from "@/components/money";
import { Card, Segmented, cx } from "@/components/ui";
import { YearLinesChart, type YearLine } from "@/components/YearLinesChart";
import { PARENT_BY_ID } from "@/data/categories";
import { monthOf, type ScopedTxn } from "@/data/cashflow";
import { addMonths, describeMonths, expectedMonth, monthPace, monthsBetween, previousMonths, projectYear, yearEarlier } from "@/data/months";
import { byCategoryId, byParent, categoryLabel, isSpend, spendValue } from "@/data/spending";
import { formatMonth } from "@/lib/format";

// ── Compare the selected months with another period ───────────────────────────

type Against = "prev" | "year" | "avg";

function totalsIn(txns: ScopedTxn[], months: string[], keyOf: (t: ScopedTxn) => string) {
  const set = new Set(months);
  const m = new Map<string, number>();
  for (const t of txns) if (isSpend(t) && set.has(monthOf(t.date))) m.set(keyOf(t), (m.get(keyOf(t)) ?? 0) + spendValue(t));
  return m;
}

/** Selected months against the period before, the same months a year earlier, or a typical stretch. */
export function Compare({ kept, sel, byMonth }: { kept: ScopedTxn[]; sel: string[]; byMonth: Map<string, number> }) {
  const [against, setAgainst] = useState<Against>("prev");
  const [by, setBy] = useState<"area" | "category">("area");
  const keyOf = by === "area" ? byParent : byCategoryId;
  const name = (k: string) => (by === "area" ? (PARENT_BY_ID.get(k)?.label ?? k) : categoryLabel(k));

  const now = totalsIn(kept, sel, keyOf);
  let then: Map<string, number>;
  let thenLabel: string;
  if (against === "avg") {
    // Monthly average over the 12 months before the selection (months with data), scaled to the selection's length.
    const window = monthsBetween(addMonths(sel[0]!, -12), addMonths(sel[0]!, -1)).filter((m) => byMonth.has(m));
    const raw = totalsIn(kept, window, keyOf);
    then = new Map([...raw].map(([k, v]) => [k, window.length ? (v / window.length) * sel.length : 0]));
    thenLabel = window.length ? `typical ${sel.length > 1 ? `${sel.length} months` : "month"} (avg of ${window.length} before)` : "no earlier months";
  } else {
    const other = against === "prev" ? previousMonths(sel) : yearEarlier(sel);
    then = totalsIn(kept, other, keyOf);
    thenLabel = describeMonths(other);
  }
  const keys = [...new Set([...now.keys(), ...then.keys()])].sort((a, b) => (now.get(b) ?? 0) - (now.get(a) ?? 0) || (then.get(b) ?? 0) - (then.get(a) ?? 0));
  const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);
  const maxDelta = Math.max(1, ...keys.map((k) => Math.abs((now.get(k) ?? 0) - (then.get(k) ?? 0))));

  const row = (label: string, a: number, b: number, strong?: boolean) => (
    <tr key={label} className={cx("border-t border-line-subtle", strong && "font-semibold")}>
      <td className="px-4 py-1.5">{label}</td>
      <td className="px-3 py-1.5 text-right text-fg-2"><Money value={a} /></td>
      <td className="px-3 py-1.5 text-right"><Money value={b} /></td>
      <td className={cx("px-3 py-1.5 text-right", b - a > 0.5 ? "text-neg" : b - a < -0.5 ? "text-pos" : "text-fg-3")}>
        <Money value={b - a} signed />
        {a > 0 && <span className="ml-1 text-[11px]">(<Pct value={(b - a) / a} />)</span>}
      </td>
      <td className="w-28 px-4 py-1.5">
        {!strong && (
          <div className="relative h-2">
            <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
            <div
              className="absolute inset-y-0 rounded-sm"
              style={{
                background: b > a ? "var(--neg)" : "var(--pos)",
                width: `${(Math.abs(b - a) / maxDelta) * 50}%`,
                [b > a ? "left" : "right"]: "50%",
              }}
            />
          </div>
        )}
      </td>
    </tr>
  );

  return (
    <Card
      title="Compared with"
      actions={
        <div className="flex flex-wrap gap-2">
          <Segmented<Against>
            label="Compare with"
            value={against}
            onChange={setAgainst}
            options={[
              { value: "prev", label: "Previous", title: "The same number of months just before" },
              { value: "year", label: "Year earlier", title: "The same months last year" },
              { value: "avg", label: "Typical", title: "Average of the 12 months before" },
            ]}
          />
          <Segmented label="Rows" value={by} onChange={setBy} options={[{ value: "area", label: "Areas" }, { value: "category", label: "Categories" }]} />
        </div>
      }
    >
      <p className="mb-3 text-[13px] text-fg-2">
        <span className="font-semibold text-fg">{describeMonths(sel)}</span> vs <span className="font-semibold text-fg">{thenLabel}</span>
      </p>
      {!sel.length ? (
        <p className="text-fg-3">Select at least one month.</p>
      ) : (
        <div className="-mx-4 -mb-4 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="text-left text-[11px] uppercase tracking-wide text-fg-3">
              <tr>
                <th className="px-4 py-2 font-medium">{by === "area" ? "Area" : "Category"}</th>
                <th className="px-3 py-2 text-right font-medium">Then</th>
                <th className="px-3 py-2 text-right font-medium">Now</th>
                <th className="px-3 py-2 text-right font-medium">Change</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {row("Total", sum(then), sum(now), true)}
              {keys.slice(0, by === "area" ? 20 : 25).map((k) => row(name(k), then.get(k) ?? 0, now.get(k) ?? 0))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Year over year, pace and projection ───────────────────────────────────────

/**
 * Each year as a line across Jan–Dec (monthly or running total), with this year projected to
 * December; plus where this month and this year are heading.
 */
export function YearOverYear({ byMonth, today, leftOut }: { byMonth: Map<string, number>; today: string; leftOut: boolean }) {
  const [mode, setMode] = useState<"month" | "running">("month");
  const now = today.slice(0, 7);
  const y = Number(now.slice(0, 4));
  const years = [...new Set([...byMonth.keys()].map((m) => Number(m.slice(0, 4))))].filter((yy) => yy <= y).sort((a, b) => b - a);
  const projection = projectYear(byMonth, y, today);
  const nowIdx = Number(now.slice(5, 7)) - 1;

  const total = (yy: number) => monthsBetween(`${yy}-01`, `${yy}-12`).reduce((s, m) => s + (byMonth.get(m) ?? 0), 0);
  const monthsWithData = (yy: number) => monthsBetween(`${yy}-01`, `${yy}-12`).filter((m) => byMonth.has(m) && m < now).length;
  const running = (vals: (number | null)[]) => {
    let acc = 0;
    let started = false;
    return vals.map((v) => {
      if (v === null && !started) return null;
      started = true;
      acc += v ?? 0;
      return acc;
    });
  };

  const lines: YearLine[] = years.slice(0, 5).map((yy, i) => {
    const vals: (number | null)[] =
      yy === y ? projection.map((p) => p.value) : monthsBetween(`${yy}-01`, `${yy}-12`).map((m) => (byMonth.has(m) ? byMonth.get(m)! : null));
    return {
      key: String(yy),
      label: yy === y ? `${yy} (projected)` : String(yy),
      color: yy === y ? "var(--accent)" : chartColor(i + 1),
      values: mode === "running" ? running(vals) : vals,
      projectedFrom: yy === y ? nowIdx : undefined,
    };
  });

  const soFar = byMonth.get(now) ?? 0;
  const expectedNow = expectedMonth(byMonth, now, now);
  const pace = monthPace(soFar, expectedNow, today);
  const ytd = monthsBetween(`${y}-01`, now).reduce((s, m) => s + (byMonth.get(m) ?? 0), 0);
  const projectedYear = projection.reduce((s, p) => s + p.value, 0);
  const lastYear = total(y - 1);
  const next = [1, 2, 3].map((n) => addMonths(now, n)).map((m) => ({ m, v: expectedMonth(byMonth, m, now) }));

  return (
    <Card
      title="Year over year"
      actions={<Segmented label="Show" value={mode} onChange={setMode} options={[{ value: "month", label: "Each month" }, { value: "running", label: "Running total" }]} />}
    >
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={`${formatMonth(now)} so far`}
          value={<Money value={soFar} />}
          sub={<>on pace for <Money value={pace} className="font-medium" /> · typical <Money value={expectedNow} /></>}
          hint="So far this month, plus the typical amount for the days left"
        />
        <Stat label={`${y} so far`} value={<Money value={ytd} />} sub={<>projected <Money value={projectedYear} className="font-medium" /> for the year</>} />
        <Stat
          label={`${y} vs ${y - 1}`}
          value={lastYear > 0 ? <Pct value={(projectedYear - lastYear) / lastYear} className={projectedYear > lastYear ? "text-neg" : "text-pos"} /> : "—"}
          sub={lastYear > 0 ? <>{y - 1} was <Money value={lastYear} /></> : "no data for last year"}
        />
        <Stat
          label="Next months (expected)"
          value={<Money value={next[0]!.v} />}
          sub={next.map((n, i) => <span key={n.m}>{i > 0 && " · "}{formatMonth(n.m).split(" ")[0]} <Money value={n.v} /></span>)}
          hint="Average of the last 6 complete months, blended with the same month last year"
        />
      </div>
      <YearLinesChart lines={lines} />
      <p className="mt-2 text-[11px] text-fg-3">
        Projection: the average of the last 6 complete months, blended with the same month a year earlier (catches December, renewals and trips).
        {leftOut && " Left-out items aren't counted."}
      </p>
      <div className="-mx-4 -mb-4 mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead className="text-left text-[11px] uppercase tracking-wide text-fg-3">
            <tr>
              <th className="px-4 py-2 font-medium">Year</th>
              <th className="px-3 py-2 text-right font-medium">Spent</th>
              <th className="px-3 py-2 text-right font-medium">Months</th>
              <th className="px-3 py-2 text-right font-medium">Per month</th>
              <th className="px-4 py-2 text-right font-medium">vs year before (per month)</th>
            </tr>
          </thead>
          <tbody>
            {years.map((yy) => {
              const n = yy === y ? monthsWithData(yy) : monthsWithData(yy) || 1;
              const t = yy === y ? monthsBetween(`${yy}-01`, addMonths(now, -1)).reduce((s, m) => s + (byMonth.get(m) ?? 0), 0) : total(yy);
              const per = n ? t / n : 0;
              const pn = monthsWithData(yy - 1);
              const prevPer = pn ? total(yy - 1) / pn : 0;
              return (
                <tr key={yy} className="border-t border-line-subtle">
                  <td className="px-4 py-1.5 font-medium">{yy}{yy === y && <span className="ml-1 text-[11px] font-normal text-fg-3">complete months</span>}</td>
                  <td className="px-3 py-1.5 text-right"><Money value={t} /></td>
                  <td className="px-3 py-1.5 text-right text-fg-2">{n}</td>
                  <td className="px-3 py-1.5 text-right font-medium"><Money value={per} /></td>
                  <td className={cx("px-4 py-1.5 text-right", per > prevPer ? "text-neg" : "text-pos")}>
                    {prevPer > 0 && per > 0 ? <Pct value={(per - prevPer) / prevPer} /> : <span className="text-fg-3">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
