import { useState } from "react";
import { formatDate } from "@/lib/format";
import { chartColor } from "./money";

/**
 * One or more time series on a shared time axis (hand-rolled SVG, like LineChart). Values are
 * formatted by the caller, so it serves prices, indexes, percentages and drawdowns alike.
 * Hover shows every series at the nearest date.
 */
export interface Series {
  key: string;
  label: string;
  points: { d: string; v: number }[];
  color?: string;
  dashed?: boolean;
}

const W = 1000;
const PAD = { l: 8, r: 8, t: 12, b: 24 };
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);

export function SeriesChart({
  series,
  format,
  height = 260,
  area,
  refLines = [],
  zero,
  label = "Chart",
}: {
  series: Series[];
  format: (v: number) => string;
  height?: number;
  /** Fill under the first series. */
  area?: boolean;
  refLines?: { v: number; label: string; color?: string }[];
  /** Always include zero on the axis. */
  zero?: boolean;
  label?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = series.filter((s) => s.points.length > 1).map((s, i) => ({ ...s, color: s.color ?? chartColor(i) }));
  if (!shown.length) return <p className="py-10 text-center text-fg-3">No data for this range.</p>;

  const H = height;
  const t0 = Math.min(...shown.map((s) => ms(s.points[0]!.d)));
  const t1 = Math.max(...shown.map((s) => ms(s.points.at(-1)!.d)));
  const all = [...shown.flatMap((s) => s.points.map((p) => p.v)), ...refLines.map((r) => r.v), ...(zero ? [0] : [])];
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const padV = (hi - lo) * 0.06 || Math.abs(hi) * 0.05 || 1;
  lo -= padV;
  hi += padV;
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const path = (pts: { d: string; v: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(ms(p.d)).toFixed(1)},${y(p.v).toFixed(1)}`).join("");

  // Hover grid: the dates of the longest series.
  const grid = shown.reduce((a, s) => (s.points.length > a.length ? s.points : a), shown[0]!.points);
  const at = (s: (typeof shown)[number], d: string) => {
    let v: number | null = null;
    for (const p of s.points) {
      if (p.d > d) break;
      v = p.v;
    }
    return v;
  };

  const span = t1 - t0;
  const ticks: { t: number; label: string }[] = [];
  const startYear = new Date(t0).getUTCFullYear();
  for (let yr = startYear; yr <= new Date(t1).getUTCFullYear(); yr++)
    for (let m = 0; m < 12; m += span < 100 * 86_400_000 ? 1 : span < 800 * 86_400_000 ? 3 : 12) {
      const t = Date.UTC(yr, m, 1);
      if (t > t0 && t < t1) ticks.push({ t, label: m === 0 ? String(yr) : new Date(t).toLocaleString("en-CA", { month: "short", timeZone: "UTC" }) });
    }
  const every = Math.ceil(ticks.length / 10);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const t = t0 + ((((e.clientX - r.left) / r.width) * W - PAD.l) / (W - PAD.l - PAD.r)) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < grid.length; i++) if (Math.abs(ms(grid[i]!.d) - t) < Math.abs(ms(grid[best]!.d) - t)) best = i;
    setHover(best);
  }
  const hd = hover !== null ? grid[hover]!.d : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={label}>
        <defs>
          <linearGradient id={`sc-fill-${shown[0]!.key}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={shown[0]!.color} stopOpacity="0.2" />
            <stop offset="1" stopColor={shown[0]!.color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => {
          const v = lo + (hi - lo) * f;
          return (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border-subtle)" strokeDasharray="3 4" />
              <text x={PAD.l + 2} y={y(v) - 4} fontSize={11} fill="var(--text-3)">{format(v)}</text>
            </g>
          );
        })}
        {lo < 0 && hi > 0 && <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--border)" />}
        {ticks.filter((_, i) => i % every === 0).map((tk) => (
          <text key={tk.t} x={x(tk.t)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--text-3)">{tk.label}</text>
        ))}
        {refLines.map((r) => (
          <g key={r.label}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(r.v)} y2={y(r.v)} stroke={r.color ?? "var(--warn)"} strokeDasharray="6 4" />
            <text x={W - PAD.r - 4} y={y(r.v) - 4} textAnchor="end" fontSize={11} fill={r.color ?? "var(--warn)"}>{r.label}</text>
          </g>
        ))}
        {area && (
          <path
            d={`${path(shown[0]!.points)}L${x(ms(shown[0]!.points.at(-1)!.d))},${y(Math.max(lo, Math.min(0, hi)))}L${x(ms(shown[0]!.points[0]!.d))},${y(Math.max(lo, Math.min(0, hi)))}Z`}
            fill={`url(#sc-fill-${shown[0]!.key})`}
          />
        )}
        {shown.map((s, i) => (
          <path key={s.key} d={path(s.points)} fill="none" stroke={s.color} strokeWidth={i === 0 ? 2.25 : 1.75} strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" />
        ))}
        {hd && (
          <>
            <line x1={x(ms(hd))} x2={x(ms(hd))} y1={PAD.t} y2={H - PAD.b} stroke="var(--border-strong)" />
            {shown.map((s) => {
              const v = at(s, hd);
              return v === null ? null : <circle key={s.key} cx={x(ms(hd))} cy={y(v)} r={4} fill={s.color} stroke="var(--surface-panel)" strokeWidth={2} />;
            })}
          </>
        )}
      </svg>
      {hd && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-44 rounded-md border border-line bg-overlay px-3 py-2 text-[12px] shadow-pop"
          style={{ left: `min(calc(${(x(ms(hd)) / W) * 100}% + 12px), calc(100% - 220px))` }}
        >
          <div className="mb-1 font-semibold">{formatDate(hd)}</div>
          {shown.map((s) => {
            const v = at(s, hd);
            return v === null ? null : (
              <div key={s.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-fg-2">
                  <span className="size-2 rounded-sm" style={{ background: s.color }} /> {s.label}
                </span>
                <span className="num">{format(v)}</span>
              </div>
            );
          })}
        </div>
      )}
      {shown.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-2">
          {shown.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-0.5 w-3" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
