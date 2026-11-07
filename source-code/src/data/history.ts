import type { Bucket, Dataset } from "./model";
import { shareOf } from "./select";

/**
 * Net worth over time.
 * - Actual: daily snapshots the app saves to data/history.csv in the repo (one per account per balance date).
 * - Estimated: before the first snapshot, balances are rolled back from today using transactions.
 *   Cash/credit accounts: exact (every transaction moves the balance).
 *   Investment/retirement accounts: only external money in/out is reversed, so market moves are
 *   ignored — shown as an estimate.
 */

export interface SnapshotRow {
  date: string;
  recordedAt: string;
  accountKey: string;
  bucket: string;
  balance: number;
}

const HEADER = "date,recordedAt,accountKey,bucket,balance";
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const historyCsv = (rows: SnapshotRow[]) =>
  [HEADER, ...rows.map((r) => [r.date, r.recordedAt, csvCell(r.accountKey), r.bucket, r.balance.toFixed(2)].join(","))].join("\n") + "\n";

export function parseHistoryCsv(text: string): SnapshotRow[] {
  const out: SnapshotRow[] = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    // accountKey may be quoted (it can contain commas); the other fields never are.
    const m = line.match(/^([^,]*),([^,]*),("(?:[^"]|"")*"|[^,]*),([^,]*),([^,]*)$/);
    if (!m) continue;
    const key = m[3]!.startsWith('"') ? m[3]!.slice(1, -1).replace(/""/g, '"') : m[3]!;
    const balance = Number(m[5]);
    if (Number.isFinite(balance)) out.push({ date: m[1]!, recordedAt: m[2]!, accountKey: key, bucket: m[4]!, balance });
  }
  return out;
}

export interface HistoryPoint {
  date: string;
  net: number;
  assets: number;
  debt: number;
  byBucket: Record<Bucket, number>;
  estimated: boolean;
}

/** Rows to append: accounts whose balance for their as-of date is new or changed. */
export function snapshotsToAppend(ds: Dataset, existing: SnapshotRow[], now = new Date().toISOString()): SnapshotRow[] {
  const latest = latestByDateAccount(existing);
  return ds.accounts
    .filter((a) => a.asOf)
    .filter((a) => {
      const prev = latest.get(a.asOf)?.get(a.key);
      return prev === undefined || Math.abs(prev.balance - a.balance) > 0.005;
    })
    .map((a) => ({ date: a.asOf, recordedAt: now, accountKey: a.key, bucket: a.bucket, balance: Math.round(a.balance * 100) / 100 }));
}

function latestByDateAccount(rows: SnapshotRow[]): Map<string, Map<string, SnapshotRow>> {
  const out = new Map<string, Map<string, SnapshotRow>>();
  for (const r of rows) {
    const m = out.get(r.date) ?? out.set(r.date, new Map()).get(r.date)!;
    const prev = m.get(r.accountKey);
    if (!prev || prev.recordedAt <= r.recordedAt) m.set(r.accountKey, r);
  }
  return out;
}

const emptyBuckets = (): Record<Bucket, number> => ({ cash: 0, investments: 0, retirement: 0, debt: 0 });

function point(date: string, values: Iterable<[bucket: Bucket, value: number]>, estimated: boolean): HistoryPoint {
  const byBucket = emptyBuckets();
  let assets = 0;
  let debt = 0;
  for (const [b, v] of values) {
    byBucket[b] += v;
    if (v >= 0) assets += v;
    else debt += v;
  }
  return { date, net: assets + debt, assets, debt, byBucket, estimated };
}

