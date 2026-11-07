import { ChevronLeft, ChevronRight } from "lucide-react";
import { Money } from "@/components/money";
import { cx } from "@/components/ui";
import { addMonths, describeMonths, lastFullMonths, monthsBetween, shiftMonths } from "@/data/months";
import { todayIso } from "@/lib/format";
import { useSelectedMonths, useSpendView } from "./selection";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Mods = { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };

/**
 * Month selection actions shared by the chart and the grid:
 * plain = only this month, Ctrl/⌘ = add or remove it, Shift = everything from the last click to here.
 */
export function useMonthPicker() {
  const sel = useSelectedMonths();
  const anchor = useSpendView((s) => s.anchor);
  const setMonths = useSpendView((s) => s.setMonths);
  const has = new Set(sel);
  const toggle = (m: string) => setMonths(has.has(m) ? sel.filter((x) => x !== m) : [...sel, m], m);
  return {
    sel,
    set: setMonths,
    toggle,
    only: (m: string) => setMonths([m], m),
    pick(m: string, e: Mods = {}) {
      if (e.shiftKey && anchor) setMonths([...sel, ...monthsBetween(anchor, m)], anchor);
      else if (e.ctrlKey || e.metaKey) toggle(m);
      else setMonths([m], m);
    },
    /** Add a group of months, or remove it if it's all selected already. */
    toggleMany(ms: string[]) {
      const allIn = ms.every((m) => has.has(m));
      setMonths(allIn ? sel.filter((m) => !ms.includes(m)) : [...sel, ...ms], null);
    },
  };
}

/**
 * Year × month grid: every month is its own toggle (click to tick/untick, double-click for just
 * that month). Year and month headers tick whole rows/columns. Cells show that month's total.
 */
export function MonthPicker({ first, totals }: {
  /** Earliest month with data ("YYYY-MM"). */
  first: string;
  /** Spending per month, shown in each cell. */
  totals?: Map<string, number>;
}) {
  const p = useMonthPicker();
  const has = new Set(p.sel);
  const today = todayIso();
  const now = today.slice(0, 7);
  const firstYear = Number(first.slice(0, 4));
  const years = Array.from({ length: Number(now.slice(0, 4)) - firstYear + 1 }, (_, i) => Number(now.slice(0, 4)) - i);
  const valid = (m: string) => m >= first && m <= now;
  const max = Math.max(1, ...[...(totals?.values() ?? [])]);
  const y = Number(now.slice(0, 4));
  const quick: { label: string; months: string[] }[] = [
    { label: "This month", months: [now] },
    { label: "Last month", months: [addMonths(now, -1)] },
    { label: "Last 3", months: lastFullMonths(today, 3) },
    { label: "Last 12", months: lastFullMonths(today, 12) },
    { label: String(y), months: monthsBetween(`${y}-01`, now) },
    { label: String(y - 1), months: monthsBetween(`${y - 1}-01`, `${y - 1}-12`) },
    { label: "All", months: monthsBetween(first, now) },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-md border border-line bg-raised">
          <button className="grid h-8 w-8 place-items-center text-fg-2 hover:text-fg disabled:opacity-30" aria-label="Previous" title="Move the selection back" disabled={!p.sel.length} onClick={() => p.set(shiftMonths(p.sel, -1))}>
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-36 px-1 text-center text-[13px] font-semibold">{describeMonths(p.sel)}</span>
          <button className="grid h-8 w-8 place-items-center text-fg-2 hover:text-fg disabled:opacity-30" aria-label="Next" title="Move the selection forward" disabled={!p.sel.length || p.sel.at(-1)! >= now} onClick={() => p.set(shiftMonths(p.sel, 1))}>
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {quick.map((q) => {
            const on = q.months.length === p.sel.length && q.months.every((m) => has.has(m));
            return (
              <button
                key={q.label}
                onClick={() => p.set(q.months, null)}
                className={cx("h-7 rounded-full border px-2.5 text-[12px]", on ? "border-accent bg-accent-subtle text-fg" : "border-line text-fg-2 hover:text-fg")}
              >
                {q.label}
              </button>
            );
          })}
          {p.sel.length > 0 && (
            <button onClick={() => p.set([], null)} className="h-7 px-2 text-[12px] text-fg-3 hover:text-fg">Clear</button>
          )}
        </div>
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[720px] border-separate border-spacing-1 text-[11px]">
          <thead>
            <tr>
              <th className="w-14" />
              {MONTH_NAMES.map((n, i) => {
                const ms = years.map((yy) => `${yy}-${String(i + 1).padStart(2, "0")}`).filter(valid);
                return (
                  <th key={n} className="font-medium">
                    <button className="w-full rounded px-1 py-0.5 uppercase tracking-wide text-fg-3 hover:bg-hover hover:text-fg" title={`Tick or untick every ${n}`} onClick={() => p.toggleMany(ms)}>
                      {n}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {years.map((yy) => {
              const ms = monthsBetween(`${yy}-01`, `${yy}-12`);
              const yearOn = ms.filter(valid).every((m) => has.has(m));
              return (
                <tr key={yy}>
                  <th>
                    <button
                      className={cx("w-full rounded px-1.5 py-1.5 text-left text-[12px] font-semibold hover:bg-hover", yearOn ? "text-accent" : "text-fg-2")}
                      title={`Tick or untick all of ${yy}`}
                      onClick={() => p.toggleMany(ms.filter(valid))}
                    >
                      {yy}
                    </button>
                  </th>
                  {ms.map((m) => {
                    if (!valid(m)) return <td key={m} className="rounded bg-transparent" />;
                    const on = has.has(m);
                    const v = totals?.get(m) ?? 0;
                    return (
                      <td key={m} className="p-0">
                        <button
                          aria-pressed={on}
                          title="Click to tick or untick · double-click for only this month · Shift-click for a range"
                          onClick={(e) => (e.shiftKey ? p.pick(m, e) : p.toggle(m))}
                          onDoubleClick={() => p.only(m)}
                          className={cx(
                            "relative h-9 w-full overflow-hidden rounded border text-right transition-colors",
                            on ? "border-accent bg-accent-subtle text-fg" : "border-line-subtle text-fg-3 hover:border-line hover:text-fg",
                            m === now && "italic",
                          )}
                        >
                          {totals && v > 0 && (
                            <span className="absolute inset-x-0 bottom-0 bg-accent/25" style={{ height: `${Math.round((v / max) * 100)}%` }} aria-hidden />
                          )}
                          <span className="relative px-1.5">{totals ? (v ? <Money value={v} style="compact" /> : "·") : MONTH_NAMES[Number(m.slice(5)) - 1]}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-fg-3">
        Click months to tick or untick them · double-click a month to see only it · Shift-click for a range · click a year or month name to tick the whole row or column. On the chart, click a bar for that month (Ctrl/⌘-click to add it).
      </p>
    </div>
  );
}
