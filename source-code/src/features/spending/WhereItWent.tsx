import { useState, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { CategorySelect } from "@/components/CategorySelect";
import { Money, Pct, chartColor } from "@/components/money";
import { Card, Segmented, cx } from "@/components/ui";
import { PARENTS, PARENT_BY_ID } from "@/data/categories";
import { monthOf, type ScopedTxn } from "@/data/cashflow";
import { byCategoryId, byMerchant, byParent, categoryLabel, isLeftOut, isSpend, spendValue } from "@/data/spending";
import { formatMonth } from "@/lib/format";
import { useSpendView } from "./selection";

export const PARENT_COLOR = new Map(PARENTS.map((p, i) => [p.id, chartColor(i)]));

interface Row {
  key: string;
  /** Exclusion key ("p:…", "c:…", "m:…"). */
  exKey: string;
  off: boolean;
  total: number;
  byMonth: Map<string, number>;
  /** Most common category (merchant rows). */
  category: string;
}

/**
 * Totals per area / category / merchant. A row's own exclusion (and, inside an area, the area's)
 * is ignored so unticked rows stay visible and can be ticked again.
 */
function rowsBy(txns: ScopedTxn[], ex: ReadonlySet<string>, prefix: "p" | "c" | "m", keyOf: (t: ScopedTxn) => string, ignore: string[] = []): Row[] {
  const m = new Map<string, Row & { cats: Map<string, number> }>();
  for (const t of txns) {
    if (!isSpend(t)) continue;
    const key = keyOf(t);
    const exKey = `${prefix}:${key}`;
    if (isLeftOut(t, ex, exKey, ...ignore)) continue;
    let r = m.get(key);
    if (!r) m.set(key, (r = { key, exKey, off: ex.has(exKey), total: 0, byMonth: new Map(), category: "", cats: new Map() }));
    const v = spendValue(t);
    r.total += v;
    r.byMonth.set(monthOf(t.date), (r.byMonth.get(monthOf(t.date)) ?? 0) + v);
    r.cats.set(byCategoryId(t), (r.cats.get(byCategoryId(t)) ?? 0) + 1);
  }
  return [...m.values()]
    .map(({ cats, ...r }) => ({ ...r, category: [...cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "uncategorised" }))
    .filter((r) => Math.abs(r.total) >= 0.005)
    .sort((a, b) => Number(a.off) - Number(b.off) || b.total - a.total);
}

type View = "totals" | "months";

/**
 * Where the money went in the selected months. Click an area to look inside it; untick any area,
 * category or merchant to leave it out of every total on the page (e.g. a one-off trip).
 * "By month" shows the same rows as a month-by-month grid.
 */
export function WhereItWent({ txns, sel, onOnly }: {
  /** Spending in the selected months (not yet filtered by exclusions). */
  txns: ScopedTxn[];
  sel: string[];
  /** Show just this month. */
  onOnly: (month: string) => void;
}) {
  const excluded = useSpendView((s) => s.excluded);
  const toggle = useSpendView((s) => s.toggleExcluded);
  const ex = new Set(excluded);
  const [parent, setParent] = useState<string | null>(null);
  const [view, setView] = useState<View>("totals");
  const [inner, setInner] = useState<"c" | "m">("c");
  const [allShops, setAllShops] = useState(false);

  const areas = rowsBy(txns, ex, "p", byParent);
  const inArea = parent ? txns.filter((t) => byParent(t) === parent) : [];
  const ignore = parent ? [`p:${parent}`] : [];
  const cats = parent ? rowsBy(inArea, ex, "c", byCategoryId, ignore) : [];
  const shops = parent ? rowsBy(inArea, ex, "m", byMerchant, ignore) : [];
  const areaOff = parent ? ex.has(`p:${parent}`) : false;

  const areaRow = (r: Row): Display => ({ ...r, label: PARENT_BY_ID.get(r.key)?.label ?? r.key, color: PARENT_COLOR.get(r.key), drill: () => setParent(r.key) });
  const catRow = (r: Row, i: number): Display => ({ ...r, label: categoryLabel(r.key), color: chartColor(i) });
  const shopRow = (r: Row): Display => ({
    ...r,
    label: r.key,
    extra: <CategorySelect merchant={r.key} value={r.category} className="h-6 max-w-40 text-[11px]" />,
  });

  const leftHere = excluded.filter((k) => (parent ? inArea.some((t) => k === `c:${byCategoryId(t)}` || k === `m:${byMerchant(t)}`) : k.startsWith("p:")));

  return (
    <Card
      title={
        parent ? (
          <span className="flex items-center gap-2">
            <button className="flex items-center gap-1 hover:text-accent" onClick={() => setParent(null)}>
              <ChevronLeft className="size-4" /> All areas
            </button>
            <span className="text-fg-3">/</span>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" className="size-3.5 accent-accent" checked={!areaOff} onChange={() => toggle(`p:${parent}`)} />
              <span className={cx(areaOff && "line-through opacity-60")}>{PARENT_BY_ID.get(parent)?.label}</span>
            </label>
          </span>
        ) : (
          "Where it went"
        )
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {leftHere.length > 0 && (
            <button className="text-[12px] text-accent hover:underline" onClick={() => leftHere.forEach(toggle)}>
              Tick all again ({leftHere.length})
            </button>
          )}
          {parent && view === "months" && (
            <Segmented label="Rows" value={inner} onChange={setInner} options={[{ value: "c", label: "Categories" }, { value: "m", label: "Merchants" }]} />
          )}
          <Segmented<View> label="View" value={view} onChange={setView} options={[{ value: "totals", label: "Totals" }, { value: "months", label: "By month" }]} />
        </div>
      }
    >
      <p className="mb-3 text-[12px] text-fg-3">
        {parent
          ? areaOff
            ? "This whole area is left out of the totals. Tick it above to count it again."
            : "Untick a category or merchant to leave it out of every total on this page."
          : "Click an area to look inside it. Untick anything to leave it out of every total — e.g. a one-off trip — and see what the rest came to."}
      </p>
      {!txns.some(isSpend) ? (
        <p className="text-fg-3">No spending in the selected months.</p>
      ) : view === "months" ? (
        <MonthGrid
          rows={!parent ? areas.map(areaRow) : inner === "c" ? cats.map(catRow) : shops.map(shopRow)}
          sel={sel}
          toggle={toggle}
          onOnly={onOnly}
          dim={areaOff}
        />
      ) : !parent ? (
        <CheckList rows={areas.map(areaRow)} months={sel.length} toggle={toggle} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-fg-3">Categories</h3>
            <CheckList rows={cats.map(catRow)} months={sel.length} toggle={toggle} dim={areaOff} />
          </div>
          <div>
            <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-fg-3">Merchants</h3>
            <CheckList rows={(allShops ? shops : shops.slice(0, 15)).map(shopRow)} months={sel.length} toggle={toggle} dim={areaOff} base={shops} />
            {shops.length > 15 && (
              <button className="mt-2 text-[12px] text-accent hover:underline" onClick={() => setAllShops((s) => !s)}>
                {allShops ? "Show top 15" : `Show all ${shops.length} merchants`}
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

type Display = Row & { label: ReactNode; color?: string; drill?: () => void; extra?: ReactNode };

function Check({ r, toggle }: { r: Display; toggle: (k: string) => void }) {
  return (
    <input
      type="checkbox"
      checked={!r.off}
      onChange={() => toggle(r.exKey)}
      aria-label={`Count ${typeof r.label === "string" ? r.label : r.key}`}
      title={r.off ? "Left out — tick to count it again" : "Untick to leave this out of every total"}
      className="size-3.5 shrink-0 cursor-pointer accent-accent"
    />
  );
}

function RowLabel({ r }: { r: Display }) {
  return (
    <span className={cx("min-w-0 flex-1 truncate", r.off && "line-through")} title={typeof r.label === "string" ? r.label : r.key}>
      {r.drill ? (
        <button className="hover:text-accent hover:underline" onClick={r.drill}>{r.label}</button>
      ) : (
        r.label
      )}
    </span>
  );
}

function CheckList({ rows, months, toggle, dim, base }: { rows: Display[]; months: number; toggle: (k: string) => void; dim?: boolean; base?: Row[] }) {
  const counted = (base ?? rows).filter((r) => !r.off).reduce((s, r) => s + r.total, 0);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.total)));
  return (
    <ul className={cx("space-y-2.5", dim && "opacity-60")}>
      {rows.map((r, i) => (
        <li key={r.key} className={cx(r.off && "opacity-50")}>
          <div className="mb-1 flex items-center gap-2 text-[13px]">
            <Check r={r} toggle={toggle} />
            <RowLabel r={r} />
            {r.extra}
            {months > 1 && (
              <span className="hidden w-20 text-right text-[11px] text-fg-3 sm:inline">
                <Money value={r.total / months} />/mo
              </span>
            )}
            <Money value={r.total} className="w-20 text-right" />
            <span className="w-12 text-right text-[12px] text-fg-3">{r.off ? "out" : counted > 0 && r.total > 0 ? <Pct value={r.total / counted} /> : ""}</span>
          </div>
          <div className="ml-5.5 h-1.5 overflow-hidden rounded-full bg-selected">
            <div
              className="h-full rounded-full"
              style={{ width: `${(Math.abs(r.total) / max) * 100}%`, background: r.off ? "var(--text-3)" : r.total < 0 ? "var(--neg)" : (r.color ?? chartColor(i)) }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function MonthGrid({ rows, sel, toggle, onOnly, dim }: { rows: Display[]; sel: string[]; toggle: (k: string) => void; onOnly: (m: string) => void; dim?: boolean }) {
  const cols = [...sel].sort();
  const max = Math.max(1, ...rows.filter((r) => !r.off).flatMap((r) => [...r.byMonth.values()]));
  const colTotal = (m: string) => rows.filter((r) => !r.off).reduce((s, r) => s + (r.byMonth.get(m) ?? 0), 0);
  const total = rows.filter((r) => !r.off).reduce((s, r) => s + r.total, 0);
  const shortMonth = (m: string) => {
    const [mon, yr] = formatMonth(m).split(" ");
    return cols.length > 1 && cols[0]!.slice(0, 4) === cols.at(-1)!.slice(0, 4) ? mon : `${mon} '${yr?.slice(-2)}`;
  };
  return (
    <div className={cx("-mx-4 -mb-4 overflow-x-auto", dim && "opacity-60")}>
      <table className="w-full border-collapse text-[12px]" style={{ minWidth: 320 + cols.length * 72 }}>
        <thead className="text-left text-[11px] uppercase tracking-wide text-fg-3">
          <tr>
            <th className="sticky left-0 z-10 bg-panel px-4 py-2 font-medium" />
            {cols.map((m) => (
              <th key={m} className="px-1 py-2 text-right font-medium">
                <button className="rounded px-1 hover:bg-hover hover:text-fg" title={`Show only ${formatMonth(m)}`} onClick={() => onOnly(m)}>
                  {shortMonth(m)}
                </button>
              </th>
            ))}
            {cols.length > 1 && <th className="px-3 py-2 text-right font-medium">Avg / mo</th>}
            <th className="px-4 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={cx("border-t border-line-subtle", r.off && "opacity-45")}>
              <td className="sticky left-0 z-10 max-w-64 bg-panel px-4 py-1.5">
                <span className="flex items-center gap-2">
                  <Check r={r} toggle={toggle} />
                  {r.color && <span className="size-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />}
                  <RowLabel r={r} />
                </span>
              </td>
              {cols.map((m) => {
                const v = r.byMonth.get(m) ?? 0;
                return (
                  <td key={m} className="px-1 py-1 text-right">
                    <div
                      className="rounded px-1.5 py-1"
                      style={{ background: v > 0 && !r.off ? `color-mix(in oklab, var(--accent) ${Math.round(8 + (v / max) * 55)}%, transparent)` : undefined }}
                    >
                      {v ? <Money value={v} style="compact" /> : <span className="text-fg-3">·</span>}
                    </div>
                  </td>
                );
              })}
              {cols.length > 1 && <td className="px-3 py-1.5 text-right text-fg-2"><Money value={r.total / cols.length} /></td>}
              <td className="px-4 py-1.5 text-right font-semibold"><Money value={r.total} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line font-semibold">
            <td className="sticky left-0 z-10 bg-panel px-4 py-2">Counted</td>
            {cols.map((m) => <td key={m} className="px-2.5 py-2 text-right"><Money value={colTotal(m)} style="compact" /></td>)}
            {cols.length > 1 && <td className="px-3 py-2 text-right"><Money value={total / cols.length} /></td>}
            <td className="px-4 py-2 text-right"><Money value={total} /></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

