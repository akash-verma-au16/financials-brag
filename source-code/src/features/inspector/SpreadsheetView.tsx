import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ClipboardCopy, Eye, EyeOff, RefreshCw, Save } from "lucide-react";
import type { SpreadsheetMeta } from "@/lib/sheets";
import { canSaveToRepo, saveToRepo } from "@/lib/dev-save";
import { sampleRows, structureMarkdown, type ColumnKind } from "@/lib/inspect";
import { Badge, Button, Card, Notice, cx } from "@/components/ui";
import { invalidate, loadWorkbook, type LoadedTab } from "./workbook";

const KIND_TONE: Record<ColumnKind, "neutral" | "info" | "warn" | "accent" | "pos"> = {
  empty: "neutral",
  date: "info",
  datetime: "info",
  "iso-date-text": "info",
  currency: "pos",
  percent: "pos",
  integer: "accent",
  number: "accent",
  boolean: "neutral",
  "currency-code": "neutral",
  text: "neutral",
  mixed: "warn",
};

export function SpreadsheetView({ meta }: { meta: SpreadsheetMeta }) {
  const [activeTab, setActiveTab] = useState(meta.tabs[0]?.title ?? "");
  const [loaded, setLoaded] = useState<Record<string, LoadedTab> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSamples, setShowSamples] = useState(false);
  const [includeHints, setIncludeHints] = useState(false);
  const [copied, setCopied] = useState<"tab" | "all" | null>(null);
  const [saved, setSaved] = useState<{ path?: string; error?: string } | null>(null);

  // All tabs are read together (2 requests total) and cached for the session.
  const fetchAll = useCallback(() => {
    let cancelled = false;
    setLoaded(null);
    setError(null);
    loadWorkbook(meta)
      .then((tabs) => !cancelled && setLoaded(tabs))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [meta]);

  useEffect(fetchAll, [fetchAll]);

  const current = loaded?.[activeTab];
  const samples = useMemo(() => (current && showSamples ? sampleRows(current.rows, current.profile) : []), [current, showSamples]);

  async function save() {
    if (!loaded) return;
    const profiles = meta.tabs.flatMap((t) => loaded[t.title]?.profile ?? []);
    const content = `<!-- spreadsheet: ${meta.title} -->\n${structureMarkdown(profiles, includeHints)}`;
    try {
      setSaved({ path: await saveToRepo(`structure ${meta.title}`, content) });
    } catch (e) {
      setSaved({ error: (e as Error).message });
    }
  }

  async function copy(scope: "tab" | "all") {
    if (!loaded || !current) return;
    const profiles = scope === "tab" ? [current.profile] : meta.tabs.flatMap((t) => loaded[t.title]?.profile ?? []);
    await navigator.clipboard.writeText(structureMarkdown(profiles, includeHints));
    setCopied(scope);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <Card
      title={meta.title}
      actions={
        <>
          <label className="flex cursor-pointer select-none items-center gap-1.5 text-[12px] text-fg-2">
            <input type="checkbox" checked={includeHints} onChange={(e) => setIncludeHints(e.target.checked)} className="accent-[var(--accent)]" />
            Include category values &amp; date ranges
          </label>
          <Button onClick={() => copy("tab")} disabled={!current}>
            {copied === "tab" ? <Check className="size-4 text-pos" aria-hidden /> : <ClipboardCopy className="size-4" aria-hidden />}
            Copy tab structure
          </Button>
          <Button variant="primary" onClick={() => copy("all")} disabled={!loaded}>
            {copied === "all" ? <Check className="size-4" aria-hidden /> : <ClipboardCopy className="size-4" aria-hidden />}
            Copy all tabs
          </Button>
          {canSaveToRepo && (
            <Button variant="primary" onClick={save} disabled={!loaded} title="Write the structure into data/private/inspector/ in the repo">
              {saved?.path ? <Check className="size-4" aria-hidden /> : <Save className="size-4" aria-hidden />}
              Save to repo
            </Button>
          )}
        </>
      }
    >
      <div role="tablist" aria-label="Tabs" className="-mx-4 -mt-4 mb-4 flex gap-1 overflow-x-auto border-b border-line-subtle px-3">
        {meta.tabs.map((t) => (
          <button
            key={t.sheetId}
            role="tab"
            aria-selected={t.title === activeTab}
            onClick={() => setActiveTab(t.title)}
            className={cx(
              "-mb-px flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-[13px] font-medium transition-colors",
              t.title === activeTab ? "border-accent text-fg" : "border-transparent text-fg-3 hover:text-fg",
            )}
          >
            {t.title}
            {loaded?.[t.title] && <span className="num text-[11px] text-fg-3">{loaded[t.title]!.profile.dataRows}</span>}
          </button>
        ))}
      </div>

      {saved?.path && <Notice tone="info">Saved to {saved.path}</Notice>}
      {saved?.error && <Notice tone="neg">Couldn’t save: {saved.error}</Notice>}
      {error && (
        <Notice tone="neg">
          {error}{" "}
          <button className="font-medium underline" onClick={fetchAll}>
            Retry
          </button>
        </Notice>
      )}
      {!loaded && !error && <p className="text-fg-3">Reading all tabs… (retries automatically if Google asks us to slow down)</p>}

      {current && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-fg-2">
            <span>
              <span className="num font-semibold text-fg">{current.profile.dataRows.toLocaleString()}</span> data rows
            </span>
            <span>
              <span className="num font-semibold text-fg">{current.profile.columns.length}</span> columns
            </span>
            <span>
              Header on row <span className="num font-semibold text-fg">{current.profile.headerRow}</span>
            </span>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" onClick={() => setShowSamples((s) => !s)}>
                {showSamples ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                {showSamples ? "Hide sample rows" : "Show sample rows"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  invalidate(meta.id);
                  fetchAll();
                }}
              >
                <RefreshCw className="size-4" aria-hidden /> Reload
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-line-subtle">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="bg-bg-deep text-[11px] uppercase tracking-wide text-fg-3">
                <tr>
                  {["Col", "Header", "Type", "Filled", "Distinct", "Text shapes", "Values / range"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {current.profile.columns.map((c) => (
                  <tr key={c.index} className="border-t border-line-subtle hover:bg-hover">
                    <td className="num px-3 py-2 font-mono text-[12px] text-fg-3">{c.letter}</td>
                    <td className="px-3 py-2 font-medium">{c.header}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Badge tone={KIND_TONE[c.kind]}>{c.kind}</Badge>
                      {c.numberFormat && c.numberFormat !== "NUMBER" && (
                        <span className="ml-1.5 text-[11px] text-fg-3">{c.numberFormat.toLowerCase()}</span>
                      )}
                    </td>
                    <td className="num px-3 py-2 text-right">
                      {current.profile.dataRows ? `${Math.round((c.filled / current.profile.dataRows) * 100)}%` : "—"}
                    </td>
                    <td className="num px-3 py-2 text-right">{c.distinct.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-fg-2">
                      {c.patterns.map((p) => p.pattern).join("  ·  ") || "—"}
                    </td>
                    <td className="max-w-[360px] px-3 py-2 text-[12px] text-fg-2">
                      {c.categories ? (
                        <span className="line-clamp-2">{c.categories.join(" · ")}</span>
                      ) : c.range ? (
                        <span className="num">
                          {c.range.min} → {c.range.max}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showSamples && (
            <div>
              <h3 className="mb-2 text-[13px] font-semibold">
                First {samples.length} rows <span className="font-normal text-fg-3">— visible only on this screen</span>
              </h3>
              <div className="overflow-x-auto rounded-md border border-line-subtle">
                <table className="w-full border-collapse text-[12px]">
                  <thead className="bg-bg-deep text-fg-3">
                    <tr>
                      {current.profile.columns.map((c) => (
                        <th key={c.index} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                          {c.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {samples.map((r, i) => (
                      <tr key={i} className="border-t border-line-subtle">
                        {r.map((v, j) => (
                          <td key={j} className="num whitespace-nowrap px-3 py-1.5">
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
