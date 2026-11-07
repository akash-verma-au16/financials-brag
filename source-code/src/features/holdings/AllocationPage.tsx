import { useState } from "react";
import { DataGate } from "@/components/DataGate";
import { BarList, Money, StackBar, chartColor } from "@/components/money";
import { Card, Segmented } from "@/components/ui";
import { ASSET_CLASS_LABEL, REGION_LABEL, holdings } from "@/data/holdings";
import { accountTypeLabel, shortInstitution } from "@/data/build";
import type { AssetClass, Dataset, Region } from "@/data/model";
import { groupSum, scopeAccounts } from "@/data/select";
import { useUi } from "@/lib/ui-store";

const CLASS_ORDER: AssetClass[] = ["equity", "balanced", "fixed-income", "real-estate", "cash", "other"];
const TAX_LABEL = { "tax-free": "Tax-free", "tax-deferred": "Tax-deferred", taxable: "Taxable", "n/a": "—" } as const;

export function AllocationPage() {
  return <DataGate>{(ds) => <Allocation ds={ds} />}</DataGate>;
}

interface Slice {
  assetClass: AssetClass;
  region: Region;
  vehicle: string;
  accountKey: string | null;
  value: number;
}

function Allocation({ ds }: { ds: Dataset }) {
  const person = useUi((s) => s.person);
  const [scope, setScope] = useState<"invested" | "with-cash">("invested");
  const accounts = new Map(scopeAccounts(ds, person).map((a) => [a.key, a]));

  // Every lot is one slice; cash accounts optionally join as cash.
  const slices: Slice[] = holdings(ds, person).flatMap((h) =>
    h.lots.map((l) => ({ assetClass: h.instrument.assetClass, region: h.instrument.region, vehicle: h.instrument.vehicle, accountKey: l.accountKey, value: l.marketValue })),
  );
  if (scope === "with-cash")
    for (const a of accounts.values())
      if (a.bucket === "cash" && a.value > 0) slices.push({ assetClass: "cash", region: "n/a", vehicle: "cash", accountKey: a.key, value: a.value });

  const total = slices.reduce((s, x) => s + x.value, 0);
  if (!total) return <Card title="Allocation">No holdings found. Add your Wealthica Positions export on the Data page.</Card>;

  const byClass = groupSum(slices, (s) => s.assetClass, (s) => s.value);
  const classColor = (c: string) => chartColor(CLASS_ORDER.indexOf(c as AssetClass));
  const equity = slices.filter((s) => s.assetClass === "equity");
  const acct = (s: Slice) => (s.accountKey ? accounts.get(s.accountKey) : undefined);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-fg-2">
          Allocation of <Money value={total} className="font-semibold text-fg" />{" "}
          {scope === "invested" ? "in investment and retirement accounts" : "including chequing and savings"}.
        </p>
        <Segmented
          label="What to include"
          value={scope}
          onChange={setScope}
          options={[
            { value: "invested", label: "Invested only" },
            { value: "with-cash", label: "Include cash accounts" },
          ]}
        />
      </div>

      <Card title="Asset class">
        <StackBar
          parts={CLASS_ORDER.map((c) => ({
            key: c,
            label: ASSET_CLASS_LABEL[c],
            value: byClass.find((g) => g.key === c)?.value ?? 0,
            color: classColor(c),
          }))}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Stocks by region" actions={<span className="text-[12px] text-fg-3">equity holdings only</span>}>
          {equity.length ? (
            <BarList rows={groupSum(equity, (s) => s.region, (s) => s.value).map((g, i) => ({ key: g.key, label: REGION_LABEL[g.key as Region], value: g.value, color: chartColor(i) }))} />
          ) : (
            <p className="text-fg-3">No stock holdings.</p>
          )}
        </Card>
        <Card title="By account tax treatment">
          <BarList rows={groupSum(slices, (s) => acct(s)?.tax ?? "taxable", (s) => s.value).map((g) => ({ key: g.key, label: TAX_LABEL[g.key as keyof typeof TAX_LABEL], value: g.value }))} />
        </Card>
        <Card title="By account type">
          <BarList rows={groupSum(slices, (s) => accountTypeLabel(acct(s)?.type ?? "other"), (s) => s.value).map((g) => ({ key: g.key, label: g.key, value: g.value }))} />
        </Card>
        <Card title="By institution">
          <BarList rows={groupSum(slices, (s) => shortInstitution(acct(s)?.institution ?? "Other"), (s) => s.value).map((g) => ({ key: g.key, label: g.key, value: g.value }))} />
        </Card>
        <Card title="By vehicle">
          <BarList
            rows={groupSum(slices, (s) => s.vehicle, (s) => s.value).map((g) => ({
              key: g.key,
              label: { stock: "Individual stocks", etf: "ETFs", fund: "Mutual & pension funds", cash: "Cash", other: "Other" }[g.key] ?? g.key,
              value: g.value,
            }))}
          />
        </Card>
      </div>
    </div>
  );
}
