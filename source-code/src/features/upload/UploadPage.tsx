import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileUp, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { Badge, Button, Card, Notice, cx } from "@/components/ui";
import type { LedgerFileResult, StatementAccount, StatementAccountMeta, StatementBundle } from "@/data/statement-types";
import { formatDate, formatMonth } from "@/lib/format";
import { getStatements, saveFiles, type SaveFile } from "@/lib/private-files";
import { describeMerge, guessFolder, guessMonth, parseUpload, targetPath, type Parsed } from "./parse-upload";

/**
 * Upload statements: drop any number of PDFs/CSVs for any accounts. Each file is read here with
 * the same parsers as the build, routed to its account folder and month (both editable), then
 * all of them are saved in one go into the repo's statements/ folder on your machine (and
 * committed to its local git history). CSVs for a yearly-ledger account are merged into that
 * year's file by the server and not kept.
 */

const NEW = "__new";

interface Row {
  id: string;
  file: File;
  parsed?: Parsed;
  folder: string | null;
  month: string | null;
}

interface NewAccount {
  folder: string;
  institution: string;
  type: string;
  name: string;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function UploadPage() {
  const [bundle, setBundle] = useState<StatementBundle | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [newAcct, setNewAcct] = useState<NewAccount>({ folder: "", institution: "", type: "credit", name: "" });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: string[]; count: number; merged: LedgerFileResult[] } | { error: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getStatements().then(setBundle).catch(() => setBundle(null));
  }, []);

  const accounts: StatementAccount[] = bundle?.accounts ?? [];

  // Files dropped before the folder list arrived: route them now.
  useEffect(() => {
    if (!bundle?.accounts.length) return;
    setRows((rs) => rs.map((r) => (r.parsed && !r.folder ? { ...r, folder: guessFolder(r.parsed, bundle.accounts, r.file.name) } : r)));
  }, [bundle]);
  const existing = new Set(accounts.flatMap((a) => a.files.map((f) => `statements/${f.file.replace(/\\/g, "/")}`)));
  const isLedger = (folder: string | null) => accounts.some((a) => a.folder === folder && a.meta.ledger === "yearly");
  const metaOf = (folder: string | null): StatementAccountMeta | undefined =>
    folder === NEW ? { institution: newAcct.institution, type: newAcct.type } : accounts.find((a) => a.folder === folder)?.meta;

  async function add(files: FileList | File[]) {
    setResult(null);
    const fresh: Row[] = [...files].map((file) => ({ id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`, file, folder: null, month: null }));
    setRows((r) => [...r, ...fresh]);
    for (const row of fresh) {
      const parsed = await parseUpload(row.file);
      const folder = guessFolder(parsed, accounts, row.file.name);
      // CSVs depend on the account's date format and sign convention: re-read with its settings.
      const final = folder && parsed.kind === "csv" ? await parseUpload(row.file, metaOf(folder)) : parsed;
      setRows((r) => r.map((x) => (x.id === row.id ? { ...x, parsed: final, folder, month: guessMonth(final, row.file.name) } : x)));
    }
  }

  async function setFolder(id: string, folder: string) {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, folder } : x)));
    const row = rows.find((x) => x.id === id);
    if (row?.parsed?.kind === "csv") {
      const parsed = await parseUpload(row.file, metaOf(folder));
      setRows((r) => r.map((x) => (x.id === id ? { ...x, parsed } : x)));
    }
  }

  const newFolder = slug(newAcct.folder || newAcct.name);
  const pathOf = (r: Row) => {
    const folder = r.folder === NEW ? newFolder : r.folder;
    return folder ? targetPath(folder, r.month, r.file) : null;
  };
  const paths = rows.map(pathOf);
  const dupes = new Set(paths.filter((p, i) => p && paths.indexOf(p) !== i));
  const usesNew = rows.some((r) => r.folder === NEW);
  const newOk = !usesNew || (newFolder && newAcct.institution.trim() && newAcct.type && !accounts.some((a) => a.folder === newFolder));
  const ready = rows.filter((r, i) => r.parsed && !r.parsed.error && paths[i] && !dupes.has(paths[i]!));
  const canSubmit = ready.length > 0 && newOk && !saving && rows.every((r) => r.parsed);

  async function submit() {
    setSaving(true);
    setResult(null);
    try {
      const files: SaveFile[] = [];
      for (const r of ready) files.push({ path: pathOf(r)!, base64: await toBase64(r.file) });
      if (usesNew)
        files.push({
          path: `statements/${newFolder}/account.yaml`,
          text: `# Added from the app's upload page.\ninstitution: ${newAcct.institution.trim()}\ntype: ${newAcct.type}\nname: ${(newAcct.name || newAcct.folder).trim()}\n`,
        });
      const folders = [...new Set(ready.map((r) => (r.folder === NEW ? newFolder : r.folder)))].join(", ");
      const saved = await saveFiles(files, `Add ${ready.length} statement${ready.length > 1 ? "s" : ""} (${folders})`);
      setResult({ ok: saved.paths, count: ready.length, merged: saved.merged });
      setRows((rs) => rs.filter((r) => !ready.includes(r)));
      setBundle(await getStatements());
    } catch (e) {
      setResult({ error: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card title="Add statements">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void add(e.dataTransfer.files);
          }}
          onClick={() => input.current?.click()}
          className={cx(
            "flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors",
            drag ? "border-accent bg-accent-subtle" : "border-line hover:border-line-strong hover:bg-hover",
          )}
        >
          <FileUp className="size-7 text-fg-3" aria-hidden />
          <span className="font-medium">Drop statement PDFs or CSVs here, or click to choose</span>
          <span className="text-[12px] text-fg-3">Any number of files, for any accounts. Each is read here first and filed under the right account and month.</span>
          <input
            ref={input}
            type="file"
            multiple
            accept=".pdf,.csv,application/pdf,text/csv"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void add(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {rows.length > 0 && (
          <div className="-mx-4 mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-fg-3">
                <tr>
                  <th className="px-4 py-2 font-medium">File</th>
                  <th className="px-2 py-2 font-medium">What’s inside</th>
                  <th className="px-2 py-2 font-medium">Account</th>
                  <th className="px-2 py-2 font-medium">Statement month</th>
                  <th className="px-2 py-2 font-medium">Saved as</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const p = r.parsed;
                  const path = paths[i];
                  return (
                    <tr key={r.id} className="border-t border-line-subtle align-top">
                      <td className="max-w-56 px-4 py-2">
                        <div className="truncate font-medium" title={r.file.name}>{r.file.name}</div>
                        <div className="text-[11px] text-fg-3">{(r.file.size / 1024).toFixed(0)} KB</div>
                      </td>
                      <td className="px-2 py-2">
                        {!p ? (
                          <span className="flex items-center gap-1.5 text-fg-3"><Loader2 className="size-3.5 animate-spin" /> Reading…</span>
                        ) : p.error ? (
                          <span className="flex items-start gap-1.5 text-warn"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {p.error}</span>
                        ) : (
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge>{p.format}</Badge>
                              {p.last4 && <span className="text-[12px] text-fg-3">··{p.last4}</span>}
                              {p.check === "ok" ? (
                                <span className="flex items-center gap-1 text-[12px] text-pos"><CheckCircle2 className="size-3.5" /> matches statement totals</span>
                              ) : p.check ? (
                                <span className="text-[12px] text-warn" title={p.check}>totals: {p.check}</span>
                              ) : null}
                            </div>
                            <div className="text-[12px] text-fg-3">
                              {p.txns.length} transactions{p.period && ` · ${formatDate(p.period[0])} – ${formatDate(p.period[1])}`}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={r.folder ?? ""}
                          onChange={(e) => void setFolder(r.id, e.target.value)}
                          className={cx("h-8 max-w-56 rounded-md border bg-raised px-2 text-[12px]", r.folder ? "border-line" : "border-warn")}
                        >
                          <option value="" disabled>Choose an account…</option>
                          {accounts.map((a) => (
                            <option key={a.folder} value={a.folder}>
                              {a.meta.name ?? a.folder}{(a.meta.last4 ?? a.detectedLast4) ? ` ··${a.meta.last4 ?? a.detectedLast4}` : ""}
                            </option>
                          ))}
                          <option value={NEW}>+ New account…</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        {r.file.name.toLowerCase().endsWith(".csv") ? (
                          <span className="text-[12px] text-fg-3">— (CSV keeps its name)</span>
                        ) : (
                          <input
                            type="month"
                            value={r.month ?? ""}
                            onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, month: e.target.value || null } : x)))}
                            className={cx("h-8 rounded-md border bg-raised px-2 text-[12px]", r.month ? "border-line" : "border-warn")}
                            title={r.month ? formatMonth(r.month) : "Pick the statement month"}
                          />
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {path && isLedger(r.folder) && r.file.name.toLowerCase().endsWith(".csv") ? (
                          <span className="text-[12px] text-fg-2">merged into <code className="font-mono text-[11px]">statements/{r.folder}/&lt;year&gt;.csv</code>; the export isn’t kept</span>
                        ) : path ? (
                          <div>
                            <code className="font-mono text-[11px]">{path}</code>
                            {dupes.has(path) && <div className="text-[11px] text-neg">Two files would have this name — change a month.</div>}
                            {existing.has(path) && <div className="text-[11px] text-warn">Replaces the file already there.</div>}
                          </div>
                        ) : (
                          <span className="text-[12px] text-fg-3">choose account{r.file.name.toLowerCase().endsWith(".pdf") ? " and month" : ""}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button variant="ghost" aria-label={`Remove ${r.file.name}`} onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {usesNew && (
          <div className="mt-4 grid gap-3 rounded-md border border-line-subtle p-3 sm:grid-cols-4">
            <p className="text-[12px] text-fg-3 sm:col-span-4">New account folder — used to merge with the same account in Wealthica (bank + type, then last 4 digits from the statements).</p>
            <Field label="Name" value={newAcct.name} onChange={(name) => setNewAcct((a) => ({ ...a, name }))} placeholder="e.g. CIBC Aventura Visa" />
            <Field label="Bank (as in Wealthica)" value={newAcct.institution} onChange={(institution) => setNewAcct((a) => ({ ...a, institution }))} placeholder="e.g. CIBC" />
            <label className="text-[12px] text-fg-3">
              Type
              <select value={newAcct.type} onChange={(e) => setNewAcct((a) => ({ ...a, type: e.target.value }))} className="mt-1 block h-8 w-full rounded-md border border-line bg-raised px-2 text-[13px] text-fg">
                {["credit", "chequing", "savings"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <Field label="Folder" value={newAcct.folder || newFolder} onChange={(folder) => setNewAcct((a) => ({ ...a, folder }))} placeholder="e.g. cibc-aventura-visa" />
            {usesNew && newFolder && accounts.some((a) => a.folder === newFolder) && <p className="text-[12px] text-neg sm:col-span-4">That folder already exists — pick it from the list instead.</p>}
          </div>
        )}

        {rows.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-line-subtle pt-4">
            <span className="text-[12px] text-fg-3">
              {ready.length} of {rows.length} ready
              {rows.length - ready.length > 0 && " · files with problems or no account/month are skipped"}
            </span>
            <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
              Save {ready.length} statement{ready.length === 1 ? "" : "s"}
            </Button>
          </div>
        )}

        {result && "error" in result && <div className="mt-3"><Notice tone="neg">Not saved: {result.error}</Notice></div>}
        {result && "ok" in result && (
          <div className="mt-3">
            <Notice tone="info">
              Saved {result.count} file{result.count > 1 ? "s" : ""} to the statements folder — they’re already counted everywhere (reload other open pages to see them).
              {result.merged.map((m) => (
                <span key={m.file} className="mt-1 block">{m.folder}: {describeMerge(m)}</span>
              ))}
            </Notice>
          </div>
        )}
      </Card>

      <Card title="What’s in the repo">
        {!accounts.length ? (
          <p className="text-fg-3">No statement folders yet.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {accounts.map((a) => {
              const months = a.files.filter((f) => f.period).map((f) => f.period![1].slice(0, 7)).sort();
              const bad = a.files.filter((f) => f.error || (f.check && f.check !== "ok"));
              return (
                <div key={a.folder} className="rounded-md border border-line-subtle px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.meta.name ?? a.folder}</span>
                    <Badge>{a.meta.institution}</Badge>
                    <Badge tone="info">{a.meta.type}</Badge>
                    {(a.meta.last4 ?? a.detectedLast4) && <span className="text-[12px] text-fg-3">··{a.meta.last4 ?? a.detectedLast4}</span>}
                  </div>
                  <div className="mt-1 text-[12px] text-fg-3">
                    {a.files.length} files · {a.txns.length} transactions
                    {months.length > 0 && ` · ${formatMonth(months[0]!)} – ${formatMonth(months.at(-1)!)}`}
                    {months.length > 0 && <> · latest <span className="font-medium text-fg-2">{formatMonth(months.at(-1)!)}</span></>}
                  </div>
                  {bad.length > 0 && <div className="mt-1 text-[12px] text-warn">{bad.length} file{bad.length > 1 ? "s" : ""} need a look (Data page → Statements)</div>}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="text-[12px] text-fg-3">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1 block h-8 w-full rounded-md border border-line bg-raised px-2 text-[13px] text-fg" />
    </label>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error ?? new Error("Couldn't read the file"));
    r.readAsDataURL(file);
  });
}
