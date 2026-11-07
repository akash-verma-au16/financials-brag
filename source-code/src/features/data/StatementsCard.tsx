import { useEffect, useState } from "react";
import { Badge, Card, Notice } from "@/components/ui";
import type { StatementBundle } from "@/data/statement-types";
import { getStatements } from "@/lib/private-files";
import { formatDate } from "@/lib/format";

/** What was parsed from the repo's statements/ folder, per account and per file. */
export function StatementsCard() {
  const [b, setB] = useState<StatementBundle | null | undefined>(undefined);
  useEffect(() => {
    getStatements().then(setB).catch(() => setB(null));
  }, []);

  return (
    <Card title="Statements" actions={<span className="text-[12px] text-fg-3">statements/ folder in the repo</span>}>
      <p className="mb-3 text-fg-2">
        For accounts Wealthica doesn’t sync, put CSV or PDF statements in <code className="font-mono">statements/&lt;account&gt;/</code>{" "}
        with an <code className="font-mono">account.yaml</code> (see statements/README.md). Rows Wealthica already has are skipped.
      </p>
      {b === undefined ? (
        <p className="text-fg-3">Reading…</p>
      ) : !b || (!b.accounts.length && !b.errors.length) ? (
        <p className="text-fg-3">No statement folders yet.</p>
      ) : (
        <div className="space-y-3">
          {b.errors.map((e) => (
            <Notice key={e} tone="warn">{e}</Notice>
          ))}
          {b.accounts.map((a) => (
            <div key={a.folder} className="rounded-md border border-line-subtle">
              <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-3 py-2">
                <span className="font-medium">{a.meta.name ?? a.folder}</span>
                <Badge>{a.meta.institution}</Badge>
                <Badge tone="info">{a.meta.type}</Badge>
                {a.meta.last4 && <span className="text-[12px] text-fg-3">··{a.meta.last4}</span>}
                <span className="ml-auto text-[12px] text-fg-3">
                  {a.txns.length} transactions
                  {a.txns.length > 0 && ` · ${formatDate(a.txns.at(-1)!.date)} – ${formatDate(a.txns[0]!.date)}`}
                </span>
              </div>
              <ul className="px-3 py-2 text-[12px]">
                {a.files.map((f) => (
                  <li key={f.file} className="flex justify-between gap-3 py-0.5">
                    <span className="truncate font-mono">{f.file}</span>
                    <span className={f.error || !f.parsed ? "text-warn" : "text-fg-3"}>{f.error ?? `${f.parsed} rows`}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
