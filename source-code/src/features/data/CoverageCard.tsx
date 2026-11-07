import { Card } from "@/components/ui";
import { months } from "@/data/cashflow";
import { accountTypeLabel, shortInstitution } from "@/data/build";
import type { Dataset } from "@/data/model";
import { formatDate, formatMonth, todayIso } from "@/lib/format";

/**
 * Which months each account has transactions for, and where they came from (Wealthica sync vs
 * statement files). Gaps show where to add statements.
 */
export function CoverageCard({ ds }: { ds: Dataset }) {
  const today = todayIso();
  const firstAll = ds.transactions.at(-1)?.date ?? today;
  const cols = months([`${firstAll.slice(0, 7)}-01`, today]);
  const rows = ds.accounts
    .filter((a) => a.bucket !== "retirement" || ds.transactions.some((t) => t.accountKey === a.key))
    .map((a) => {
      const mine = ds.transactions.filter((t) => t.accountKey === a.key && t.kind !== "ignore");
      const cell = new Map<string, { w: number; s: number }>();
      for (const t of mine) {
        const m = t.date.slice(0, 7);
        const c = cell.get(m) ?? { w: 0, s: 0 };
        if (t.id.startsWith("s_")) c.s++;
        else c.w++;
        cell.set(m, c);
      }
      const first = mine.at(-1)?.date;
      const last = mine[0]?.date;
      const gaps = first ? cols.filter((m) => m >= first.slice(0, 7) && m <= (last ?? today).slice(0, 7) && !cell.has(m)).length : 0;
      return { a, cell, first, last, gaps, count: mine.length };
    })
    .sort((x, y) => Number(!!y.first) - Number(!!x.first) || (x.first ?? "").localeCompare(y.first ?? ""));

  const colour = (c?: { w: number; s: number }) =>
    !c ? undefined : c.w && c.s ? "var(--chart-4)" : c.s ? "var(--chart-3)" : "var(--accent)";

  return (
    <Card title="Transaction coverage" actions={<span className="text-[12px] text-fg-3">{formatMonth(cols[0]!)} – {formatMonth(cols.at(-1)!)}</span>}>
      <div className="mb-3 flex flex-wrap gap-4 text-[12px] text-fg-2">
        {[["var(--accent)", "Wealthica"], ["var(--chart-3)", "Statements"], ["var(--chart-4)", "Both"]].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: c }} />{l}</span>
        ))}
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-line" />No transactions</span>
      </div>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="border-collapse text-[12px]">
          <tbody>
            {rows.map(({ a, cell, first, last, gaps, count }) => (
              <tr key={a.key}>
                <td className="whitespace-nowrap py-1 pr-4">
                  <div className="font-medium">{a.name}</div>
                  <div className="text-[11px] text-fg-3">{shortInstitution(a.institution)} · {accountTypeLabel(a.type)}</div>
                </td>
                <td className="whitespace-nowrap py-1 pr-4 text-[11px] text-fg-3">
                  {first ? <>{formatDate(first)} – {formatDate(last!)}<br />{count} txns{gaps ? ` · ${gaps} empty month${gaps > 1 ? "s" : ""}` : ""}</> : "no transactions synced"}
                </td>
                <td className="py-1">
                  <div className="flex gap-px">
                    {cols.map((m) => {
                      const c = cell.get(m);
                      return (
                        <span
                          key={m}
                          title={`${formatMonth(m)}: ${c ? `${c.w} from Wealthica, ${c.s} from statements` : "none"}`}
                          className="h-4 w-2.5 rounded-[2px] border border-line-subtle"
                          style={{ background: colour(c) }}
                        />
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
