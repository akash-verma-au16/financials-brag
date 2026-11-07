import { useEffect, useState, type FormEvent } from "react";
import { FileSpreadsheet, Plus, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/lib/google-auth";
import { SignInCard } from "@/components/DataGate";
import { parseSpreadsheetId, type SpreadsheetMeta } from "@/lib/sheets";
import { Button, Card, Notice, cx } from "@/components/ui";
import { useSources } from "./sources";
import { SpreadsheetView } from "./SpreadsheetView";
import { loadMeta } from "./workbook";

export function InspectorPage() {
  const auth = useAuth();
  const { sources, upsert, remove } = useSources();
  const [activeId, setActiveId] = useState<string | null>(sources[0]?.id ?? null);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [meta, setMeta] = useState<SpreadsheetMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  const signedIn = auth.status === "signed-in";

  // Load metadata (tab list) for the active spreadsheet.
  useEffect(() => {
    setMeta(null);
    setMetaError(null);
    if (!signedIn || !activeId) return;
    let cancelled = false;
    loadMeta(activeId)
      .then((m) => {
        if (cancelled) return;
        setMeta(m);
        upsert({ id: m.id, title: m.title });
      })
      .catch((e: Error) => !cancelled && setMetaError(e.message));
    return () => {
      cancelled = true;
    };
  }, [activeId, signedIn, upsert]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    const id = parseSpreadsheetId(input);
    if (!id) {
      setAddError("That doesn't look like a Google Sheets link or ID.");
      return;
    }
    setAdding(true);
    try {
      const m = await loadMeta(id);
      upsert({ id: m.id, title: m.title });
      setActiveId(m.id);
      setInput("");
    } catch (err) {
      setAddError((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  if (!signedIn) return <SignInCard />;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 text-[12px] text-fg-3">
        <ShieldCheck className="mt-px size-4 shrink-0 text-pos" aria-hidden />
        <p>
          Everything on this page is read live from Google and processed in this browser only. Sample values stay
          hidden until you reveal them. “Copy structure” copies column layouts without any cell values.
        </p>
      </div>

      <Card title="Spreadsheets">
        <div className="flex flex-col gap-3">
          {sources.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {sources.map((s) => (
                <li key={s.id}>
                  <div
                    className={cx(
                      "flex h-8 items-center rounded-md border text-[13px]",
                      s.id === activeId ? "border-accent bg-accent-subtle" : "border-line bg-panel hover:border-line-strong",
                    )}
                  >
                    <button className="flex h-full items-center gap-1.5 pl-2.5 pr-1.5" onClick={() => setActiveId(s.id)}>
                      <FileSpreadsheet className="size-4 text-fg-3" aria-hidden />
                      <span className="max-w-[260px] truncate font-medium">{s.title}</span>
                    </button>
                    <button
                      className="flex h-full items-center px-1.5 text-fg-3 hover:text-neg"
                      aria-label={`Remove ${s.title}`}
                      onClick={() => {
                        remove(s.id);
                        if (activeId === s.id) setActiveId(sources.find((x) => x.id !== s.id)?.id ?? null);
                      }}
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={onAdd} className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="sheet-url">
              Google Sheets link
            </label>
            <input
              id="sheet-url"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste a Google Sheets link (e.g. your Wealthica export)"
              autoComplete="off"
              spellCheck={false}
              className="h-8 min-w-0 flex-1 rounded-md border border-line bg-raised px-3 text-[13px] placeholder:text-fg-3 hover:border-line-strong"
            />
            <Button type="submit" variant="primary" disabled={adding || !input.trim()}>
              <Plus className="size-4" aria-hidden /> {adding ? "Checking…" : "Add sheet"}
            </Button>
          </form>
          {addError && <Notice tone="neg">{addError}</Notice>}
        </div>
      </Card>

      {metaError && <Notice tone="neg">{metaError}</Notice>}
      {activeId && !meta && !metaError && <p className="text-fg-3">Loading spreadsheet…</p>}
      {meta && <SpreadsheetView key={meta.id} meta={meta} />}
    </div>
  );
}
