import { useState } from "react";
import { formatMoney, formatPct } from "@/lib/format";
import { useUi } from "@/lib/ui-store";

/**
 * Squarified treemap (positive values only): each box's area is its share of the whole.
 * Boxes are grouped by `group` (one colour per group). Click calls onPick with the item key.
 */
export interface TreeItem {
  key: string;
  label: string;
  value: number;
  group: string;
  color: string;
  /** Optional outer box: items with the same cluster are laid out together under its label. */
  cluster?: string;
}

interface Box extends TreeItem {
  x: number;
  y: number;
  w: number;
  h: number;
}

function squarify(items: TreeItem[], x: number, y: number, w: number, h: number): Box[] {
  const out: Box[] = [];
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!total) return out;
  let rest = items.map((i) => ({ ...i, area: (i.value / total) * w * h }));
  while (rest.length) {
    const side = Math.min(w, h);
    let row: typeof rest = [];
    let worst = Infinity;
    for (const it of rest) {
      const next = [...row, it];
      const sum = next.reduce((s, r) => s + r.area, 0);
      const max = Math.max(...next.map((r) => r.area));
      const min = Math.min(...next.map((r) => r.area));
      const ratio = Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
      if (ratio > worst) break;
      worst = ratio;
      row = next;
    }
    const sum = row.reduce((s, r) => s + r.area, 0);
    const thick = sum / side;
    let offset = 0;
    for (const r of row) {
      const len = r.area / thick;
      out.push(w >= h ? { ...r, x, y: y + offset, w: thick, h: len } : { ...r, x: x + offset, y, w: len, h: thick });
      offset += len;
    }
    if (w >= h) {
      x += thick;
      w -= thick;
    } else {
      y += thick;
      h -= thick;
    }
    rest = rest.slice(row.length);
  }
  return out;
}

export function Treemap({ items, height = 320, onPick }: { items: TreeItem[]; height?: number; onPick?: (key: string) => void }) {
  const privacy = useUi((s) => s.privacy);
  const [hover, setHover] = useState<string | null>(null);
  const pos = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = pos.reduce((s, i) => s + i.value, 0);
  const W = 1000;
  const clusters = new Map<string, TreeItem[]>();
  for (const i of pos) clusters.set(i.cluster ?? i.key, [...(clusters.get(i.cluster ?? i.key) ?? []), i]);
  const nested = pos.some((i) => i.cluster);
  const outer = nested
    ? squarify([...clusters].map(([k, items]) => ({ key: k, label: k, value: items.reduce((s, i) => s + i.value, 0), group: "", color: "" })), 0, 0, W, height)
    : [];
  const HEAD = 20;
  const titled = (o: Box) => clusters.get(o.key)!.length > 1 && o.h > HEAD * 2.5 && o.w > 80;
  const boxes = nested
    ? outer.flatMap((o) => {
        const head = titled(o) ? HEAD : 0;
        return squarify(clusters.get(o.key)!, o.x + (head ? 3 : 0), o.y + head, o.w - (head ? 6 : 0), o.h - head - (head ? 3 : 0));
      })
    : squarify(pos, 0, 0, W, height);
  const hv = boxes.find((b) => b.key === hover);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label="Breakdown">
        {outer.map((o) =>
          titled(o) ? (
            <g key={`c-${o.key}`}>
              <rect x={o.x + 1} y={o.y + 1} width={o.w - 2} height={o.h - 2} rx={5} fill="var(--surface-selected)" />
              <text x={o.x + 6} y={o.y + 14} fontSize={12} fontWeight={600} fill="var(--text-2)">
                {o.label} · {formatPct(o.value / total)}
              </text>
            </g>
          ) : null,
        )}
        {boxes.map((b) => (
          <g
            key={b.key}
            onMouseEnter={() => setHover(b.key)}
            onMouseLeave={() => setHover(null)}
            onClick={onPick ? () => onPick(b.key) : undefined}
            className={onPick ? "cursor-pointer" : undefined}
          >
            <rect x={b.x + 1} y={b.y + 1} width={Math.max(b.w - 2, 0)} height={Math.max(b.h - 2, 0)} rx={4} fill={b.color} opacity={hover && hover !== b.key ? 0.55 : 0.9} />
            {b.w > 90 && b.h > 34 && (
              <>
                <text x={b.x + 8} y={b.y + 20} fontSize={13} fontWeight={600} fill="#fff" style={{ pointerEvents: "none" }}>
                  {b.label.length > b.w / 8 ? `${b.label.slice(0, Math.floor(b.w / 8) - 1)}…` : b.label}
                </text>
                {b.h > 52 && (
                  <text x={b.x + 8} y={b.y + 38} fontSize={12} fill="#fff" opacity={0.85} style={{ pointerEvents: "none" }}>
                    {formatPct(b.value / total)}
                  </text>
                )}
              </>
            )}
          </g>
        ))}
      </svg>
      {hv && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-line bg-overlay px-3 py-2 text-[12px] shadow-pop"
          style={{ left: `min(${((hv.x + hv.w / 2) / W) * 100}%, calc(100% - 220px))`, top: `${((hv.y + hv.h / 2) / height) * 100}%` }}
        >
          <div className="font-semibold">{hv.label}</div>
          <div className="text-fg-2">{hv.group}</div>
          <div className="num">
            {privacy ? "•••••" : formatMoney(hv.value)} · {formatPct(hv.value / total)}
          </div>
        </div>
      )}
    </div>
  );
}
