import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Columns3, Filter, Layers, Search, X } from "lucide-react";
import { Money } from "./money";
import { Button, cx } from "./ui";

/**
 * Shared table: search, facet filters (with counts), group-by with collapsible subtotals,
 * sortable columns, column visibility, totals, and "show more". View state (sort, group,
 * filters, hidden columns) is remembered per table in this browser.
 */

export interface Column<T> {
  id: string;
  header: string;
  /** Value used for sorting, filtering, grouping and sums. */
  value: (row: T) => string | number | null;
  render?: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Sum this column (money) in group headers and the totals row. */
  sum?: boolean;
  /** Offer as a filter (distinct values with counts) and as a group-by option. */
  facet?: boolean;
  /** Label shown for a facet/group value. */
  facetLabel?: (value: string) => string;
  hidden?: boolean;
  /** Can't be hidden from the column menu. */
  pinned?: boolean;
  width?: string;
}

interface ViewState {
  sort: { id: string; desc: boolean } | null;
  group: string | null;
  filters: Record<string, string[]>;
  hidden: string[];
}

function useView(tableId: string, initial: ViewState): [ViewState, (v: ViewState) => void] {
  const key = `table-view:${tableId}`;
  const [view, setView] = useState<ViewState>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null") as ViewState | null;
      return saved ? { ...initial, ...saved } : initial;
    } catch {
      return initial;
    }
  });
  const set = (v: ViewState) => {
    setView(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  };
  return [view, set];
}

/** Small click-to-open menu; closes on outside click or Escape. */
function Menu({ label, icon, active, children }: { label: ReactNode; icon: ReactNode; active?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <Button variant={active ? "primary" : "secondary"} onClick={() => setOpen((o) => !o)} aria-expanded={open} className="h-8">
        {icon} {label} <ChevronDown className="size-3.5 opacity-70" aria-hidden />
      </Button>
      {open && (
        <div className="absolute left-0 top-9 z-40 max-h-80 min-w-56 overflow-y-auto rounded-md border border-line bg-overlay p-1.5 shadow-pop">{children}</div>
      )}
    </div>
  );
}

const str = (v: string | number | null) => (v === null || v === "" ? "—" : String(v));

