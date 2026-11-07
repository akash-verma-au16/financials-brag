import { useEffect } from "react";
import { create } from "zustand";
import { useSources, type Source } from "@/features/inspector/sources";
import { useAuth } from "@/lib/google-auth";
import { getPrivateText, saveFiles } from "@/lib/private-files";
import { useUi } from "@/lib/ui-store";
import { historyCsv, parseHistoryCsv, snapshotsToAppend, type SnapshotRow } from "./history";
import { useSettings, type SettingsState } from "./settings";
import { useDataset } from "./useDataset";

/**
 * Keeps the app's own files in the repo in step with the app:
 *   config/settings.json — people, owners, labels, rules, circle, birth year… plus the Wealthica sheet IDs
 *   data/history.csv     — one row per account per balance date (net-worth history)
 * Settings sync both ways (newest edit wins); new balance snapshots are appended after each
 * real data load. Files are read and saved through the local server (tools/api.ts); see SETUP.md.
 */

export const SETTINGS_PATH = "config/settings.json";
export const HISTORY_PATH = "data/history.csv";

type AppDataState =
  | { status: "off" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; snapshots: SnapshotRow[]; writable: boolean; lastSaved: number; saveError?: string };

export const useAppData = create<AppDataState>(() => ({ status: "off" }));

// ── Settings ────────────────────────────────────────────────────────────────

const DATA_KEYS = ["people", "accountOwners", "accountLabels", "closedAccounts", "instrumentOverrides", "rules", "roomExclusions", "circle", "birthYear", "marketLinks", "feeOverrides", "taxRate"] as const;
const UPDATED_KEY = "settings-updated-at";
type SettingsData = Pick<SettingsState, (typeof DATA_KEYS)[number]>;
interface SettingsFile {
  updatedAt: number;
  data: SettingsData;
  sources?: Source[];
}

const pickData = (s: SettingsState): SettingsData => Object.fromEntries(DATA_KEYS.map((k) => [k, s[k]])) as unknown as SettingsData;

const localUpdatedAt = () => {
  try {
    return Number(localStorage.getItem(UPDATED_KEY) ?? 0);
  } catch {
    return 0;
  }
};
const touch = (at = Date.now()) => {
  try {
    localStorage.setItem(UPDATED_KEY, String(at));
  } catch {
    /* ignore */
  }
};

let applyingRemote = false;
// Timestamp every local settings edit (not the ones applied from the repo).
useSettings.subscribe((s, prev) => {
  if (applyingRemote || !useSettings.persist.hasHydrated() || DATA_KEYS.every((k) => s[k] === prev[k])) return;
  touch();
});

const settingsFile = (): string =>
  JSON.stringify({ updatedAt: localUpdatedAt() || Date.now(), data: pickData(useSettings.getState()), sources: useSources.getState().sources } satisfies SettingsFile, null, 2) + "\n";

/** Pull the repo's settings if they're newer; returns true when the local copy should be pushed. */
async function pullSettings(): Promise<boolean> {
  const raw = await getPrivateText(SETTINGS_PATH);
  const remote = raw ? (JSON.parse(raw) as SettingsFile) : null;
  const remoteNewer = !!remote && remote.updatedAt > localUpdatedAt();
  // A newer file decides the sheet list outright, so a swapped or removed sheet doesn't come back
  // from this browser's copy; otherwise just learn any sheets this browser hasn't seen.
  if (remoteNewer && remote.sources) useSources.getState().replace(remote.sources);
  else for (const s of remote?.sources ?? []) useSources.getState().upsert(s);
  if (remote?.data && remoteNewer) {
    applyingRemote = true;
    useSettings.setState(remote.data);
    applyingRemote = false;
    touch(remote.updatedAt);
    return false;
  }
  return !remote || remote.updatedAt < localUpdatedAt() || (remote.sources?.length ?? 0) < useSources.getState().sources.length;
}

function noteSaveError(e: Error) {
  const st = useAppData.getState();
  if (st.status === "ready") useAppData.setState({ ...st, saveError: e.message });
}

// ── Component ───────────────────────────────────────────────────────────────

/** Mount once (in the app shell). */
export function AppDataSync() {
  const auth = useAuth();
  const demo = useUi((s) => s.demo);
  const dataset = useDataset();
  const ready = useAppData((s) => s.status === "ready");

  useEffect(() => {
    if (demo || auth.status !== "signed-in") return void useAppData.setState({ status: "off" });
    let cancelled = false;
    useAppData.setState({ status: "loading" });
    (async () => {
      const push = await pullSettings();
      const snapshots = parseHistoryCsv((await getPrivateText(HISTORY_PATH)) ?? "");
      if (cancelled) return;
      const writable = true;
      useAppData.setState({ status: "ready", snapshots, writable, lastSaved: 0 });
      if (push && writable) await saveFiles([{ path: SETTINGS_PATH, text: settingsFile() }], "Update settings").catch(noteSaveError);
    })().catch((e: Error) => !cancelled && useAppData.setState({ status: "error", error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [auth.status, demo]);

  // Save settings / sheet-list edits (debounced: one commit per burst of edits).
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const st = useAppData.getState();
        if (st.status === "ready" && st.writable) void saveFiles([{ path: SETTINGS_PATH, text: settingsFile() }], "Update settings").catch(noteSaveError);
      }, 4000);
    };
    const unsubSettings = useSettings.subscribe((s, prev) => {
      if (!applyingRemote && !DATA_KEYS.every((k) => s[k] === prev[k])) schedule();
    });
    const unsubSources = useSources.subscribe((s, prev) => {
      if (s.sources === prev.sources) return;
      touch();
      schedule();
    });
    return () => {
      clearTimeout(timer);
      unsubSettings();
      unsubSources();
    };
  }, [ready]);

  // Record new balance snapshots after each real data load.
  const data = dataset.status === "ready" && !demo ? dataset.data : null;
  useEffect(() => {
    const st = useAppData.getState();
    if (!data || st.status !== "ready" || !st.writable) return;
    const rows = snapshotsToAppend(data, st.snapshots);
    if (!rows.length) return;
    const all = [...st.snapshots, ...rows];
    saveFiles([{ path: HISTORY_PATH, text: historyCsv(all) }], `Net-worth snapshot ${rows[0]!.date}`)
      .then(() => {
        const cur = useAppData.getState();
        if (cur.status === "ready") useAppData.setState({ ...cur, snapshots: all, lastSaved: Date.now(), saveError: undefined });
      })
      .catch(noteSaveError);
  }, [data, ready]);

  return null;
}
