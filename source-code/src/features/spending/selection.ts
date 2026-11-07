import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { lastFullMonths, sortMonths } from "@/data/months";
import { todayIso } from "@/lib/format";

/**
 * Which months the Spending pages look at, and what's been left out of the totals. Shared by every
 * Spending tab so switching tabs keeps the same view. Holds no amounts.
 */
interface SpendView {
  /** Selected "YYYY-MM" months; null = default (the last 12 complete months). */
  months: string[] | null;
  /** Last month clicked, for shift-click ranges. */
  anchor: string | null;
  /** Left out of every total: "p:<area>", "c:<category>", "m:<merchant>". */
  excluded: string[];
  setMonths(m: string[], anchor?: string | null): void;
  toggleExcluded(key: string): void;
  setExcluded(keys: string[]): void;
}

export const useSpendView = create<SpendView>()(
  persist(
    (set) => ({
      months: null,
      anchor: null,
      excluded: [],
      setMonths: (m, anchor) => set((s) => ({ months: sortMonths(m), anchor: anchor === undefined ? s.anchor : anchor })),
      toggleExcluded: (k) => set((s) => ({ excluded: s.excluded.includes(k) ? s.excluded.filter((x) => x !== k) : [...s.excluded, k] })),
      setExcluded: (excluded) => set({ excluded }),
    }),
    // Only the month choice is remembered; left-out merchants stay in memory (they're names from your data).
    { name: "financials-spending-view", version: 1, storage: createJSONStorage(() => localStorage), partialize: (s) => ({ months: s.months }) },
  ),
);

export function useSelectedMonths(): string[] {
  const months = useSpendView((s) => s.months);
  return months ?? lastFullMonths(todayIso(), 12);
}
