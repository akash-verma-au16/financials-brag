import { Money, Pct } from "@/components/money";
import { Badge, cx } from "@/components/ui";
import { yearlyCost, type CostLine, type CostStatus } from "@/data/analysis";

/** One holding's costs, line by line, with where each number comes from. */

export const STATUS: Record<CostStatus, { label: string; tone: "pos" | "info" | "warn" | "neutral" | "accent" }> = {
  published: { label: "Published", tone: "pos" },
  entered: { label: "You entered", tone: "accent" },
  estimate: { label: "Estimate", tone: "warn" },
  none: { label: "Doesn't apply", tone: "neutral" },
  "not-published": { label: "Not published", tone: "neutral" },
};

export function CostLines({ lines, value }: { lines: CostLine[]; value: number }) {
  const total = yearlyCost(lines);
  const yearly = lines.filter((l) => l.when === "yearly");
  const oneOff = lines.filter((l) => l.when === "one-off");
  const rows = (list: CostLine[]) =>
    list.map((l) => (
      <tr key={l.key} className="border-t border-line-subtle align-top">
        <td className={cx("py-2 pr-3", l.part && "pl-5 text-fg-2")}>
          <div className={cx(!l.part && "font-medium")}>{l.label}</div>
          <div className="mt-0.5 max-w-xl text-[12px] text-fg-3">{l.note}</div>
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          <Badge tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Badge>
          {l.source && l.status === "published" && <div className="mt-0.5 text-[11px] text-fg-3">{l.source}</div>}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right">{l.rate === null ? "—" : `${(l.rate * 100).toFixed(l.rate < 0.001 && l.rate > 0 ? 3 : 2)}%`}</td>
        <td className="whitespace-nowrap py-2 pl-3 text-right">{l.amount === null ? "—" : <Money value={l.amount} />}</td>
      </tr>
    ));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead className="text-left text-[11px] uppercase tracking-wide text-fg-3">
          <tr>
            <th className="py-2 pr-3 font-medium">Every year</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 text-right font-medium">Rate</th>
            <th className="py-2 pl-3 text-right font-medium">On your <Money value={value} /></th>
          </tr>
        </thead>
        <tbody>
          {rows(yearly)}
          <tr className="border-t-2 border-line font-semibold">
            <td className="py-2 pr-3">Total every year{total.missing && <span className="font-normal text-warn"> (without the fund fee: not known yet)</span>}</td>
            <td />
            <td className="px-3 py-2 text-right">{value ? <Pct value={total.amount / value} /> : "—"}</td>
            <td className="py-2 pl-3 text-right"><Money value={total.amount} /></td>
          </tr>
        </tbody>
        {oneOff.length > 0 && (
          <>
            <thead className="text-left text-[11px] uppercase tracking-wide text-fg-3">
              <tr>
                <th className="pb-2 pr-3 pt-5 font-medium">Once, when you sell</th>
                <th />
                <th />
                <th />
              </tr>
            </thead>
            <tbody>{rows(oneOff)}</tbody>
          </>
        )}
      </table>
      <p className="mt-3 text-[12px] text-fg-3">
        Fund fees are taken out of the fund's value, so they never appear as a charge on a statement. Estimates use where the holding's stocks are, its
        yield, which accounts hold it, and your tax rate (set in Portfolio analysis → What it costs you).
      </p>
    </div>
  );
}
