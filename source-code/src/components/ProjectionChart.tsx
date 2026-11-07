import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { useUi } from "@/lib/ui-store";

/**
 * Year-by-year projection: one line per group (expected case), a bold total line, and a shaded
 * low–high band around the total. Hover shows every line for that year.
 */

export interface ProjLine {
  key: string;
  label: string;
  values: number[];
  color: string;
}

const W = 1000;
const H = 300;
const PAD = { l: 8, r: 8, t: 12, b: 24 };

export function ProjectionChart({
  startYear,
  lines,
  total,
  band,
  ageAt,
}: {
  startYear: number;
  lines: ProjLine[];
  total?: ProjLine;
  band?: { low: number[]; high: number[] };
  ageAt?: (yearIndex: number) => number | null;
}) {
  const privacy = useUi((s) => s.privacy);
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(...lines.map((l) => l.values.length), total?.values.length ?? 0);
  if (n < 2) return null;
  const all = [...lines.flatMap((l) => l.values), ...(total?.values ?? []), ...(band?.high ?? [])];
  const hi = Math.max(1, ...all) * 1.04;
  const x = (i: number) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / hi) * (H - PAD.t - PAD.b);
  const path = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const step = n > 30 ? 10 : 5;
  const fmt = (v: number) => (privacy ? "•••••" : formatMoney(v));

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Projected value by year"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((((e.clientX - r.left) / r.width) * W - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1));
          setHover(Math.min(Math.max(i, 0), n - 1));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(hi * f)} y2={y(hi * f)} stroke="var(--border-subtle)" strokeDasharray="3 4" />
            {!privacy && <text x={PAD.l + 2} y={y(hi * f) - 4} fontSize={11} fill="var(--text-3)">{formatMoney(hi * f, "compact")}</text>}
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--border)" />
        {Array.from({ length: n }, (_, i) => i).filter((i) => i % step === 0).map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i >= n - 2 ? "end" : "middle"} fontSize={11} fill="var(--text-3)">
            {startYear + i}
            {ageAt?.(i) != null ? ` · ${ageAt(i)}` : ""}
          </text>
        ))}
        {band && (
          <path
            d={`${path(band.high)}L${[...band.low.keys()].reverse().map((i) => `${x(i)},${y(band.low[i]!)}`).join("L")}Z`}
            fill={total?.color ?? "var(--accent)"}
            opacity={0.12}
          />
        )}
        {lines.map((l) => (
          <path key={l.key} d={path(l.values)} fill="none" stroke={l.color} strokeWidth={2} strokeLinejoin="round" />
        ))}
        {total && <path d={path(total.values)} fill="none" stroke={total.color} strokeWidth={3} strokeLinejoin="round" />}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--border-strong)" />}
        {hover !== null &&
          [...lines, ...(total ? [total] : [])].map((l) => (
            <circle key={l.key} cx={x(hover)} cy={y(l.values[hover] ?? 0)} r={3.5} fill={l.color} stroke="var(--surface-panel)" strokeWidth={1.5} />
          ))}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-56 rounded-md border border-line bg-overlay px-3 py-2 text-[12px] shadow-pop"
          style={{ left: `min(calc(${(x(hover) / W) * 100}% + 12px), calc(100% - 240px))` }}
        >
          <div className="mb-1 font-semibold">
            {startYear + hover}
            {ageAt?.(hover) != null && <span className="font-normal text-fg-3"> · age {ageAt(hover)}</span>}
            <span className="font-normal text-fg-3"> · in {hover} yr</span>
          </div>
          {lines.map((l) => (
            <div key={l.key} className="flex justify-between gap-4">
              <span className="flex items-center gap-1.5 text-fg-2"><span className="size-2 rounded-sm" style={{ background: l.color }} />{l.label}</span>
              <span className="num">{fmt(l.values[hover] ?? 0)}</span>
            </div>
          ))}
          {total && (
            <div className="mt-1 flex justify-between gap-4 border-t border-line-subtle pt-1 font-semibold">
              <span>{total.label}</span>
              <span className="num">{fmt(total.values[hover] ?? 0)}</span>
            </div>
          )}
          {band && (
            <div className="flex justify-between gap-4 text-fg-3">
              <span>Range (low – high)</span>
              <span className="num">{fmt(band.low[hover] ?? 0)} – {fmt(band.high[hover] ?? 0)}</span>
            </div>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-2">
        {lines.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5"><span className="h-0.5 w-3" style={{ background: l.color }} />{l.label}</span>
        ))}
        {total && <span className="flex items-center gap-1.5 font-medium"><span className="h-1 w-3" style={{ background: total.color }} />{total.label}</span>}
        {band && <span className="flex items-center gap-1.5"><span className="h-2.5 w-3 opacity-20" style={{ background: total?.color ?? "var(--accent)" }} />Low–high range</span>}
      </div>
    </div>
  );
}