export function DataTable<T>({
  tableId,
  rows,
  columns,
  rowKey,
  initialSort = null,
  initialGroup = null,
  initialFilters = {},
  pageSize = 50,
  search,
  rowClassName,
  empty = "Nothing to show.",
  toolbarExtra,
}: {
  tableId: string;
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  initialSort?: ViewState["sort"];
  initialGroup?: string | null;
  /** Filters applied the first time this table is shown (until the user changes them). */
  initialFilters?: Record<string, string[]>;
  pageSize?: number;
  /** Text to search in; omit to hide the search box. */
  search?: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  empty?: ReactNode;
  toolbarExtra?: ReactNode;
}) {
  const [view, setView] = useView(tableId, {
    sort: initialSort,
    group: initialGroup,
    filters: initialFilters,
    hidden: columns.filter((c) => c.hidden).map((c) => c.id),
  });
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(pageSize);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const byId = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);
  const visible = columns.filter((c) => !view.hidden.includes(c.id) || c.pinned);
  const facets = columns.filter((c) => c.facet);
  const sums = visible.filter((c) => c.sum);
  const label = (c: Column<T>, v: string) => (c.facetLabel ? c.facetLabel(v) : v);

  // Filter → search → sort.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      for (const [id, vals] of Object.entries(view.filters)) {
        const c = byId.get(id);
        if (c && vals.length && !vals.includes(str(c.value(r)))) return false;
      }
      return !q || !search || search(r).toLowerCase().includes(q);
    });
  }, [rows, view.filters, query, search, byId]);

  const sorted = useMemo(() => {
    const c = view.sort && byId.get(view.sort.id);
    if (!c) return filtered;
    const dir = view.sort!.desc ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const x = c.value(a);
      const y = c.value(b);
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [filtered, view.sort, byId]);

  const groupCol = view.group ? byId.get(view.group) : undefined;
  const groups = useMemo(() => {
    if (!groupCol) return null;
    const m = new Map<string, T[]>();
    for (const r of sorted) {
      const k = str(groupCol.value(r));
      (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    // Largest first by the first summed column, else by size.
    const sumCol = sums[0];
    const total = (rs: T[]) => (sumCol ? rs.reduce((s, r) => s + Number(sumCol.value(r) ?? 0), 0) : rs.length);
    return [...m.entries()].sort((a, b) => Math.abs(total(b[1])) - Math.abs(total(a[1])));
  }, [sorted, groupCol, sums]);

  const sumOf = (c: Column<T>, rs: T[]) => rs.reduce((s, r) => s + Number(c.value(r) ?? 0), 0);
  const setFilter = (id: string, vals: string[]) => {
    const filters = { ...view.filters, [id]: vals };
    if (!vals.length) delete filters[id];
    setView({ ...view, filters });
    setLimit(pageSize);
  };
  const activeFilters = Object.entries(view.filters).filter(([, v]) => v.length);

  const headerCell = (c: Column<T>) => {
    const sorted = view.sort?.id === c.id;
    return (
      <th key={c.id} className={cx("whitespace-nowrap px-3 py-2 font-medium first:pl-4 last:pr-4", c.align === "right" && "text-right")} style={{ width: c.width }} aria-sort={sorted ? (view.sort!.desc ? "descending" : "ascending") : undefined}>
        <button
          className={cx("inline-flex items-center gap-1 uppercase hover:text-fg", sorted && "text-fg")}
          onClick={() => setView({ ...view, sort: sorted ? (view.sort!.desc ? { id: c.id, desc: false } : null) : { id: c.id, desc: true } })}
        >
          {c.header}
          {sorted && (view.sort!.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
        </button>
      </th>
    );
  };

  const bodyRow = (r: T) => (
    <tr key={rowKey(r)} className={cx("border-t border-line-subtle hover:bg-hover", rowClassName?.(r))}>
      {visible.map((c) => (
        <td key={c.id} className={cx("px-3 py-1.5 first:pl-4 last:pr-4", c.align === "right" && "text-right")}>
          {c.render ? c.render(r) : str(c.value(r))}
        </td>
      ))}
    </tr>
  );

  // Rows to render, respecting the "show more" limit across groups.
  let budget = limit;
  const take = (rs: T[]) => {
    const out = rs.slice(0, Math.max(budget, 0));
    budget -= out.length;
    return out;
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {search && (
          <label className="relative">
            <Search className="pointer-events-none absolute left-2 top-2 size-4 text-fg-3" aria-hidden />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(pageSize);
              }}
              placeholder="Search"
              aria-label="Search"
              className="h-8 w-52 rounded-md border border-line bg-raised pl-8 pr-2 text-[13px] placeholder:text-fg-3"
            />
          </label>
        )}
        {facets.length > 0 && (
          <Menu label="Filter" icon={<Filter className="size-4" aria-hidden />} active={activeFilters.length > 0}>
            {facets.map((c) => {
              const counts = new Map<string, number>();
              for (const r of rows) counts.set(str(c.value(r)), (counts.get(str(c.value(r))) ?? 0) + 1);
              const selected = view.filters[c.id] ?? [];
              return (
                <div key={c.id} className="mb-1.5">
                  <div className="flex items-center justify-between px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-3">
                    {c.header}
                    {selected.length > 0 && (
                      <button className="normal-case text-accent hover:underline" onClick={() => setFilter(c.id, [])}>clear</button>
                    )}
                  </div>
                  {[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => (
                    <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-hover">
                      <input
                        type="checkbox"
                        checked={selected.includes(v)}
                        onChange={() => setFilter(c.id, selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])}
                        className="accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1 truncate">{label(c, v)}</span>
                      <span className="num text-[11px] text-fg-3">{n}</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </Menu>
        )}
        {facets.length > 0 && (
          <Menu label={groupCol ? `Group: ${groupCol.header}` : "Group"} icon={<Layers className="size-4" aria-hidden />} active={!!groupCol}>
            {[{ id: null as string | null, header: "No grouping" }, ...facets].map((c) => (
              <button
                key={c.id ?? "none"}
                className={cx("block w-full rounded px-2 py-1.5 text-left text-[13px] hover:bg-hover", view.group === c.id && "font-semibold text-accent")}
                onClick={() => {
                  setView({ ...view, group: c.id });
                  setCollapsed(new Set());
                }}
              >
                {c.header}
              </button>
            ))}
          </Menu>
        )}
        <Menu label="Columns" icon={<Columns3 className="size-4" aria-hidden />}>
          {columns.filter((c) => !c.pinned).map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-hover">
              <input
                type="checkbox"
                checked={!view.hidden.includes(c.id)}
                onChange={() => setView({ ...view, hidden: view.hidden.includes(c.id) ? view.hidden.filter((x) => x !== c.id) : [...view.hidden, c.id] })}
                className="accent-[var(--accent)]"
              />
              {c.header}
            </label>
          ))}
        </Menu>
        {toolbarExtra}
        <span className="ml-auto text-[12px] text-fg-3">
          {filtered.length === rows.length ? `${rows.length} rows` : `${filtered.length} of ${rows.length} rows`}
        </span>
      </div>

      {activeFilters.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {activeFilters.flatMap(([id, vals]) =>
            vals.map((v) => (
              <button key={`${id}:${v}`} onClick={() => setFilter(id, vals.filter((x) => x !== v))} className="inline-flex items-center gap-1 rounded-full bg-accent-subtle px-2 py-0.5 text-[12px]">
                <span className="text-fg-3">{byId.get(id)?.header}:</span> {label(byId.get(id)!, v)} <X className="size-3" aria-label="Remove filter" />
              </button>
            )),
          )}
          <button className="text-[12px] text-accent hover:underline" onClick={() => setView({ ...view, filters: {} })}>Clear all</button>
        </div>
      )}

      <div className="-mx-4 overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead className="text-left text-[11px] tracking-wide text-fg-3">
            <tr>{visible.map(headerCell)}</tr>
          </thead>
          <tbody>
            {groups
              ? groups.map(([g, rs]) => {
                  if (budget <= 0) return null;
                  const isCollapsed = collapsed.has(g);
                  return (
                    <Fragment key={g}>
                      <tr className="border-t border-line bg-bg-deep/60">
                        <td colSpan={visible.length} className="px-4 py-1.5">
                          <button
                            className="flex w-full items-center gap-2 text-left"
                            onClick={() => setCollapsed((s) => {
                              const n = new Set(s);
                              if (n.has(g)) n.delete(g);
                              else n.add(g);
                              return n;
                            })}
                            aria-expanded={!isCollapsed}
                          >
                            {isCollapsed ? <ChevronRight className="size-4 text-fg-3" /> : <ChevronDown className="size-4 text-fg-3" />}
                            <span className="font-semibold">{label(groupCol!, g)}</span>
                            <span className="text-[12px] text-fg-3">{rs.length}</span>
                            <span className="ml-auto flex gap-4">
                              {sums.map((c) => (
                                <span key={c.id} className="text-[12px]">
                                  {sums.length > 1 && <span className="mr-1 text-fg-3">{c.header}</span>}
                                  <Money value={sumOf(c, rs)} style="cents" className="font-semibold" />
                                </span>
                              ))}
                            </span>
                          </button>
                        </td>
                      </tr>
                      {!isCollapsed && take(rs).map(bodyRow)}
                    </Fragment>
                  );
                })
              : take(sorted).map(bodyRow)}
          </tbody>
          {sums.length > 0 && filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-line font-semibold">
                {visible.map((c, i) => (
                  <td key={c.id} className={cx("px-3 py-2 first:pl-4 last:pr-4", c.align === "right" && "text-right")}>
                    {c.sum ? <Money value={sumOf(c, filtered)} style="cents" /> : i === 0 ? "Total" : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {filtered.length === 0 && <p className="py-4 text-center text-fg-3">{empty}</p>}
      {filtered.length > limit && (
        <div className="mt-3 text-center">
          <Button variant="ghost" onClick={() => setLimit((l) => l + pageSize * 2)}>Show more ({filtered.length - limit} left)</Button>
        </div>
      )}
    </div>
  );
}