/** Last day of each month from `from` up to (not including) `before`. */
function monthEnds(from: string, before: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  for (;;) {
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    if (end >= before) break;
    out.push(end);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function buildHistory(ds: Dataset, snapshots: SnapshotRow[], person: string): HistoryPoint[] {
  // Closed accounts count up to their last day, then drop out.
  const accounts = [...ds.accounts, ...(ds.closedAccounts ?? [])].map((a) => ({ a, share: shareOf(a, person) })).filter((x) => x.share > 0);
  const keys = new Map(accounts.map((x) => [x.a.key, x]));
  const counts = (key: string, date: string) => {
    const closedOn = keys.get(key)?.a.closedOn;
    return !closedOn || date <= closedOn;
  };

  // ── Actual points: carry each account's latest snapshot forward. ──
  // A closed account's last balance from the sheet stands in for a snapshot (a saved one on that date wins).
  const lastBalances: SnapshotRow[] = (ds.closedAccounts ?? [])
    .filter((a) => a.asOf)
    .map((a) => ({ date: a.asOf, recordedAt: "", accountKey: a.key, bucket: a.bucket, balance: a.balance }));
  const latest = latestByDateAccount([...lastBalances, ...snapshots].filter((s) => keys.has(s.accountKey)));
  const snapDates = [...latest.keys()].sort();
  const actual: HistoryPoint[] = [];
  const carry = new Map<string, { bucket: Bucket; value: number }>();
  for (const d of snapDates) {
    for (const [k, r] of latest.get(d)!) {
      const x = keys.get(k)!;
      carry.set(k, { bucket: x.a.bucket, value: r.balance * x.share });
    }
    actual.push(point(d, [...carry].filter(([k]) => counts(k, d)).map(([, c]) => [c.bucket, c.value]), false));
  }

  // Today's balances are always an actual point.
  const today = ds.asOf;
  const now = () => accounts.filter(({ a }) => counts(a.key, today!)).map(({ a, share }): [Bucket, number] => [a.bucket, a.balance * share]);
  if (today && (!actual.length || actual.at(-1)!.date < today)) {
    actual.push(point(today, now(), false));
  } else if (today && actual.at(-1)!.date === today) {
    actual[actual.length - 1] = point(today, now(), false);
  }

  // ── Estimated month-ends before the first actual point. ──
  const firstActual = actual[0]?.date ?? today ?? "";
  const firstTxn = ds.transactions.at(-1)?.date;
  if (!firstTxn || firstTxn >= firstActual) return actual;

  const affects = (bucket: Bucket, kind: string) =>
    bucket === "cash" || bucket === "debt"
      ? kind !== "ignore"
      : kind === "contribution" || kind === "withdrawal" || kind === "transfer";

  // Start at the month-end before the first transaction: the earliest balance we can derive.
  const [fy, fm] = [Number(firstTxn.slice(0, 4)), Number(firstTxn.slice(5, 7))];
  const start = new Date(Date.UTC(fy, fm - 2, 1)).toISOString().slice(0, 10);
  const estimated = monthEnds(start, firstActual).map((d) => {
    const values = new Map(accounts.map(({ a }) => [a.key, a.balance]));
    for (const t of ds.transactions) {
      if (t.date <= d) break; // transactions are sorted newest first
      const x = keys.get(t.accountKey);
      if (!x || !affects(x.a.bucket, t.kind)) continue;
      values.set(t.accountKey, values.get(t.accountKey)! - t.amount);
    }
    return point(
      d,
      accounts.filter(({ a }) => counts(a.key, d)).map(({ a, share }) => [a.bucket, a.bucket === "debt" ? Math.min(values.get(a.key)!, 0) * share : Math.max(values.get(a.key)!, 0) * share]),
      true,
    );
  });

  return [...estimated, ...actual];
}

/** Change in net worth over the last `days`, using the closest earlier point. */
export function changeOver(points: HistoryPoint[], days: number): { change: number; pct: number | null; from: HistoryPoint } | null {
  const last = points.at(-1);
  if (!last) return null;
  const cutoff = new Date(Date.parse(`${last.date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  const from = [...points].reverse().find((p) => p.date <= cutoff);
  if (!from) return null;
  const change = last.net - from.net;
  return { change, pct: from.net > 0 ? change / from.net : null, from };
}
