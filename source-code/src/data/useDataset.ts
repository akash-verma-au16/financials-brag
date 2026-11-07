import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/google-auth";
import { getStatements } from "@/lib/private-files";
import { useAppData } from "./appDataSync";
import type { CellValue } from "@/lib/sheets";
import { useUi } from "@/lib/ui-store";
import { invalidate, loadMeta, loadWorkbook } from "@/features/inspector/workbook";
import { useSources } from "@/features/inspector/sources";
import { buildDataset, type SourceTables } from "./build";
import { demoTables } from "./demo";
import type { Dataset } from "./model";
import { useSettings } from "./settings";
import type { StatementBundle } from "./statement-types";
import { detectKind, toTable } from "./table";

export type DatasetState =
  | { status: "signed-out" }
  | { status: "no-sources" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: Dataset };

/** Where the numbers on screen came from. */
export type Freshness = { source: "live"; at: number } | { source: "demo" };

interface RawSheet {
  id?: string;
  title: string;
  tabs: { title: string; rows: CellValue[][] }[];
}

function toSourceTables(sheets: RawSheet[]): { tables: SourceTables; unrecognised: string[] } {
  const tables: SourceTables = { balances: [], positions: [], transactions: [] };
  const unrecognised: string[] = [];
  for (const s of sheets)
    for (const tab of s.tabs) {
      const table = toTable(tab.rows);
      const kind = detectKind(table);
      if (kind) tables[kind].push(table);
      else unrecognised.push(s.tabs.length > 1 ? `${s.title} › ${tab.title}` : s.title);
    }
  return { tables, unrecognised };
}

async function loadLive(ids: string[]): Promise<RawSheet[]> {
  const out: RawSheet[] = [];
  // Sequential: each spreadsheet costs 3 requests, and the cache makes repeats free.
  for (const id of ids) {
    const meta = await loadMeta(id);
    const tabs = await loadWorkbook(meta);
    out.push({ id, title: meta.title, tabs: meta.tabs.map((t) => ({ title: t.title, rows: tabs[t.title]?.rows ?? [] })) });
  }
  return out;
}

/** All financial data from every connected sheet (read live), plus statement files. */
export function useDataset(): DatasetState & { reload: () => void; freshness?: Freshness } {
  const auth = useAuth();
  const demo = useUi((s) => s.demo);
  const { sources } = useSources();

  // Wealthica sheets, read live with your sign-in (the list is kept in config/settings.json).
  const ids = useMemo(() => [...new Set(sources.map((s) => s.id))], [sources]);
  const idsKey = ids.join(",");
  const [live, setLive] = useState<{ key: string; sheets?: RawSheet[]; error?: string; at: number } | null>(null);
  const [forced, setForced] = useState(0);
  const [statements, setStatements] = useState<StatementBundle | null>(null);

  const people = useSettings((s) => s.people);
  const accountOwners = useSettings((s) => s.accountOwners);
  const accountLabels = useSettings((s) => s.accountLabels);
  const instrumentOverrides = useSettings((s) => s.instrumentOverrides);
  const rules = useSettings((s) => s.rules);
  const circle = useSettings((s) => s.circle);
  const closedAccounts = useSettings((s) => s.closedAccounts);

  const signedIn = auth.status === "signed-in";
  // A new device learns the sheet list from config/settings.json: wait for it before saying there's none.
  const settingsSettled = useAppData((s) => s.status !== "loading");
  const needLive = signedIn && !demo && ids.length > 0;

  useEffect(() => {
    if (!needLive) return;
    let cancelled = false;
    loadLive(ids)
      .then((sheets) => !cancelled && setLive({ key: idsKey, sheets, at: Date.now() }))
      .catch((e: Error) => !cancelled && setLive({ key: idsKey, error: e.message, at: Date.now() }));
    return () => {
      cancelled = true;
    };
  }, [needLive, idsKey, forced]); // idsKey stands in for ids

  // Statements: parsed on the server from the repo's statements/ folder.
  useEffect(() => {
    if (demo || !signedIn) return;
    getStatements().then(setStatements).catch(() => setStatements(null));
  }, [demo, signedIn, forced]);

  const demoTablesMemo = useMemo(() => (demo ? demoTables() : null), [demo]);
  const liveSheets = live?.key === idsKey ? live.sheets : undefined;
  const sheets: RawSheet[] | null = liveSheets ?? null;
  const freshness: Freshness | undefined = demo ? { source: "demo" } : liveSheets ? { source: "live", at: live!.at } : undefined;

  const data = useMemo(() => {
    const settings = { people, accountOwners, accountLabels, instrumentOverrides, rules, circle, closedAccounts };
    if (demoTablesMemo) return buildDataset(demoTablesMemo, settings);
    if (!sheets) return null;
    const { tables, unrecognised } = toSourceTables(sheets);
    const ds = buildDataset({ ...tables, statements: statements?.accounts }, settings);
    if (unrecognised.length)
      ds.issues.unshift({ level: "warn", message: `Not recognised as a Wealthica export (ignored): ${unrecognised.join(", ")}.` });
    for (const e of statements?.errors ?? []) ds.issues.push({ level: "warn", message: `Statements: ${e}` });
    for (const a of statements?.accounts ?? [])
      for (const f of a.files)
        if (f.error || f.parsed === 0) ds.issues.push({ level: "warn", message: `Statement ${f.file}: ${f.error ?? "no transactions recognised"}.` });
    return ds;
  }, [demoTablesMemo, sheets, statements, people, accountOwners, accountLabels, instrumentOverrides, rules, circle, closedAccounts]);

  const reload = useCallback(() => {
    ids.forEach(invalidate);
    setForced((n) => n + 1);
  }, [ids]);

  if (demo && data) return { status: "ready", data, reload, freshness };
  if (!signedIn) return { status: "signed-out", reload };
  if (!ids.length && settingsSettled) return { status: "no-sources", reload };
  if (data) return { status: "ready", data, reload, freshness };
  if (live?.error && live.key === idsKey) return { status: "error", error: live.error, reload };
  return { status: "loading", reload };
}
