import { useState } from "react";
import { Archive, Pencil, RotateCcw } from "lucide-react";
import { DataGate } from "@/components/DataGate";
import { DataTable, type Column } from "@/components/DataTable";
import { Money, Pct, Stat } from "@/components/money";
import { Badge, Button, Card, cx } from "@/components/ui";
import { accountTypeLabel, shortInstitution } from "@/data/build";
import type { Account, Dataset } from "@/data/model";
import { BUCKETS, netWorth, scopeAccounts, type ScopedAccount } from "@/data/select";
import { useSettings } from "@/data/settings";
import { daysBetween, formatDate } from "@/lib/format";
import { useUi } from "@/lib/ui-store";

const TAX_TONE = { "tax-free": "pos", "tax-deferred": "info", taxable: "neutral", "n/a": "neutral" } as const;
const BUCKET_LABEL = Object.fromEntries(BUCKETS.map((b) => [b.id, b.label])) as Record<string, string>;
const SOURCE_LABEL: Record<string, string> = { wealthica: "Wealthica", statements: "Statements", "wealthica+statements": "Wealthica + statements" };

export function AccountsPage() {
  return <DataGate>{(ds) => <Accounts ds={ds} />}</DataGate>;
}

function Accounts({ ds }: { ds: Dataset }) {
  const person = useUi((s) => s.person);
  const people = useSettings((s) => s.people);
  const accounts = scopeAccounts(ds, person);
  const nw = netWorth(accounts);
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? "—";

  const columns: Column<ScopedAccount>[] = [
    { id: "name", header: "Account", value: (a) => a.name, render: (a) => <AccountName a={a} />, pinned: true },
    { id: "institution", header: "Institution", value: (a) => shortInstitution(a.institution), facet: true },
    { id: "type", header: "Type", value: (a) => accountTypeLabel(a.type), facet: true },
    { id: "bucket", header: "Bucket", value: (a) => a.bucket, facet: true, facetLabel: (v) => BUCKET_LABEL[v] ?? v, render: (a) => BUCKET_LABEL[a.bucket] },
    {
      id: "tax",
      header: "Tax",
      value: (a) => a.tax,
      facet: true,
      render: (a) => (a.tax === "n/a" ? "—" : <Badge tone={TAX_TONE[a.tax]}>{a.tax}</Badge>),
    },
    {
      id: "owners",
      header: "Owners",
      value: (a) => a.owners.map(name).join(" + ") || "—",
      facet: true,
      render: (a) => <OwnerPicker accountKey={a.key} owners={a.owners} />,
      hidden: people.length < 2,
    },
    { id: "source", header: "Source", value: (a) => a.source ?? "wealthica", facet: true, facetLabel: (v) => SOURCE_LABEL[v] ?? v, hidden: true },
    {
      id: "synced",
      header: "Synced",
      value: (a) => a.asOf,
      render: (a) => {
        const stale = ds.asOf && a.asOf ? daysBetween(a.asOf, ds.asOf) > 3 : false;
        return <span className={cx("whitespace-nowrap text-[12px]", stale ? "text-warn" : "text-fg-3")}>{formatDate(a.asOf)}{stale && " · stale"}</span>;
      },
    },
    {
      id: "share",
      header: "Of net worth",
      value: (a) => (nw.net > 0 ? a.value / nw.net : null),
      render: (a) => (nw.net > 0 && a.value > 0 ? <Pct value={a.value / nw.net} className="text-fg-2" /> : "—"),
      align: "right",
    },
    {
      id: "balance",
      header: "Balance",
      value: (a) => a.value,
      sum: true,
      align: "right",
      render: (a) => (
        <span className="font-medium">
          <Money value={a.value} style="cents" />
          {a.share < 1 && <div className="text-[11px] font-normal text-fg-3">share of <Money value={a.balance} /></div>}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      value: () => "open",
      render: (a) => <CloseButton a={a} stale={!!ds.asOf && !!a.asOf && daysBetween(a.asOf, ds.asOf) > 3} />,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {BUCKETS.map((b) => (
          <Stat key={b.id} label={b.label} value={<Money value={nw.byBucket[b.id]} />} sub={`${accounts.filter((a) => a.bucket === b.id).length} accounts`} hint={b.hint} />
        ))}
      </div>
      <Card title="Accounts" actions={<span className="text-[12px] text-fg-3">Net worth <Money value={nw.net} className="font-semibold text-fg" /></span>}>
        <DataTable
          tableId="accounts"
          rows={accounts}
          columns={columns}
          rowKey={(a) => a.key}
          initialGroup="bucket"
          initialSort={{ id: "balance", desc: true }}
          search={(a) => `${a.name} ${a.institution} ${a.type} ${a.last4}`}
          pageSize={100}
        />
      </Card>
      {!!ds.closedAccounts?.length && <ClosedAccounts accounts={ds.closedAccounts} />}
    </div>
  );
}

/** Hides the account from every present-day view; its past balances stay in net-worth history. */
function CloseButton({ a, stale }: { a: Account; stale: boolean }) {
  const setClosed = useSettings((s) => s.setAccountClosed);
  return (
    <button
      onClick={() => setClosed(a.key, a.asOf || new Date().toISOString().slice(0, 10))}
      title={`Hide everywhere from now on. It still counts in net-worth history up to ${formatDate(a.asOf)}.`}
      className={cx(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[12px] transition-colors hover:text-fg",
        stale ? "border-warn text-warn" : "border-line text-fg-3",
      )}
    >
      <Archive className="size-3.5" aria-hidden /> Mark closed
    </button>
  );
}

function ClosedAccounts({ accounts }: { accounts: Account[] }) {
  const setClosed = useSettings((s) => s.setAccountClosed);
  return (
    <Card title="Closed accounts" actions={<span className="text-[12px] text-fg-3">Hidden everywhere · kept in net-worth history up to their last day</span>}>
      <ul className="divide-y divide-line-subtle">
        {accounts.map((a) => (
          <li key={a.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-fg-2">{a.name}</div>
              <div className="text-[12px] text-fg-3">
                {shortInstitution(a.institution)}
                {a.last4 && ` ··${a.last4}`} · {accountTypeLabel(a.type)} · last balance <Money value={a.balance} /> on {formatDate(a.asOf)}
              </div>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-fg-3">
              Last day
              <input
                type="date"
                value={a.closedOn ?? ""}
                onChange={(e) => e.target.value && setClosed(a.key, e.target.value)}
                className="h-7 rounded border border-line bg-raised px-2 text-fg"
              />
            </label>
            <Button variant="ghost" onClick={() => setClosed(a.key, null)}>
              <RotateCcw className="size-3.5" aria-hidden /> Reopen
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AccountName({ a }: { a: ScopedAccount }) {
  const [editing, setEditing] = useState(false);
  const setLabel = useSettings((s) => s.setAccountLabel);
  if (editing)
    return (
      <input
        autoFocus
        defaultValue={a.name}
        aria-label="Account name"
        className="h-7 w-full max-w-72 rounded border border-line bg-raised px-2"
        onBlur={(e) => {
          setLabel(a.key, e.target.value);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  return (
    <div className="group">
      <div className="flex items-center gap-1.5">
        <span className="font-medium">{a.name}</span>
        <button className="text-fg-3 opacity-0 hover:text-fg focus:opacity-100 group-hover:opacity-100" aria-label={`Rename ${a.name}`} onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" aria-hidden />
        </button>
      </div>
      <div className="text-[12px] text-fg-3">
        {shortInstitution(a.institution)}
        {a.last4 && ` ··${a.last4}`}
        {a.source === "statements" && " · from statements"}
      </div>
    </div>
  );
}

function OwnerPicker({ accountKey, owners }: { accountKey: string; owners: string[] }) {
  const people = useSettings((s) => s.people);
  const setOwners = useSettings((s) => s.setAccountOwners);
  if (people.length < 2) return <span className="text-fg-3">{people[0]?.name}</span>;
  return (
    <div className="flex gap-1" role="group" aria-label="Owners">
      {people.map((p) => {
        const on = owners.includes(p.id);
        return (
          <button
            key={p.id}
            aria-pressed={on}
            onClick={() => {
              const next = on ? owners.filter((o) => o !== p.id) : [...owners, p.id];
              if (next.length) setOwners(accountKey, next);
            }}
            className={cx("h-6 rounded-full border px-2 text-[12px] transition-colors", on ? "border-accent bg-accent-subtle text-fg" : "border-line text-fg-3 hover:text-fg")}
          >
            {p.name}
          </button>
        );
      })}
    </div>
  );
}
