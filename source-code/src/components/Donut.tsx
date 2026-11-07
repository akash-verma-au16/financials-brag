import { useState } from "react";
import { Money, Pct } from "./money";

/** Ring chart of parts of a whole (positive parts only) with a legend; hover highlights a part. */
export function Donut({ parts, size = 150 }: { parts: { key: string; label: string; value: number; color: string }[]; size?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const pos = parts.filter((p) => p.value > 0);
  const total = pos.reduce((s, p) => s + p.value, 0);
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const focus = pos.find((p) => p.key === hover);
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Breakdown" className="shrink-0 -rotate-90">
        <circle cx={50} cy={50} r={r} fill="none" stroke="var(--surface-selected)" strokeWidth={12} />
        {total > 0 &&
          pos.map((p) => {
            const len = (p.value / total) * c;
            const el = (
              <circle
                key={p.key}
                cx={50}
                cy={50}
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth={hover === p.key ? 15 : 12}
                strokeDasharray={`${Math.max(len - 0.6, 0)} ${c}`}
                strokeDashoffset={-offset}
                onMouseEnter={() => setHover(p.key)}
                onMouseLeave={() => setHover(null)}
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-[12px]">
        {pos.map((p) => (
          <li
            key={p.key}
            className="flex items-center justify-between gap-3"
            onMouseEnter={() => setHover(p.key)}
            onMouseLeave={() => setHover(null)}
            style={{ opacity: focus && focus.key !== p.key ? 0.5 : 1 }}
          >
            <span className="flex min-w-0 items-center gap-1.5 text-fg-2">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: p.color }} /> <span className="truncate">{p.label}</span>
            </span>
            <span className="shrink-0">
              <Money value={p.value} style="compact" /> <Pct value={p.value / total} className="ml-1 inline-block w-11 text-right text-fg-3" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
