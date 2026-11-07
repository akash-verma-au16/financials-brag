import type { Account, Dataset, Transaction } from "./model";
import { allAccounts } from "./select";

/** Starting room for one tax year; a missing value means "not known yet". */
export type RoomInputs = { year: number } & Partial<Record<RoomKind, number>>;

/**
 * Registered-account contribution room for one person and tax year.
 * Starting room comes from CRA (contribution-limits.yaml); contributions come from transactions.
 * Registered accounts belong to one person: the account's first owner.
 *
 * - TFSA: room on Jan 1 − contributions this calendar year. Withdrawals come back next Jan 1.
 * - FHSA: participation room for the year − contributions this calendar year.
 * - RRSP: deduction limit − contributions from day 61 of the year to day 60 of the next
 *   (first-60-days contributions belong to the previous tax year).
 * Moves between two accounts of the same type (e.g. TFSA → TFSA) never use room.
 */

export type RoomKind = "tfsa" | "rrsp" | "fhsa";

export const ROOM_LABEL: Record<RoomKind, string> = { tfsa: "TFSA", rrsp: "RRSP", fhsa: "FHSA" };

export interface RoomTxn {
  txn: Transaction;
  account: Account;
  direction: "in" | "out";
  counted: boolean;
  /** Why it isn't counted, or a caution. */
  note?: string;
}

export interface RoomResult {
  kind: RoomKind;
  window: [string, string];
  room: number | null;
  contributed: number;
  withdrawn: number;
  remaining: number | null;
  accounts: Account[];
  txns: RoomTxn[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Day 61 of the year: first day whose RRSP contributions count toward this tax year. */
export const rrspWindowStart = (year: number) => iso(new Date(Date.UTC(year, 0, 61)));

export function windowFor(kind: RoomKind, year: number): [string, string] {
  if (kind === "rrsp") return [rrspWindowStart(year), iso(new Date(Date.UTC(year + 1, 0, 60)))];
  return [`${year}-01-01`, `${year}-12-31`];
}

export function computeRoom(ds: Dataset, personId: string, inputs: RoomInputs, exclusions: ReadonlySet<string>): RoomResult[] {
  const byKey = new Map(allAccounts(ds).map((a) => [a.key, a]));
  const byId = new Map(ds.transactions.map((t) => [t.id, t]));
  const mine = (a: Account) => a.owners[0] === personId;

  return (["tfsa", "rrsp", "fhsa"] as RoomKind[]).map((kind) => {
    const window = windowFor(kind, inputs.year);
    const accounts = allAccounts(ds).filter((a) => a.type === kind && mine(a));
    const keys = new Set(accounts.map((a) => a.key));
    const txns: RoomTxn[] = [];

    for (const t of ds.transactions) {
      if (!keys.has(t.accountKey) || t.date < window[0] || t.date > window[1]) continue;
      const moneyIn = t.kind === "contribution" || (t.kind === "transfer" && t.amount > 0);
      const moneyOut = t.kind === "withdrawal" || (t.kind === "transfer" && t.amount < 0);
      if (!moneyIn && !moneyOut) continue;

      const peer = t.transferPeer ? byKey.get(byId.get(t.transferPeer)?.accountKey ?? "") : undefined;
      let counted = true;
      let note: string | undefined;
      if (peer?.type === kind) {
        counted = false;
        note = `Moved between your ${ROOM_LABEL[kind]}s — doesn’t use room`;
      } else if (exclusions.has(t.id)) {
        counted = false;
        note = "Excluded by you";
      } else if (t.type === "transfer" && !peer) {
        note = "Transfer from outside your connected accounts. If it came from another " + ROOM_LABEL[kind] + ", exclude it.";
      }
      txns.push({ txn: t, account: byKey.get(t.accountKey)!, direction: moneyIn ? "in" : "out", counted, note });
    }

    const contributed = txns.filter((x) => x.counted && x.direction === "in").reduce((s, x) => s + x.txn.amount, 0);
    const withdrawn = txns.filter((x) => x.counted && x.direction === "out").reduce((s, x) => s - x.txn.amount, 0);
    const room = inputs[kind] ?? null;
    return { kind, window, room, contributed, withdrawn, remaining: room === null ? null : room - contributed, accounts, txns };
  });
}
