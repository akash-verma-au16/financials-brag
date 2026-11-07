import { useState } from "react";
import { formatMoney, formatPct } from "@/lib/format";
import { useUi } from "@/lib/ui-store";

/**
 * Two-column flow diagram: what you hold (left) → what that money ends up in (right).
 * Band thickness is value. Small nodes get a minimum height so every label has room to read;
 * their bands keep their true thickness.
 */
export interface FlowNode {
  key: string;
  label: string;
  value: number;
  color: string;
}

const W = 1000;
const NODE_W = 12;
const X0 = 250;
const X1 = W - 250 - NODE_W;
const GAP = 6;
const MIN_H = 22;
const LABEL_CHARS = 32;

function layout(nodes: FlowNode[], k: number) {
  let y = 0;
  return new Map(
    nodes.map((n) => {
      const h = Math.max(n.value * k, MIN_H);
      const p = { y, h, n };
      y += h + GAP;
      return [n.key, p] as const;
    }),
  );
}

export function Sankey({ left, right, links, scaleHeight = 480 }: { left: FlowNode[]; right: FlowNode[]; links: { from: string; to: string; value: number }[]; scaleHeight?: number }) {
  const privacy = useUi((s) => s.privacy);
  const [hover, setHover] = useState<string | null>(null);
  const total = left.reduce((s, n) => s + n.value, 0) || 1;
  const k = scaleHeight / total;
  const L = layout(left, k);
  const R = layout(right, k);
  const bottom = (m: typeof L) => Math.max(0, ...[...m.values()].map((p) => p.y + p.h));
  const height = Math.max(bottom(L), bottom(R));

  const usedL = new Map<string, number>();
  const usedR = new Map<string, number>();
  const order = [...R.keys()];
  const bands = links
    .filter((l) => l.value > 0 && L.has(l.from) && R.has(l.to))
    .sort((a, b) => order.indexOf(a.to) - order.indexOf(b.to))
    .map((l) => {
      const a = L.get(l.from)!;
      const b = R.get(l.to)!;
      const h = l.value * k;
      const y0 = a.y + (usedL.get(l.from) ?? 0);
      const y1 = b.y + (usedR.get(l.to) ?? 0);
      usedL.set(l.from, (usedL.get(l.from) ?? 0) + h);
      usedR.set(l.to, (usedR.get(l.to) ?? 0) + h);
      const xa = X0 + NODE_W;
      const xm = (xa + X1) / 2;
      return { ...l, color: a.n.color, d: `M${xa},${y0}C${xm},${y0} ${xm},${y1} ${X1},${y1}L${X1},${y1 + h}C${xm},${y1 + h} ${xm},${y0 + h} ${xa},${y0 + h}Z` };
    });
  const lit = (from: string, to: string) => !hover || hover === from || hover === to;
  const money = (v: number) => (privacy ? formatPct(v / total) : `${formatMoney(v, "compact")} · ${formatPct(v / total)}`);
  const short = (s: string) => (s.length > LABEL_CHARS ? `${s.slice(0, LABEL_CHARS - 1)}…` : s);

  const nodeEls = (m: typeof L, side: "l" | "r") =>
    [...m.values()].map(({ y, h, n }) => (
      <g key={n.key} onMouseEnter={() => setHover(n.key)} onMouseLeave={() => setHover(null)}>
        <title>{`${n.label}: ${money(n.value)}`}</title>
        <rect x={side === "l" ? X0 : X1} y={y} width={NODE_W} height={h} rx={2} fill={n.color} opacity={!hover || hover === n.key ? 1 : 0.5} />
        <text
          x={side === "l" ? X0 - 8 : X1 + NODE_W + 8}
          y={y + h / 2}
          dy="0.35em"
          textAnchor={side === "l" ? "end" : "start"}
          fontSize={12}
          fill="var(--text-1)"
          fontWeight={hover === n.key ? 600 : 400}
        >
          {short(n.label)}
          <tspan fill="var(--text-3)"> {formatPct(n.value / total)}</tspan>
        </text>
      </g>
    ));

  return (
    <svg viewBox={`-2 -2 ${W + 4} ${height + 4}`} className="h-auto w-full" role="img" aria-label="Where your money goes">
      {bands.map((b, i) => (
        <path key={i} d={b.d} fill={b.color} opacity={lit(b.from, b.to) ? 0.38 : 0.06}>
          <title>{`${L.get(b.from)!.n.label} → ${R.get(b.to)!.n.label}: ${money(b.value)}`}</title>
        </path>
      ))}
      {nodeEls(L, "l")}
      {nodeEls(R, "r")}
    </svg>
  );
}
