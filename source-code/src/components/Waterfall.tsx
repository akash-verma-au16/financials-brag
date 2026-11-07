import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { useUi } from "@/lib/ui-store";

/**
 * Waterfall: a starting total, the steps that moved it, and the end total. Steps float from the
 * running total; totals stand on zero.
 */
export interface Step {
  key: string;
  label: string;
  value: number;
  /** A total column (drawn from zero) rather than a change. */
  total?: boolean;
  hint?: string;
}

export function Waterfall({ steps, height = 260 }: { steps: Step[]; height?: number }) {
  const privacy = useUi((s) => s.privacy);
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = height;
  const padT = 22;
  const padB = 40;
  let run = 0;
  const bars = steps.map((s) => {
    const from = s.total ? null : run;
    const to = s.total ? s.value : run + s.value;
    run = to;
    return { ...s, from: from ?? 0, to, isTotal: !!s.total };
  });
  // Zoom to where the changes happen: totals stand on the bottom edge rather than zero, so
  // small steps next to a large total stay visible.
  const levels = bars.flatMap((b) => (b.total ? [b.to] : [b.from, b.to]));
  const spread = Math.max(...levels) - Math.min(...levels) || Math.abs(levels[0] ?? 1) || 1;
  const zoomed = Math.min(...levels) > 0 && Math.min(...levels) - spread * 1.5 > 0;
  const lo = zoomed ? Math.min(...levels) - spread * 1.5 : Math.min(0, ...levels);
  const hi = Math.max(1, ...levels) + spread * 0.08;
  const y = (v: number) => padT + ((hi - v) / (hi - lo || 1)) * (H - padT - padB);
  const colW = W / bars.length;
  const barW = Math.min(90, colW * 0.6);
  const fmt = (v: number, signed = false) => (privacy ? "•••••" : `${signed && v > 0 ? "+" : ""}${formatMoney(v, "compact")}`);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="What changed">
        <line x1={0} x2={W} y1={y(Math.max(lo, 0))} y2={y(Math.max(lo, 0))} stroke="var(--border)" />
        {zoomed && (
          <text x={W - 4} y={12} textAnchor="end" fontSize={11} fill="var(--text-3)">
            axis starts above zero
          </text>
        )}
        {bars.map((b, i) => {
          const x = i * colW + (colW - barW) / 2;
          const base = b.isTotal ? (zoomed ? lo : 0) : b.from;
          const color = b.total ? "var(--accent)" : b.value >= 0 ? "var(--pos)" : "var(--neg)";
          return (
            <g key={b.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * colW} y={0} width={colW} height={H} fill={hover === i ? "var(--surface-hover)" : "transparent"} />
              <rect x={x} width={barW} y={y(Math.max(base, b.to))} height={Math.max(Math.abs(y(base) - y(b.to)), 1)} rx={2} fill={color} opacity={b.total ? 0.85 : 1} />
              {i < bars.length - 1 && (
                <line x1={x + barW} x2={(i + 1) * colW + (colW - barW) / 2} y1={y(b.to)} y2={y(b.to)} stroke="var(--border-strong)" strokeDasharray="2 3" />
              )}
              <text x={i * colW + colW / 2} y={y(Math.max(base, b.to)) - 6} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--text-1)">
                {fmt(b.total ? b.to : b.value, !b.total)}
              </text>
              <text x={i * colW + colW / 2} y={H - 22} textAnchor="middle" fontSize={12} fill="var(--text-2)">
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && bars[hover]!.hint && (
        <div
          className="pointer-events-none absolute top-0 z-10 max-w-64 rounded-md border border-line bg-overlay px-3 py-2 text-[12px] shadow-pop"
          style={{ left: `min(calc(${((hover + 0.5) / bars.length) * 100}% + 12px), calc(100% - 260px))` }}
        >
          <div className="font-semibold">{bars[hover]!.label}</div>
          <div className="text-fg-2">{bars[hover]!.hint}</div>
        </div>
      )}
    </div>
  );
}
