import type { ReactNode } from "react";
import { formatMoney, formatPct, type MoneyStyle } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { cx } from "./ui";

/** A CAD amount. Hidden in privacy mode; optionally coloured by sign. */
export function Money({ value, style = "whole", signed, tone, className }: {
  value: number;
  style?: MoneyStyle;
  /** Prefix + for positive values. */
  signed?: boolean;
  /** Colour by sign. */
  tone?: boolean;
  className?: string;
}) {
  const privacy = useUi((s) => s.privacy);
  const text = privacy ? "•••••" : `${signed && value > 0.5 ? "+" : ""}${formatMoney(value, style)}`;
  return (
    <span className={cx("num", tone && !privacy && (value > 0.5 ? "text-pos" : value < -0.5 ? "text-neg" : ""), className)}>
      {text}
    </span>
  );
}

/** Percentages are shown even in privacy mode: they don't reveal amounts. */
export function Pct({ value, tone, className }: { value: number; tone?: boolean; className?: string }) {
  return (
    <span className={cx("num", tone && (value > 0.0005 ? "text-pos" : value < -0.0005 ? "text-neg" : ""), className)}>
      {formatPct(value)}
    </span>
  );
}

export function Stat({ label, value, sub, hint }: { label: ReactNode; value: ReactNode; sub?: ReactNode; hint?: string }) {
  return (
    <div className="rounded-[10px] border border-line-subtle bg-panel px-4 py-3 shadow-card" title={hint}>
      <div className="text-[12px] font-medium text-fg-3">{label}</div>
      <div className="mt-1 text-[24px] font-semibold leading-8 tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-fg-2">{sub}</div>}
    </div>
  );
}

const CHART_VARS = Array.from({ length: 10 }, (_, i) => `var(--chart-${i + 1})`);
export const chartColor = (i: number) => CHART_VARS[i % CHART_VARS.length]!;

/** Horizontal bars with label, amount and share of total. Negative rows are shown in the negative tone. */
export function BarList({ rows, total }: { rows: { key: string; label: ReactNode; value: number; color?: string }[]; total?: number }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  const sum = total ?? rows.reduce((s, r) => s + Math.max(r.value, 0), 0);
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0">
              <Money value={r.value} />
              {sum > 0 && r.value > 0 && <Pct value={r.value / sum} className="ml-2 inline-block w-12 text-right text-[12px] text-fg-3" />}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-selected">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(Math.abs(r.value) / max) * 100}%`,
                background: r.value < 0 ? "var(--neg)" : (r.color ?? chartColor(i)),
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One stacked bar showing parts of a whole (positive parts only). */
export function StackBar({ parts }: { parts: { key: string; label: string; value: number; color: string }[] }) {
  const pos = parts.filter((p) => p.value > 0);
  const total = pos.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-selected">
        {pos.map((p) => (
          <div key={p.key} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={p.label} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-fg-2">
        {pos.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
            {p.label} <Pct value={p.value / total} className="text-fg-3" />
          </li>
        ))}
      </ul>
    </div>
  );
}
