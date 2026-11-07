import type { AssetClass, Dataset, Instrument, Region } from "./model";
import { scopePositions } from "./select";

/** Positions merged across accounts, per instrument, for the selected person. */

export interface HoldingLot {
  accountKey: string;
  accountName: string;
  quantity: number | null;
  bookValue: number | null;
  marketValue: number;
}

export interface Holding {
  instrument: Instrument;
  quantity: number | null;
  marketValue: number;
  /** Null when any lot lacks a book value — a partial cost would overstate the gain. */
  bookValue: number | null;
  gain: number | null;
  gainPct: number | null;
  weight: number;
  lots: HoldingLot[];
}

/** `accountKey` narrows to one account (weights are then within that account). */
export function holdings(ds: Dataset, person: string, accountKey?: string | null): Holding[] {
  const names = new Map(ds.accounts.map((a) => [a.key, a.name]));
  const byInst = new Map<string, HoldingLot[]>();
  for (const p of scopePositions(ds, person)) {
    if (accountKey && p.accountKey !== accountKey) continue;
    const lot: HoldingLot = {
      accountKey: p.accountKey,
      accountName: names.get(p.accountKey) ?? "Unknown account",
      quantity: p.quantity === null ? null : p.quantity * p.share,
      bookValue: p.bookValue === null ? null : p.bookValue * p.share,
      marketValue: p.marketValue * p.share,
    };
    const list = byInst.get(p.instrumentKey);
    if (list) list.push(lot);
    else byInst.set(p.instrumentKey, [lot]);
  }
  const total = [...byInst.values()].flat().reduce((s, l) => s + l.marketValue, 0) || 1;
  const out: Holding[] = [];
  for (const [key, lots] of byInst) {
    const instrument = ds.instruments.get(key);
    if (!instrument) continue;
    const marketValue = lots.reduce((s, l) => s + l.marketValue, 0);
    const bookValue = lots.every((l) => l.bookValue !== null) ? lots.reduce((s, l) => s + l.bookValue!, 0) : null;
    const quantity = lots.every((l) => l.quantity !== null) ? lots.reduce((s, l) => s + l.quantity!, 0) : null;
    const gain = bookValue !== null && bookValue > 0 ? marketValue - bookValue : null;
    out.push({
      instrument,
      quantity,
      marketValue,
      bookValue,
      gain,
      gainPct: gain !== null && bookValue ? gain / bookValue : null,
      weight: marketValue / total,
      lots: lots.sort((a, b) => b.marketValue - a.marketValue),
    });
  }
  return out.sort((a, b) => b.marketValue - a.marketValue);
}

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  equity: "Stocks",
  "fixed-income": "Bonds",
  balanced: "Balanced funds",
  "real-estate": "Real estate",
  cash: "Cash",
  other: "Other",
};

export const REGION_LABEL: Record<Region, string> = {
  CA: "Canada",
  US: "United States",
  intl: "International developed",
  global: "Global",
  emerging: "Emerging markets",
  mixed: "Mixed",
  "n/a": "—",
};
