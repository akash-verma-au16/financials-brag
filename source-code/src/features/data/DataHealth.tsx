import { useState } from "react";
import { Check, Save } from "lucide-react";
import { useDataset } from "@/data/useDataset";
import type { Dataset } from "@/data/model";
import { allAccounts } from "@/data/select";
import { canSaveToRepo, saveToRepo } from "@/lib/dev-save";
import { formatDate } from "@/lib/format";
import { Button, Card, Notice } from "@/components/ui";

/**
 * Counts by account type × transaction type × sign, and how each was classified.
 * Contains no amounts, names or account identifiers, so it's safe to share for debugging.
 */
export function diagnostics(ds: Dataset): string {
  const typeOf = new Map(allAccounts(ds).map((a) => [a.key, a.type]));
  const counts = new Map<string, number>();
  for (const t of ds.transactions) {
    const k = `${typeOf.get(t.accountKey) ?? "?"} | ${t.type} | ${t.amount > 0 ? "+" : t.amount < 0 ? "−" : "0"} | ${t.kind}${t.category ? ` (${t.category})` : ""}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const accountTypes = new Map<string, number>();
  for (const a of ds.accounts) accountTypes.set(`${a.type} → ${a.bucket}, ${a.tax}`, (accountTypes.get(`${a.type} → ${a.bucket}, ${a.tax}`) ?? 0) + 1);
  const lines = [
    "# Data diagnostics (counts only, no amounts or identifiers)",
    "",
    `Accounts: ${ds.accounts.length} · Positions: ${ds.positions.length} · Transactions: ${ds.transactions.length} · Instruments: ${ds.instruments.size}`,
    "",
    "## Account types → bucket, tax",
    ...[...accountTypes].sort().map(([k, n]) => `- ${k}: ${n}`),
    "",
    "## Transactions: account type | type | sign | kind (category): count",
    ...[...counts].sort().map(([k, n]) => `- ${k}: ${n}`),
    "",
    "## Issues",
    ...ds.issues.map((i) => `- [${i.level}] ${i.message.replace(/:.*$/, "")}`),
  ];
  return lines.join("\n");
}

export function DataHealth() {
  const state = useDataset();
  const [saved, setSaved] = useState<string | null>(null);
  if (state.status !== "ready") return null;
  const ds = state.data;
  const kinds = new Map<string, number>();
  for (const t of ds.transactions) kinds.set(t.kind, (kinds.get(t.kind) ?? 0) + 1);

  return (
    <Card
      title="Data health"
      actions={
        <>
          {canSaveToRepo && (
            <Button
              onClick={async () => {
                try {
                  setSaved(await saveToRepo("diagnostics", diagnostics(ds)));
                } catch (e) {
                  setSaved(`Couldn’t save: ${(e as Error).message}`);
                }
              }}
              title="Counts only: no amounts, names or account numbers"
            >
              {saved ? <Check className="size-4" aria-hidden /> : <Save className="size-4" aria-hidden />} Save diagnostics
            </Button>
          )}
          <Button variant="ghost" onClick={state.reload}>
            Reload all
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-fg-2">
          <span className="num font-semibold text-fg">{ds.accounts.length}</span> accounts
          {!!ds.closedAccounts?.length && <> ({ds.closedAccounts.length} closed, hidden)</>} ·{" "}
          <span className="num font-semibold text-fg">{ds.positions.length}</span> positions ·{" "}
          <span className="num font-semibold text-fg">{ds.transactions.length.toLocaleString()}</span> transactions
          {ds.asOf && <> · latest balance {formatDate(ds.asOf)}</>}
        </p>
        <p className="text-[12px] text-fg-3">
          Transactions by meaning: {[...kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · ")}
        </p>
        {saved && <Notice tone="info">{saved.startsWith("Couldn") ? saved : `Saved to ${saved}`}</Notice>}
        {ds.issues.length === 0 ? (
          <Notice tone="info">No problems found.</Notice>
        ) : (
          ds.issues.map((i, n) => (
            <Notice key={n} tone={i.level === "warn" ? "warn" : "info"}>
              {i.message}
            </Notice>
          ))
        )}
      </div>
    </Card>
  );
}
