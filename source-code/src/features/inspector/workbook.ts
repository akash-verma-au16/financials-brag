import { columnFormats, getAllTabFormats, getAllTabValues, getSpreadsheetMeta, type CellValue, type SpreadsheetMeta } from "@/lib/sheets";
import { profileTab, type TabProfile } from "@/lib/inspect";

/**
 * In-memory cache of spreadsheets read this session (cleared on page reload, never persisted).
 * Concurrent callers share one in-flight request, so a spreadsheet costs 1 request for its
 * metadata and 2 for all of its tabs, however many tabs it has. That keeps us well under
 * Google's 60 reads/min.
 */

export interface LoadedTab {
  rows: CellValue[][];
  profile: TabProfile;
}

const metas = new Map<string, Promise<SpreadsheetMeta>>();
const workbooks = new Map<string, Promise<Record<string, LoadedTab>>>();

function cached<T>(map: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  let p = map.get(key);
  if (!p) {
    p = load();
    map.set(key, p);
    p.catch(() => map.delete(key)); // let failures be retried
  }
  return p;
}

export const loadMeta = (id: string) => cached(metas, id, () => getSpreadsheetMeta(id));

export function loadWorkbook(meta: SpreadsheetMeta): Promise<Record<string, LoadedTab>> {
  return cached(workbooks, meta.id, async () => {
    const titles = meta.tabs.map((t) => t.title);
    const [values, formats] = await Promise.all([getAllTabValues(meta.id, titles), getAllTabFormats(meta.id, titles)]);
    return Object.fromEntries(
      titles.map((title) => {
        const rows = values[title] ?? [];
        // Header detection needs only values; formats are then sampled from the rows below it.
        const { headerRow } = profileTab(title, rows, []);
        return [title, { rows, profile: profileTab(title, rows, columnFormats(formats[title] ?? [], headerRow)) }];
      }),
    );
  });
}

/** Forget a spreadsheet so the next load re-reads it from Google. */
export function invalidate(id: string) {
  metas.delete(id);
  workbooks.delete(id);
}
