import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { FileUp, Loader2, Plus, X } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useSettings } from "@/data/settings";
import { CATEGORY_BY_ID } from "@/data/categories";
import type { StatementAccount } from "@/data/statement-types";
import { describeMerge } from "@/features/upload/parse-upload";
import { getStatements, saveFiles } from "@/lib/private-files";

export function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-5">
      <PeopleCard />
      <CircleCard />
      <RulesCard />
      <StatementsCard />
    </div>
  );
}

/** Accounts kept from statement files (ones Wealthica can't sync), where each gets its balance, and CSV imports. */
function StatementsCard() {
  const [accounts, setAccounts] = useState<StatementAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    getStatements()
      .then((b) => setAccounts(b?.accounts ?? []))
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  const balanceFrom = (a: StatementAccount) => {
    if (a.meta.balance !== undefined) return "account.yaml";
    if (a.meta.openingBalance !== undefined) return "its transactions since the account opened";
    return a.latestBalance ? "latest statement" : "none yet";
  };
  const latest = (a: StatementAccount) => a.files.map((f) => f.period?.[1] ?? "").sort().at(-1) || a.txns[0]?.date;
  const summary = (a: StatementAccount) => {
    if (a.meta.pending) return "waiting for its first statement — not counted anywhere yet";
    if (!a.files.length) return "no statements yet";
    const what = a.meta.ledger === "yearly" ? `${a.files.length} yearly CSV${a.files.length > 1 ? "s" : ""}, ${a.txns.length} transactions` : `${a.files.length} statement${a.files.length > 1 ? "s" : ""}`;
    return `${what}${latest(a) ? `, latest ${latest(a)}` : ""} · balance from ${balanceFrom(a)} (Wealthica's when it has the account)`;
  };

  return (
    <Card
      title="Statement accounts"
      actions={
        <Link to="/upload">
          <Button>
            <FileUp className="size-4" aria-hidden /> Upload statements
          </Button>
        </Link>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-fg-2">
          Accounts Wealthica can't fully sync. Transactions come from the statements you upload (saved as statements/&lt;account&gt;/&lt;year&gt;/&lt;year-month&gt;.pdf).
          Accounts with a yearly ledger keep one CSV per year: import the bank's latest export and only the transactions that are new get added.
        </p>
        {error && <p className="text-[12px] text-warn">Couldn't load statement folders: {error}</p>}
        {accounts && !accounts.length && <p className="text-[12px] text-fg-3">No statement folders yet.</p>}
        <ul className="divide-y divide-line-subtle">
          {accounts?.map((a) => (
            <li key={a.folder} className="flex flex-wrap items-start gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{a.meta.name ?? a.folder}</div>
                <div className="text-[12px] text-fg-3">
                  {a.meta.institution} · {a.meta.type} · {summary(a)}
                </div>
              </div>
              {a.meta.ledger === "yearly" && <LedgerImport account={a} onDone={() => void load()} />}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/** Imports a bank's CSV export into a yearly-ledger account: the server merges it and drops the file. */
function LedgerImport({ account, onDone }: { account: StatementAccount; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  async function importFile(file: File) {
    setBusy(true);
    setNote(null);
    try {
      const name = file.name.replace(/[^\w.-]+/g, "-").replace(/(\.csv)?$/i, ".csv");
      const saved = await saveFiles([{ path: `statements/${account.folder}/${name}`, text: await file.text() }], `Import ${account.meta.name ?? account.folder} export`);
      const m = saved.merged[0];
      setNote(m ? { tone: m.error ? "warn" : "ok", text: describeMerge(m) } : { tone: "warn", text: "Saved, but the server didn't merge it. Is the server up to date?" });
      onDone();
    } catch (e) {
      setNote({ tone: "warn", text: `Not imported: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-sm flex-col items-end gap-1">
      <Button onClick={() => input.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileUp className="size-4" aria-hidden />} Import CSV
      </Button>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importFile(f);
        }}
      />
      {note && <p className={note.tone === "ok" ? "text-right text-[12px] text-pos" : "text-right text-[12px] text-warn"}>{note.text}</p>}
    </div>
  );
}

function CircleCard() {
  const circle = useSettings((s) => s.circle);
  const setCircle = useSettings((s) => s.setCircle);
  const [name, setName] = useState("");
  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 3) return;
    setCircle([...circle, name.trim()]);
    setName("");
  }
  return (
    <Card title="Your circle">
      <p className="mb-4 text-fg-2">
        Names as they appear on e-Transfers and transfers — yours, your family’s. Money sent to or received from them
        counts as <span className="font-medium">moving money</span>, not spending or income. Transfers between your own
        connected accounts are matched automatically and don’t need to be listed.
      </p>
      {circle.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-2">
          {circle.map((n) => (
            <li key={n} className="flex h-8 items-center gap-1 rounded-full border border-line bg-raised pl-3 pr-1 text-[13px]">
              {n}
              <Button variant="ghost" className="h-6 px-1" aria-label={`Remove ${n}`} onClick={() => setCircle(circle.filter((x) => x !== n))}>
                <X className="size-3.5" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onAdd} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. a first and last name"
          aria-label="Name in your circle"
          className="h-8 w-72 rounded-md border border-line bg-raised px-3 text-[13px] placeholder:text-fg-3 hover:border-line-strong"
        />
        <Button type="submit" disabled={name.trim().length < 3}>
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      </form>
    </Card>
  );
}

function RulesCard() {
  const rules = useSettings((s) => s.rules);
  const setRules = useSettings((s) => s.setRules);
  return (
    <Card title="Category rules">
      <p className="mb-4 text-fg-2">
        Your rules run before the built-in ones. A rule matches transaction descriptions that contain its text at the
        start of a word (or a <code className="font-mono text-[12px]">/regex/</code>). Change a category on the Cash
        flow page to add one.
      </p>
      {rules.length === 0 ? (
        <p className="text-fg-3">No custom rules yet.</p>
      ) : (
        <ul className="divide-y divide-line-subtle rounded-md border border-line-subtle">
          {rules.map((r, i) => (
            <li key={`${r.match}|${r.direction}`} className="flex items-center gap-3 px-3 py-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{r.match}</span>
              <span className="text-fg-3">{r.direction === "in" ? "money in" : r.direction === "out" ? "money out" : "any"}</span>
              <span className="w-52 truncate">→ {CATEGORY_BY_ID.get(r.category)?.label ?? r.category}</span>
              <Button variant="ghost" aria-label={`Delete rule ${r.match}`} onClick={() => setRules(rules.filter((_, j) => j !== i))}>
                <X className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PeopleCard() {
  const people = useSettings((s) => s.people);
  const add = useSettings((s) => s.addPerson);
  const rename = useSettings((s) => s.renamePerson);
  const remove = useSettings((s) => s.removePerson);
  const [name, setName] = useState("");

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    add(name.trim());
    setName("");
  }

  return (
    <Card title="Household">
      <p className="mb-4 text-fg-2">
        People who own accounts. Assign owners on the Accounts page; joint accounts are split equally between their
        owners. Accounts without an owner belong to the first person.
      </p>
      <ul className="mb-4 space-y-2">
        {people.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2">
            <input
              defaultValue={p.name}
              aria-label={`Name of person ${i + 1}`}
              onBlur={(e) => e.target.value.trim() && rename(p.id, e.target.value.trim())}
              className="h-8 w-60 rounded-md border border-line bg-raised px-3 text-[13px] hover:border-line-strong"
            />
            {i === 0 && <span className="text-[12px] text-fg-3">default owner</span>}
            {people.length > 1 && (
              <Button variant="ghost" aria-label={`Remove ${p.name}`} onClick={() => remove(p.id)}>
                <X className="size-4" aria-hidden />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={onAdd} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a person"
          aria-label="New person's name"
          className="h-8 w-60 rounded-md border border-line bg-raised px-3 text-[13px] placeholder:text-fg-3 hover:border-line-strong"
        />
        <Button type="submit" disabled={!name.trim()}>
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      </form>
    </Card>
  );
}
