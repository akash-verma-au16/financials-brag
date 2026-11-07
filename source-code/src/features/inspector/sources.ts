import { create } from "zustand";

/** Spreadsheets the user has added. Only IDs and titles are stored locally — never cell data. */
export interface Source {
  id: string;
  title: string;
}

const KEY = "sheet-sources";

function load(): Source[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((s): s is Source => typeof s?.id === "string" && typeof s?.title === "string")
      : [];
  } catch {
    return [];
  }
}

function save(sources: Source[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sources));
  } catch {
    /* storage unavailable: list lasts for this session only */
  }
}

interface SourcesState {
  sources: Source[];
  upsert(s: Source): void;
  remove(id: string): void;
  replace(sources: Source[]): void;
}

/** Shared by the Data page and every dashboard, so adding a sheet updates everything at once. */
export const useSources = create<SourcesState>((set) => ({
  sources: load(),
  upsert: (s) =>
    set((st) => {
      const exists = st.sources.find((p) => p.id === s.id);
      if (exists && exists.title === s.title) return st;
      const sources = exists ? st.sources.map((p) => (p.id === s.id ? s : p)) : [...st.sources, s];
      save(sources);
      return { sources };
    }),
  remove: (id) =>
    set((st) => {
      const sources = st.sources.filter((p) => p.id !== id);
      save(sources);
      return { sources };
    }),
  replace: (sources) =>
    set(() => {
      save(sources);
      return { sources };
    }),
}));
