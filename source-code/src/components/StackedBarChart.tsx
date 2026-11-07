import { useState } from "react";
import { formatMoney, formatMonth } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { chartColor } from "./money";

/**
 * One bar per month made of stacked segments (positive values stack up, negative ones down from
 * zero), with an optional net line. Hover shows every segment for that month, largest first.
 */

export interface StackSeries {
  key: string;
  label: string;
  values: number[];
  color?: string;
}

function axisLabel(yyyyMm: string, first: boolean) {
  const [mon, yr] = formatMonth(yyyyMm).split(" ");
  return first || yyyyMm.endsWith("-01") ? `${mon} '${yr?.slice(-2)}` : mon;
}

export function StackedBarChart({
  labels,
  series,
  line,
  height = 260,
  maxLegend = 12,
  labelOf,
  selected,
  onPick,
}: {
  labels: string[];
  series: StackSeries[];
  /** Optional overlay, e.g. net = sum of all segments. */
  line?: { label: string; values: number[]; color?: string };
  height?: number;
  maxLegend?: number;
  /** Axis/tooltip label for a column; default treats labels as YYYY-MM months. */
  labelOf?: (label: string, index: number) => string;
  /** Columns that are selected; the others are drawn faded. */
  selected?: ReadonlySet<string>;
  /** Makes columns clickable (the event carries Shift/Ctrl/⌘ for multi-select). */
  onPick?: (label: string, e: React.MouseEvent) => void;
}) {
  const privacy = useUi((s) => s.privacy);
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const shown = series.map((s, i) => ({ ...s, color: s.color ?? chartColor(i) })).filter((s) => !hidden.has(s.key));

  const W = 1000;
  const H = height;
  const padT = 10;
  const padB = 22;
  const up = labels.map((_, i) => shown.reduce((s, x) => s + Math.max(x.values[i] ?? 0, 0), 0));
  const down = labels.map((_, i) => shown.reduce((s, x) => s + Math.min(x.values[i] ?? 0, 0), 0));
  const hi = Math.max(1, ...up, ...(line?.values ?? []));
  const lo = Math.min(0, ...down, ...(line?.values ?? []));
  const y = (v: number) => padT + ((hi - v) / (hi - lo)) * (H - padT - padB);
  const groupW = W / Math.max(labels.length, 1);
  const barW = Math.min(36, groupW * 0.62);
  const every = Math.ceil(labels.length / 12);
  const fmt = (v: number) => (privacy ? "•••••" : formatMoney(v));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Stacked monthly chart">
        {[hi, hi / 2, lo < 0 ? lo : null].filter((v): v is number => v !== null && v !== 0).map((v) => (
          <g key={v}>
            <line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="var(--border-subtle)" strokeDasharray="3 4" />
            {!privacy && <text x={2} y={y(v) - 3} fontSize={11} fill="var(--text-3)">{formatMoney(v, "compact")}</text>}
          </g>
        ))}
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--border)" />
        {labels.map((l, i) => {
          const x = i * groupW + (groupW - barW) / 2;
          let pos = 0;
          let neg = 0;
          return (
            <g
              key={l}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={onPick ? (e) => onPick(l, e) : undefined}
              className={onPick ? "cursor-pointer" : undefined}
              opacity={selected && !selected.has(l) ? 0.3 : 1}
            >
              <rect
                x={i * groupW}
                y={0}
                width={groupW}
                height={H}
                fill={hover === i ? "var(--surface-hover)" : selected?.has(l) && selected.size < labels.length ? "var(--accent-subtle)" : "transparent"}
              />
              {shown.map((s) => {
                const v = s.values[i] ?? 0;
                if (!v) return null;
                const from = v > 0 ? pos : neg;
                const to = from + v;
                if (v > 0) pos = to;
                else neg = to;
                return <rect key={s.key} x={x} width={barW} y={y(Math.max(from, to))} height={Math.max(Math.abs(y(from) - y(to)), 0.5)} fill={s.color} />;
              })}
              {i % every === 0 && (
                <text x={i * groupW + groupW / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--text-3)">
                  {labelOf ? labelOf(l, i) : axisLabel(l, i === 0)}
                </text>
              )}
            </g>
          );
        })}
        {line && (
          <polyline
            fill="none"
            stroke={line.color ?? "var(--text-1)"}
            strokeWidth={2}
            strokeLinejoin="round"
            points={line.values.map((v, i) => `${i * groupW + groupW / 2},${y(v)}`).join(" ")}
            pointerEvents="none"
          />
        )}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 max-h-72 min-w-52 overflow-hidden rounded-md border border-line bg-overlay px-3 py-2 text-[12px] shadow-pop"
          style={{ left: `min(calc(${((hover + 0.5) / labels.length) * 100}% + 12px), calc(100% - 230px))` }}
        >
          <div className="mb-1 font-semibold">{labelOf ? labelOf(labels[hover]!, hover) : formatMonth(labels[hover]!)}</div>
          {shown
            .map((s) => ({ s, v: s.values[hover] ?? 0 }))
            .filter((x) => x.v)
            .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
            .slice(0, 12)
            .map(({ s, v }) => (
              <div key={s.key} className="flex items-center justify-between gap-4">
                <span className="flex min-w-0 items-center gap-1.5 text-fg-2">
                  <span className="size-2 shrink-0 rounded-sm" style={{ background: s.color }} /> <span className="truncate">{s.label}</span>
                </span>
                <span className="num">{fmt(v)}</span>
              </div>
            ))}
          {line && (
            <div className="mt-1 flex justify-between gap-4 border-t border-line-subtle pt-1 font-semibold">
              <span>{line.label}</span>
              <span className="num">{fmt(line.values[hover] ?? 0)}</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
        {series.slice(0, maxLegend).map((s, i) => {
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              onClick={() => setHidden((h) => {
                const n = new Set(h);
                if (n.has(s.key)) n.delete(s.key);
                else n.add(s.key);
                return n;
              })}
              className={off ? "flex items-center gap-1.5 text-fg-3 line-through" : "flex items-center gap-1.5 text-fg-2 hover:text-fg"}
              aria-pressed={!off}
              title={off ? "Show" : "Hide"}
            >
              <span className="size-2.5 rounded-sm" style={{ background: s.color ?? chartColor(i), opacity: off ? 0.3 : 1 }} /> {s.label}
            </button>
          );
        })}
        {series.length > maxLegend && <span className="text-fg-3">+{series.length - maxLegend} more</span>}
        {line && (
          <span className="flex items-center gap-1.5 text-fg-2">
            <span className="h-0.5 w-3" style={{ background: line.color ?? "var(--text-1)" }} /> {line.label}
          </span>
        )}
      </div>
    </div>
  );
}
