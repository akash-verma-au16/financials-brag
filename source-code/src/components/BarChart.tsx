import { useState } from "react";
import { formatMoney, formatMonth } from "@/lib/format";
import { useUi } from "@/lib/ui-store";

/**
 * Grouped vertical bars per month (hand-rolled SVG: light, theme-aware via CSS variables).
 * Each series is a positive value; hover shows exact amounts.
 */
export interface Series {
  key: string;
  label: string;
  color: string;
  values: number[];
}

/** "Oct", or "Jan '26" at year starts and the first bar. */
function axisLabel(yyyyMm: string, first: boolean) {
  const [mon, yr] = formatMonth(yyyyMm).split(" ");
  return first || yyyyMm.endsWith("-01") ? `${mon} '${yr?.slice(-2)}` : mon;
}

export function BarChart({ labels, series, height = 220 }: { labels: string[]; series: Series[]; height?: number }) {
  const privacy = useUi((s) => s.privacy);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...series.flatMap((s) => s.values.map((v) => Math.max(v, 0))));
  const W = 1000;
  const H = height;
  const padB = 22;
  const padT = 8;
  const groupW = W / Math.max(labels.length, 1);
  const barW = Math.min(22, (groupW * 0.7) / series.length);
  const plotH = H - padB - padT;
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const every = Math.ceil(labels.length / 12);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${series.map((s) => s.label).join(" and ")} by month`}>
        {ticks.map((t) => {
          const y = padT + plotH - (t / max) * plotH;
          return <line key={t} x1={0} x2={W} y1={y} y2={y} stroke="var(--border-subtle)" strokeDasharray={t ? "3 4" : undefined} />;
        })}
        {labels.map((l, i) => {
          const gx = i * groupW + (groupW - barW * series.length) / 2;
          return (
            <g key={l} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * groupW} y={0} width={groupW} height={H} fill={hover === i ? "var(--surface-hover)" : "transparent"} />
              {series.map((s, j) => {
                const v = Math.max(s.values[i] ?? 0, 0);
                const h = (v / max) * plotH;
                return <rect key={s.key} x={gx + j * barW} y={padT + plotH - h} width={barW - 2} height={h} rx={2} fill={s.color} />;
              })}
              {i % every === 0 && (
                <text x={i * groupW + groupW / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--text-3)">
                  {axisLabel(l, i === 0)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-md border border-line bg-overlay px-3 py-2 text-[12px] shadow-pop"
          style={{ left: `min(calc(${((hover + 0.5) / labels.length) * 100}% + 12px), calc(100% - 180px))` }}
        >
          <div className="mb-1 font-semibold">{formatMonth(labels[hover]!)}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-fg-2">
                <span className="size-2 rounded-sm" style={{ background: s.color }} /> {s.label}
              </span>
              <span className="num">{privacy ? "•••••" : formatMoney(s.values[hover] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex gap-4 text-[12px] text-fg-2">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden /> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
