import { useState } from "react";
import { formatDate, formatMoney } from "@/lib/format";
import { useUi } from "@/lib/ui-store";

/**
 * Time-scaled line with area fill (hand-rolled SVG). Points flagged `estimated` are drawn dashed.
 * Hover shows the nearest point and any extra rows supplied per point.
 */
export interface LinePoint {
  date: string;
  value: number;
  estimated?: boolean;
  extra?: { label: string; value: number }[];
}

const W = 1000;
const H = 260;
const PAD = { l: 8, r: 8, t: 12, b: 24 };

export function LineChart({ points, color = "var(--accent)" }: { points: LinePoint[]; color?: string }) {
  const privacy = useUi((s) => s.privacy);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <p className="py-10 text-center text-fg-3">Not enough history yet. Check back after a few days of syncs.</p>;

  const t = points.map((p) => Date.parse(`${p.date}T00:00:00Z`));
  const t0 = t[0]!;
  const t1 = t.at(-1)!;
  const vals = points.map((p) => p.value);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(...vals) * 1.05 || 1;
  const x = (ms: number) => PAD.l + ((ms - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);

  const path = (from: number, to: number) => points.slice(from, to + 1).map((p, i) => `${i ? "L" : "M"}${x(t[from + i]!).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const lastEst = points.findLastIndex((p) => p.estimated);
  const estPath = lastEst >= 0 ? path(0, Math.min(lastEst + 1, points.length - 1)) : "";
  const actualPath = path(Math.max(lastEst + 1, 0), points.length - 1);
  const area = `${path(0, points.length - 1)}L${x(t1)},${y(lo)}L${x(t0)},${y(lo)}Z`;

  // Year ticks (or quarter ticks for short ranges).
  const ticks: { ms: number; label: string }[] = [];
  const startY = new Date(t0).getUTCFullYear();
  const short = t1 - t0 < 400 * 86_400_000;
  for (let yr = startY; yr <= new Date(t1).getUTCFullYear(); yr++)
    for (const m of short ? [0, 3, 6, 9] : [0]) {
      const ms = Date.UTC(yr, m, 1);
      if (ms > t0 && ms < t1) ticks.push({ ms, label: m === 0 ? String(yr) : new Date(ms).toLocaleString("en-CA", { month: "short", timeZone: "UTC" }) });
    }

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const ms = t0 + (((e.clientX - r.left) / r.width) * W - PAD.l) / (W - PAD.l - PAD.r) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < t.length; i++) if (Math.abs(t[i]! - ms) < Math.abs(t[best]! - ms)) best = i;
    setHover(best);
  }

  const hp = hover !== null ? points[hover]! : null;
  const fmt = (v: number) => (privacy ? "•••••" : formatMoney(v));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Net worth over time">
        <defs>
          <linearGradient id="lc-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.22" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.5, 1].map((f) => {
          const v = lo + (hi - lo) * f;
          return (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border-subtle)" strokeDasharray="3 4" />
              {!privacy && <text x={PAD.l + 2} y={y(v) - 4} fontSize={11} fill="var(--text-3)">{formatMoney(v, "compact")}</text>}
            </g>
          );
        })}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(Math.max(lo, 0))} y2={y(Math.max(lo, 0))} stroke="var(--border)" />
        {ticks.map((tk) => (
          <g key={tk.ms}>
            <line x1={x(tk.ms)} x2={x(tk.ms)} y1={PAD.t} y2={H - PAD.b} stroke="var(--border-subtle)" strokeDasharray="3 4" />
            <text x={x(tk.ms)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--text-3)">{tk.label}</text>
          </g>
        ))}
        <path d={area} fill="url(#lc-fill)" />
        {estPath && <path d={estPath} fill="none" stroke={color} strokeWidth={2} strokeDasharray="5 5" opacity={0.7} />}
        <path d={actualPath} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" />
        {hp && (
          <>
            <line x1={x(t[hover!]!)} x2={x(t[hover!]!)} y1={PAD.t} y2={H - PAD.b} stroke="var(--border-strong)" />
            <circle cx={x(t[hover!]!)} cy={y(hp.value)} r={4.5} fill={color} stroke="var(--surface-panel)" strokeWidth={2} />
          </>
        )}
      </svg>
      {hp && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-md border border-line bg-overlay px-3 py-2 text-[12px] shadow-pop"
          style={{ left: `min(calc(${(x(t[hover!]!) / W) * 100}% + 12px), calc(100% - 200px))` }}
        >
          <div className="mb-1 font-semibold">
            {formatDate(hp.date)} {hp.estimated && <span className="font-normal text-warn">· estimate</span>}
          </div>
          <div className="flex justify-between gap-4"><span className="text-fg-2">Net worth</span><span className="num font-semibold">{fmt(hp.value)}</span></div>
          {hp.extra?.map((r) => (
            <div key={r.label} className="flex justify-between gap-4"><span className="text-fg-2">{r.label}</span><span className="num">{fmt(r.value)}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
