import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEMO_ONLY } from "./demo-only";

/** View preferences (no financial data). */
interface UiState {
  /** "all" = whole household, else a person id. */
  person: string;
  /** Hide amounts (screen sharing, public places). */
  privacy: boolean;
  /** Show generated demo data instead of the connected sheets. */
  demo: boolean;
  /** Sidebar shrunk to icons. */
  navCollapsed: boolean;
  setPerson(p: string): void;
  togglePrivacy(): void;
  setDemo(on: boolean): void;
  toggleNav(): void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      person: "all",
      privacy: false,
      demo: DEMO_ONLY,
      navCollapsed: false,
      setPerson: (person) => set({ person }),
      togglePrivacy: () => set((s) => ({ privacy: !s.privacy })),
      setDemo: (demo) => set({ demo: DEMO_ONLY || demo }),
      toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
    }),
    {
      name: "financials-ui",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // The public demo can't leave demo mode, whatever was stored.
      merge: (stored, current) => ({ ...current, ...(stored as Partial<UiState>), demo: DEMO_ONLY || !!(stored as Partial<UiState> | undefined)?.demo }),
    },
  ),
);
