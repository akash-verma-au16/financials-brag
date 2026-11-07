import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { projectGrowth, toReal } from "./finance-math";
import type { Account } from "./model";

/**
 * Projection groups: any set of accounts projected together (TFSA, RRSP + pensions, FHSA,
 * or custom), each with its own contributions. Three return scenarios (low / expected / high).
 */

export interface Rates {
  low: number;
  mid: number;
  high: number;
}

export type Preset = "conservative" | "moderate" | "aggressive" | "custom";

export const PRESETS: Record<Exclude<Preset, "custom">, { label: string; rates: Rates; hint: string }> = {
  conservative: { label: "Conservative", rates: { low: 0.02, mid: 0.04, high: 0.055 }, hint: "Mostly bonds / balanced" },
  moderate: { label: "Moderate", rates: { low: 0.035, mid: 0.06, high: 0.08 }, hint: "Balanced growth (~60–80% stocks)" },
  aggressive: { label: "Aggressive", rates: { low: 0.04, mid: 0.08, high: 0.11 }, hint: "All-equity" },
};

export interface ProjGroup {
  id: string;
  name: string;
  /** Kind drives defaults and the FHSA rollover; "custom" for user groups. */
  kind: "tfsa" | "retirement" | "fhsa" | "custom";
  accountKeys: string[];
  annualContribution: number;
  contributionGrowth: number;
  contributeYears?: number;
  contributionCap?: number;
  /** Per-group return assumptions; null = use the global ones. */
  rates: Rates | null;
}

export interface ProjState {
  years: number;
  preset: Preset;
  rates: Rates;
  inflation: number;
  real: boolean;
  interval: 1 | 5 | 10;
  fhsaIntoRetirement: boolean;
  groups: ProjGroup[];
  /** Group ids shown on the chart/table. */
  visible: string[];
  set(p: Partial<Omit<ProjState, "set" | "updateGroup" | "addGroup" | "removeGroup">>): void;
  updateGroup(id: string, p: Partial<ProjGroup>): void;
  addGroup(g: ProjGroup): void;
  removeGroup(id: string): void;
}

export const RETIREMENT_TYPES = new Set(["rrsp", "rpp", "dpsp", "epsp", "lira", "lrsp", "rrif", "lif", "spousal rrsp", "group rrsp", "pension", "dc", "db"]);

export function defaultGroups(accounts: Account[]): ProjGroup[] {
  const keys = (pred: (a: Account) => boolean) => accounts.filter(pred).map((a) => a.key);
  return [
    { id: "tfsa", name: "TFSA", kind: "tfsa", accountKeys: keys((a) => a.type === "tfsa"), annualContribution: 7000, contributionGrowth: 0, rates: null },
    { id: "retirement", name: "RRSP + pensions", kind: "retirement", accountKeys: keys((a) => RETIREMENT_TYPES.has(a.type)), annualContribution: 0, contributionGrowth: 0.02, rates: null },
    { id: "fhsa", name: "FHSA", kind: "fhsa", accountKeys: keys((a) => a.type === "fhsa"), annualContribution: 8000, contributionGrowth: 0, contributionCap: 40000, rates: null },
  ];
}

export const useProjections = create<ProjState>()(
  persist(
    (set) => ({
      years: 25,
      preset: "moderate",
      rates: PRESETS.moderate.rates,
      inflation: 0.025,
      real: false,
      interval: 5,
      fhsaIntoRetirement: false,
      groups: [],
      visible: ["tfsa", "retirement", "fhsa"],
      set: (p) => set(p),
      updateGroup: (id, p) => set((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, ...p } : g)) })),
      addGroup: (g) => set((s) => ({ groups: [...s.groups, g], visible: [...s.visible, g.id] })),
      removeGroup: (id) => set((s) => ({ groups: s.groups.filter((g) => g.id !== id), visible: s.visible.filter((v) => v !== id) })),
    }),
    { name: "financials-projections", version: 1, storage: createJSONStorage(() => localStorage) },
  ),
);

export interface GroupProjection {
  id: string;
  name: string;
  start: number;
  low: number[];
  mid: number[];
  high: number[];
  contributed: number[];
}

/** Projects each group under the three scenarios; values in nominal or today's dollars. */
export function runProjections(
  groups: ProjGroup[],
  valueOf: (accountKey: string) => number,
  s: Pick<ProjState, "years" | "rates" | "inflation" | "real">,
  contributedSoFar: (g: ProjGroup) => number = () => 0,
): GroupProjection[] {
  return groups.map((g) => {
    const start = g.accountKeys.reduce((sum, k) => sum + valueOf(k), 0);
    const r = g.rates ?? s.rates;
    const run = (rate: number) =>
      projectGrowth({
        start,
        annualContribution: g.annualContribution,
        contributionGrowth: g.contributionGrowth,
        rate,
        years: s.years,
        contributeYears: g.contributeYears,
        contributionCap: g.contributionCap,
        contributedSoFar: contributedSoFar(g),
      });
    const adj = (ys: ReturnType<typeof projectGrowth>) => ys.map((y) => (s.real ? toReal(y.value, s.inflation, y.year) : y.value));
    const mid = run(r.mid);
    // In today's dollars, each year's new contributions are deflated too, so growth stays comparable.
    let realSum = 0;
    const contributed = mid.map((y, i) => {
      if (!s.real) return y.contributed;
      realSum += toReal(y.contributed - (mid[i - 1]?.contributed ?? 0), s.inflation, y.year);
      return realSum;
    });
    return { id: g.id, name: g.name, start, low: adj(run(r.low)), mid: adj(mid), high: adj(run(r.high)), contributed };
  });
}

/** Sum of several projections, element-wise. */
export function sumProjections(ps: GroupProjection[], id: string, name: string): GroupProjection {
  const add = (k: "low" | "mid" | "high" | "contributed") => (ps[0]?.[k] ?? []).map((_, i) => ps.reduce((s, p) => s + (p[k][i] ?? 0), 0));
  return { id, name, start: ps.reduce((s, p) => s + p.start, 0), low: add("low"), mid: add("mid"), high: add("high"), contributed: add("contributed") };
}
