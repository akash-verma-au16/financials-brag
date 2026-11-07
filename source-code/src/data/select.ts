import type { Account, Bucket, Dataset, Position, Transaction } from "./model";

/**
 * Per-person views. Joint accounts are split equally between their owners, so each
 * person's numbers add up to the household total.
 */

export interface ScopedAccount extends Account {
  /** Fraction of this account attributed to the selected scope (1 for the household). */
  share: number;
  /** balance × share */
  value: number;
}

export function shareOf(account: Account, person: string): number {
  if (person === "all") return 1;
  return account.owners.includes(person) ? 1 / account.owners.length : 0;
}

/** Open and closed accounts: for looking up the account behind a past transaction. */
export const allAccounts = (ds: Dataset): Account[] => [...ds.accounts, ...(ds.closedAccounts ?? [])];

export function scopeAccounts(ds: Dataset, person: string): ScopedAccount[] {
  return ds.accounts
    .map((a) => {
      const share = shareOf(a, person);
      return { ...a, share, value: a.balance * share };
    })
    .filter((a) => a.share > 0);
}

export function scopePositions(ds: Dataset, person: string): (Position & { share: number })[] {
  const shares = new Map(ds.accounts.map((a) => [a.key, shareOf(a, person)]));
  return ds.positions
    .map((p) => ({ ...p, share: shares.get(p.accountKey) ?? (person === "all" ? 1 : 0) }))
    .filter((p) => p.share > 0);
}

export function scopeTransactions(ds: Dataset, person: string): (Transaction & { share: number })[] {
  const shares = new Map(allAccounts(ds).map((a) => [a.key, shareOf(a, person)]));
  return ds.transactions
    .map((t) => ({ ...t, share: shares.get(t.accountKey) ?? (person === "all" ? 1 : 0) }))
    .filter((t) => t.share > 0);
}

export const BUCKETS: { id: Bucket; label: string; hint: string }[] = [
  { id: "cash", label: "Cash", hint: "Chequing, savings and cash accounts" },
  { id: "investments", label: "Investments", hint: "TFSA, FHSA, non-registered and brokerage accounts" },
  { id: "retirement", label: "Retirement", hint: "RRSP and employer pension plans, locked until retirement" },
  { id: "debt", label: "Debt", hint: "Credit cards and loans" },
];

export interface NetWorth {
  assets: number;
  liabilities: number; // ≤ 0
  net: number;
  byBucket: Record<Bucket, number>;
}

export function netWorth(accounts: ScopedAccount[]): NetWorth {
  const byBucket: Record<Bucket, number> = { cash: 0, investments: 0, retirement: 0, debt: 0 };
  let assets = 0;
  let liabilities = 0;
  for (const a of accounts) {
    byBucket[a.bucket] += a.value;
    if (a.value >= 0) assets += a.value;
    else liabilities += a.value;
  }
  return { assets, liabilities, net: assets + liabilities, byBucket };
}

/** Sum of values grouped by a key, largest first. */
export function groupSum<T>(items: T[], key: (t: T) => string, value: (t: T) => number): { key: string; value: number }[] {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + value(it));
  return [...m.entries()].map(([k, v]) => ({ key: k, value: v })).sort((a, b) => b.value - a.value);
}
