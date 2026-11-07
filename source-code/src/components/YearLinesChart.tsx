import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { useUi } from "@/lib/ui-store";

/**
 * One line per year across Jan–Dec, for year-over-year comparison. The part of a line from
 * `projectedFrom` on is drawn dashed (a projection). Hover shows every year for that month;
 * the legend hides/shows years.
 */
export interface YearLine {
  key: string;
  label: string;
  color: string;
  /** 12 values (Jan–Dec); null = no data. */
  values: (number | null)[];
  /** Index of the first projected month. */
  projectedFrom?: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function YearLinesChart({ lines, height = 240 }: { lines: YearLine[]; height?: number }) {
  const privacy = useUi((s) => s.privacy);
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const shown = lines.filter((l) => !hidden.has(l.key));
  const W = 1000;
  const H = height;
  const pad = { l: 8, r: 8, t: 12, b: 22 };
  const hi = Math.max(1, ...shown.flatMap((l) => l.values.filter((v): v is number => v !== null))) * 1.05;
  const x = (i: number) => pad.l + (i / 11) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / hi) * (H - pad.t - pad.b);
  const fmt = (v: number) => (privacy ? "•••••" : formatMoney(v));

  const path = (vals: (number | null)[], from: number, to: number) => {
    let d = "";
    let pen = false;
    for (let i = from; i <= to; i++) {
      const v = vals[i];
      if (v === null || v === undefined) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Year over year by month"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round((((e.clientX - r.left) / r.width) * W - pad.l) / ((W - pad.l - pad.r) / 11));
          setHover(Math.max(0, Math.min(11, i)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {[hi / 1.05, hi / 2.1].map((v) => (
          <g key={v}>
            <line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="var(--border-subtle)" strokeDasharray="3 4" />
            {!privacy && <text x={2} y={y(v) - 3} fontSize={11} fill="var(--text-3)">{formatMoney(v, "compact")}</text>}
          </g>
        ))}
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--border)" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--border)" />}
        {MONTHS.map((m, i) => (
          <text key={m} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === 11 ? "end" : "middle"} fontSize={11} fill="var(--text-3)">{m}</text>
        ))}
        {shown.map((l) => {
          const p = l.projectedFrom ?? 12;
          return (
            <g key={l.key} fill="none" stroke={l.color} strokeLinejoin="round">
              <path d={path(l.values, 0, Math.min(p, 11))} strokeWidth={2.25} />
              {p < 12 && <path d={path(l.values, Math.max(p - 1, 0), 11)} strokeWidth={2} strokeDasharray="5 5" />}
              {hover !== null && l.values[hover] != null && <circle cx={x(hover)} cy={y(l.values[hover]!)} r={3.5} fill={l.color} />}
            </g>
          );
        })}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-44 rounded-md border border-line bg-overlay px-3 py-2 text-[12px] shadow-pop"
          style={{ left: `min(calc(${(hover / 11) * 100}% + 12px), calc(100% - 200px))` }}
        >
          <div className="mb-1 font-semibold">{MONTHS[hover]}</div>
          {shown.map((l) => {
            const v = l.values[hover];
            return (
              <div key={l.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-fg-2">
                  <span className="size-2 rounded-sm" style={{ background: l.color }} /> {l.label}
                  {l.projectedFrom !== undefined && hover >= l.projectedFrom && <span className="text-fg-3">(projected)</span>}
                </span>
                <span className="num">{v == null ? "—" : fmt(v)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
        {lines.map((l) => {
          const off = hidden.has(l.key);
          return (
            <button
              key={l.key}
              aria-pressed={!off}
              onClick={() => setHidden((h) => {
                const n = new Set(h);
                if (n.has(l.key)) n.delete(l.key);
                else n.add(l.key);
                return n;
              })}
              className={off ? "flex items-center gap-1.5 text-fg-3 line-through" : "flex items-center gap-1.5 text-fg-2 hover:text-fg"}
            >
              <span className="h-0.5 w-3" style={{ background: l.color, opacity: off ? 0.3 : 1 }} /> {l.label}
            </button>
          );
        })}
        {lines.some((l) => l.projectedFrom !== undefined && l.projectedFrom < 12) && <span className="text-fg-3">dashed = projected</span>}
      </div>
    </div>
  );
}
