import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { InstrumentOverride } from "./instruments";
import type { Rule } from "./categories";

/**
 * User configuration. Contains no balances or transactions — only labels, ownership,
 * classification overrides and rules. Keyed by opaque account keys, never account numbers.
 * Persisted in this browser for now; M5 moves it into the app's own Google Sheet.
 */

export interface Person {
  id: string;
  name: string;
}

export interface SettingsState {
  people: Person[];
  /**
   * Names (yours, family's) that appear on e-Transfers/transfers between people in your circle.
   * Matching transactions count as moving money, not spending or income.
   */
  circle: string[];
  setCircle(names: string[]): void;
  /** Transaction ids the user excluded from room calculations (e.g. TFSA→TFSA institution transfers). */
  roomExclusions: string[];
  /** accountKey → person ids. Missing = first person. */
  accountOwners: Record<string, string[]>;
  /** accountKey → custom display name. */
  accountLabels: Record<string, string>;
  /**
   * accountKey → last day the account counts (ISO date). Closed accounts drop out of balances,
   * holdings and account lists, but keep their past net-worth history and transactions.
   */
  closedAccounts: Record<string, string>;
  instrumentOverrides: Record<string, InstrumentOverride>;
  /** instrumentKey → market-data symbol, for funds without a ticker (or a better proxy). */
  marketLinks: Record<string, string>;
  /** instrumentKey → the fee you actually pay (fraction), e.g. a pension plan's fee from your statement. */
  feeOverrides: Record<string, number>;
  /** Marginal tax rate (fraction) used for cost and tax estimates. */
  taxRate: number;
  rules: Rule[];
  /** Used to show ages on the projections page. */
  birthYear: number | null;

  setBirthYear(year: number | null): void;
  addPerson(name: string): void;
  renamePerson(id: string, name: string): void;
  removePerson(id: string): void;
  setAccountOwners(accountKey: string, owners: string[]): void;
  setAccountLabel(accountKey: string, label: string): void;
  /** Pass null to reopen. */
  setAccountClosed(accountKey: string, lastDay: string | null): void;
  setInstrumentOverride(instrumentKey: string, o: InstrumentOverride | null): void;
  setMarketLink(instrumentKey: string, symbol: string | null): void;
  setFeeOverride(instrumentKey: string, fee: number | null): void;
  setTaxRate(rate: number): void;
  setRules(rules: Rule[]): void;
  toggleRoomExclusion(txnId: string): void;
}

const newId = () => Math.random().toString(36).slice(2, 10);

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      people: [{ id: "me", name: "Me" }],
      accountOwners: {},
      accountLabels: {},
      closedAccounts: {},
      instrumentOverrides: {},
      marketLinks: {},
      feeOverrides: {},
      taxRate: 0.33,
      setTaxRate: (taxRate) => set({ taxRate }),
      rules: [],
      roomExclusions: [],
      circle: [],
      birthYear: null,
      setBirthYear: (birthYear) => set({ birthYear }),
      setCircle: (circle) => set({ circle: circle.map((n) => n.trim()).filter(Boolean) }),

      addPerson: (name) => set((s) => ({ people: [...s.people, { id: newId(), name }] })),
      renamePerson: (id, name) => set((s) => ({ people: s.people.map((p) => (p.id === id ? { ...p, name } : p)) })),
      removePerson: (id) =>
        set((s) => {
          if (s.people.length <= 1) return s;
          const accountOwners = Object.fromEntries(
            Object.entries(s.accountOwners).map(([k, owners]) => [k, owners.filter((o) => o !== id)]),
          );
          return { people: s.people.filter((p) => p.id !== id), accountOwners };
        }),
      setAccountOwners: (accountKey, owners) => set((s) => ({ accountOwners: { ...s.accountOwners, [accountKey]: owners } })),
      setAccountLabel: (accountKey, label) =>
        set((s) => {
          const accountLabels = { ...s.accountLabels };
          if (label.trim()) accountLabels[accountKey] = label.trim();
          else delete accountLabels[accountKey];
          return { accountLabels };
        }),
      setAccountClosed: (accountKey, lastDay) =>
        set((s) => {
          const closedAccounts = { ...s.closedAccounts };
          if (lastDay) closedAccounts[accountKey] = lastDay;
          else delete closedAccounts[accountKey];
          return { closedAccounts };
        }),
      setInstrumentOverride: (key, o) =>
        set((s) => {
          const instrumentOverrides = { ...s.instrumentOverrides };
          if (o) instrumentOverrides[key] = o;
          else delete instrumentOverrides[key];
          return { instrumentOverrides };
        }),
      setMarketLink: (key, symbol) =>
        set((s) => {
          const marketLinks = { ...s.marketLinks };
          if (symbol?.trim()) marketLinks[key] = symbol.trim().toUpperCase();
          else delete marketLinks[key];
          return { marketLinks };
        }),
      setFeeOverride: (key, fee) =>
        set((s) => {
          const feeOverrides = { ...s.feeOverrides };
          if (fee !== null && Number.isFinite(fee)) feeOverrides[key] = fee;
          else delete feeOverrides[key];
          return { feeOverrides };
        }),
      setRules: (rules) => set({ rules }),
      toggleRoomExclusion: (id) =>
        set((s) => ({
          roomExclusions: s.roomExclusions.includes(id) ? s.roomExclusions.filter((x) => x !== id) : [...s.roomExclusions, id],
        })),
    }),
    { name: "financials-settings", version: 1, storage: createJSONStorage(() => localStorage) },
  ),
);

/** The subset of settings the dataset builder needs (plain data, testable without React). */
export type BuildSettings = Pick<SettingsState, "people" | "accountOwners" | "accountLabels" | "instrumentOverrides" | "rules"> &
  Partial<Pick<SettingsState, "circle" | "closedAccounts">>;
