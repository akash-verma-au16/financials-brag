import type { Account, Bucket, Dataset, DataIssue, Instrument, Position, TaxTreatment, Transaction, TxnKind } from "./model";
import type { BuildSettings } from "./settings";
import type { Table } from "./table";
import { classifyInstrument, instrumentKey, symbolCanonicaliser } from "./instruments";
import { categorise } from "./categories";
import type { StatementAccount } from "./statement-types";

/** Builds the domain dataset from detected Wealthica exports. Pure: no I/O, no React. */

export interface SourceTables {
  balances: Table[];
  positions: Table[];
  transactions: Table[];
  /** Accounts from statement files (statements/ folder), merged with Wealthica by institution + last 4. */
  statements?: StatementAccount[];
}

// ── Account classification ────────────────────────────────────────────────────

const DEBT = /^(credit|loan|mortgage|loc|heloc|line of credit|creditline)$/;
const CASH = /^(chequing|checking|savings|hisa|cash)$/;
const RETIREMENT = /^(rrsp|spousal rrsp|group rrsp|rpp|dpsp|lira|lrsp|rrif|lif|prif|pension|dc|db)$/;
const TAX_FREE = /^(tfsa|fhsa)$/;
const TAX_DEFERRED = /^(rrsp|spousal rrsp|group rrsp|rpp|dpsp|lira|lrsp|rrif|lif|prif|resp|pension|dc|db)$/;

export function bucketFor(type: string, holdsSecurities: boolean): Bucket {
  if (DEBT.test(type)) return "debt";
  if (RETIREMENT.test(type)) return "retirement";
  if (CASH.test(type) && !holdsSecurities) return "cash";
  return "investments";
}

export function taxFor(type: string): TaxTreatment {
  if (DEBT.test(type)) return "n/a";
  if (TAX_FREE.test(type)) return "tax-free";
  if (TAX_DEFERRED.test(type)) return "tax-deferred";
  return "taxable";
}

// Opaque, stable keys so raw account numbers aren't stored.
import { hashKey } from "../../tools/hash.ts";
export { hashKey };

const accountKeyOf = (institution: string, number: string) => `a_${hashKey(`${institution.trim().toLowerCase()}|${number.trim()}`)}`;

const last4Of = (number: string) => number.replace(/[^0-9A-Za-z]/g, "").replace(/CAD$|USD$/, "").slice(-4);

export const shortInstitution = (s: string) =>
  s.replace(/\s+(Online Banking|Financial|Direct Investing)$/i, "").trim() || s;

const TYPE_LABEL: Record<string, string> = {
  chequing: "Chequing", savings: "Savings", credit: "Credit card", cash: "Cash (non-registered)", tfsa: "TFSA", rrsp: "RRSP", fhsa: "FHSA",
  nrsp: "Non-registered", rpp: "Pension (RPP)", dpsp: "DPSP", epsp: "EPSP", resp: "RESP", lira: "LIRA", rrif: "RRIF",
};
export const accountTypeLabel = (t: string) => TYPE_LABEL[t] ?? t.toUpperCase();

// ── Transactions ──────────────────────────────────────────────────────────────

const IGNORE_TYPES = new Set(["loan", "recall", "mark to market"]);
const TRADE_TYPES = new Set(["buy", "sell", "reinvested"]);
const INCOME_TYPES = new Set(["dividend", "distribution", "interest"]);
const MOVE_TYPES = new Set(["deposit", "withdrawal", "transfer"]);

const TRANSFER_WINDOW_DAYS = 5;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const cents = (x: number) => Math.round(Math.abs(x) * 100);

/**
 * Pairs opposite legs between two different own accounts: same absolute amount (to the cent),
 * within TRANSFER_WINDOW_DAYS. Greedy by closest date; deterministic order.
 */
export function matchTransfers(candidates: Transaction[]): Map<string, string> {
  const pairs = new Map<string, string>();
  const outflows = new Map<number, Transaction[]>();
  for (const t of candidates) {
    if (t.amount >= 0) continue;
    const list = outflows.get(cents(t.amount));
    if (list) list.push(t);
    else outflows.set(cents(t.amount), [t]);
  }

  const inflows = candidates.filter((t) => t.amount > 0).sort((x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id));
  for (const inn of inflows) {
    const pool = outflows.get(cents(inn.amount));
    if (!pool) continue;
    let best = -1;
    let bestGap = Infinity;
    pool.forEach((out, i) => {
      if (out.accountKey === inn.accountKey || pairs.has(out.id)) return;
      const gap = Math.abs(dayNumber(out.date) - dayNumber(inn.date));
      if (gap <= TRANSFER_WINDOW_DAYS && gap < bestGap) {
        best = i;
        bestGap = gap;
      }
    });
    if (best >= 0) {
      const out = pool[best]!;
      pairs.set(inn.id, out.id).set(out.id, inn.id);
      pool.splice(best, 1);
    }
  }
  return pairs;
}

function signed(type: string, amount: number): number {
  if (type === "deposit") return Math.abs(amount);
  if (type === "withdrawal") return -Math.abs(amount);
  return amount;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildDataset(src: SourceTables, settings: BuildSettings): Dataset {
  const issues: DataIssue[] = [];
  if (!src.balances.length) issues.push({ level: "warn", message: "No Balances export found. Add the Wealthica balances sheet to see accounts and net worth." });
  if (!src.positions.length) issues.push({ level: "info", message: "No Positions export found. Holdings and allocation will be empty." });
  if (!src.transactions.length) issues.push({ level: "info", message: "No Transactions export found. Cash flow and income will be empty." });

  // Raw rows first, so symbol canonicalisation and "holds securities" can see everything.
  const rawPositions = src.positions.flatMap((t) =>
    t.rows.map((row) => ({
      key: accountKeyOf(t.str(row, "Institution"), t.str(row, "Account Number")),
      symbol: t.str(row, "Symbol") || null,
      name: t.str(row, "Name") || t.str(row, "Symbol") || "Unknown",
      quantity: t.num(row, "Quantity"),
      bookValue: t.num(row, "Book Value"),
      marketValue: t.num(row, "Market Value") ?? t.num(row, "Value") ?? 0,
      asOf: t.str(row, "Date"),
      institution: t.str(row, "Institution"),
      number: t.str(row, "Account Number"),
      type: t.str(row, "Account Type").toLowerCase(),
      accountName: t.str(row, "Account Name"),
    })),
  );
  const rawTxns = src.transactions.flatMap((t) =>
    t.rows.map((row) => ({
      id: t.str(row, "ID"),
      date: t.str(row, "Trade Date"),
      settleDate: t.str(row, "Settlement Date") || t.str(row, "Trade Date"),
      type: t.str(row, "Type").toLowerCase(),
      key: accountKeyOf(t.str(row, "Institution/Asset") || t.str(row, "Institution"), t.str(row, "Account Number")),
      institution: t.str(row, "Institution/Asset") || t.str(row, "Institution"),
      number: t.str(row, "Account Number"),
      accountType: t.str(row, "Account Type").toLowerCase(),
      accountName: t.str(row, "Account Name"),
      description: t.str(row, "Description"),
      amount: t.num(row, "Currency Amount") ?? t.num(row, "Amount") ?? 0,
      symbol: t.str(row, "Symbol") || null,
      quantity: t.num(row, "Quantity"),
    })),
  );

  const canon = symbolCanonicaliser([...rawPositions, ...rawTxns].flatMap((p) => (p.symbol ? [p.symbol] : [])));
  const holdsSecurities = new Set(rawPositions.filter((p) => p.symbol || !/^cash$/i.test(p.name)).map((p) => p.key));
  const defaultOwner = settings.people[0]?.id;
  const personIds = new Set(settings.people.map((p) => p.id));

  // Accounts: balances rows, latest date wins when an account appears more than once.
  const accounts = new Map<string, Account>();
  const makeAccount = (institution: string, number: string, type: string, name: string, balance: number, asOf: string, currency = "CAD"): Account => {
    const key = accountKeyOf(institution, number);
    const bucket = bucketFor(type, holdsSecurities.has(key));
    const last4 = last4Of(number);
    const owners = (settings.accountOwners[key] ?? []).filter((o) => personIds.has(o));
    return {
      key,
      last4,
      institution,
      type,
      name: settings.accountLabels[key] ?? (name || `${shortInstitution(institution)} ${accountTypeLabel(type)}${last4 ? ` ··${last4}` : ""}`),
      currency,
      balance: bucket === "debt" ? -Math.abs(balance) : balance,
      asOf,
      bucket,
      tax: taxFor(type),
      owners: owners.length ? owners : defaultOwner ? [defaultOwner] : [],
    };
  };

  for (const t of src.balances) {
    for (const row of t.rows) {
      const a = makeAccount(
        t.str(row, "Institution"),
        t.str(row, "Account Number"),
        t.str(row, "Account Type").toLowerCase(),
        t.str(row, "Account Name"),
        t.num(row, "Balance") ?? t.num(row, "Currency Balance") ?? 0,
        t.str(row, "Date"),
        t.str(row, "Account Currency") || "CAD",
      );
      const prev = accounts.get(a.key);
      if (!prev || prev.asOf <= a.asOf) accounts.set(a.key, a);
    }
  }

  // Accounts that only appear in positions/transactions (e.g. closed ones) get a stub.
  let stubs = 0;
  const referenced = [
    ...rawPositions.map((p) => ({ ...p, accountType: p.type })),
    ...rawTxns.map((t) => ({ ...t, asOf: t.date })),
  ];
  for (const r of referenced) {
    if (accounts.has(r.key) || !r.number) continue;
    const held = rawPositions.filter((p) => p.key === r.key);
    const value = held.reduce((s, p) => s + p.marketValue, 0);
    accounts.set(r.key, makeAccount(r.institution, r.number, r.accountType, r.accountName, value, held[0]?.asOf ?? r.asOf));
    if (!settings.closedAccounts?.[r.key]) stubs++;
  }
  if (stubs) issues.push({ level: "info", message: `${stubs} account(s) appear in positions or transactions but not in balances (closed or not synced). Shown with their holdings value or zero.` });

  // Statement files: fill gaps Wealthica doesn't cover (other banks' cards and chequing).
  const sameInstitution = (a: string, b: string) => {
    const x = shortInstitution(a).toLowerCase();
    const y = shortInstitution(b).toLowerCase();
    return x === y || x.startsWith(y) || y.startsWith(x);
  };
  for (const sa of src.statements ?? []) {
    const m = sa.meta;
    if (m.pending) {
      issues.push({ level: "info", message: `“${m.name ?? sa.folder}” is waiting for its first statement and isn't counted anywhere yet.` });
      continue;
    }
    const last4 = m.last4 ?? sa.detectedLast4;
    const atBank = [...accounts.values()].filter((a) => sameInstitution(a.institution, m.institution) && a.source !== "statements");
    // By last 4 digits; else the only account of that type at that bank (so balances aren't counted twice).
    const sameType = atBank.filter((a) => a.type === m.type);
    const match = (last4 ? atBank.find((a) => a.last4 === last4) : undefined) ?? (sameType.length === 1 ? sameType[0] : undefined);
    let key: string;
    if (match) {
      key = match.key;
      match.source = "wealthica+statements";
    } else {
      key = `a_${hashKey(`stmt|${sa.folder}`)}`;
      const latest = sa.txns[0]?.date ?? "";
      const bucket = bucketFor(m.type, false);
      const owners = (settings.accountOwners[key] ?? []).filter((o) => personIds.has(o));
      // Balance (cards: amount owed): account.yaml, else opening balance + every transaction since,
      // else the latest statement's closing balance.
      const sum = sa.txns.reduce((s, t) => s + t.amount, 0);
      const fromTxns = m.openingBalance !== undefined ? Math.round((bucket === "debt" ? m.openingBalance - sum : m.openingBalance + sum) * 100) / 100 : undefined;
      const bal = m.balance ?? fromTxns ?? sa.latestBalance?.balance;
      accounts.set(key, {
        key,
        last4: last4 ?? "",
        institution: m.institution,
        type: m.type,
        name: settings.accountLabels[key] ?? m.name ?? `${shortInstitution(m.institution)} ${accountTypeLabel(m.type)}${last4 ? ` ··${last4}` : ""}`,
        currency: "CAD",
        balance: bal === undefined ? 0 : bucket === "debt" ? -bal : bal,
        asOf: m.balance !== undefined ? (m.balanceDate ?? latest) : fromTxns !== undefined ? latest : (sa.latestBalance?.date ?? latest),
        bucket,
        tax: taxFor(m.type),
        owners: owners.length ? owners : defaultOwner ? [defaultOwner] : [],
        source: "statements",
      });
      if (bal === undefined)
        issues.push({ level: "info", message: `Statement account “${sa.folder}” has no balance in its account.yaml, so it counts as $0 in net worth (transactions are still used).` });
    }

    // Skip statement rows Wealthica already has: same account, same cents, within ±2 days.
    const existing = rawTxns.filter((t) => t.key === key).map((t) => ({ day: dayNumber(t.date), cents: Math.round(signed(t.type, t.amount) * 100), used: false }));
    sa.txns.forEach((st, i) => {
      const c = Math.round(st.amount * 100);
      const dup = existing.find((e) => !e.used && e.cents === c && Math.abs(e.day - dayNumber(st.date)) <= 2);
      if (dup) {
        dup.used = true;
        return;
      }
      rawTxns.push({
        id: `s_${hashKey(`${sa.folder}|${st.date}|${st.amount}|${st.description}|${i}`)}`,
        date: st.date,
        settleDate: st.date,
        type: st.amount >= 0 ? "deposit" : "withdrawal",
        key,
        institution: m.institution,
        number: "",
        accountType: m.type,
        accountName: m.name ?? "",
        description: st.description,
        amount: st.amount,
        symbol: null,
        quantity: null,
      });
    });
  }

  // Instruments & positions.
  const instruments = new Map<string, Instrument>();
  const instrumentFor = (symbol: string | null, name: string) => {
    const key = instrumentKey(symbol, name);
    let inst = instruments.get(key);
    if (!inst) {
      inst = classifyInstrument(symbol, name, settings.instrumentOverrides[key]);
      instruments.set(key, inst);
    }
    return inst;
  };
  const positions: Position[] = rawPositions.map((p) => {
    const symbol = canon(p.symbol);
    const inst = instrumentFor(symbol, p.name);
    return { accountKey: p.key, instrumentKey: inst.key, symbol, name: p.name, quantity: p.quantity, bookValue: p.bookValue, marketValue: p.marketValue, asOf: p.asOf };
  });

  // Transactions: dedupe by ID, normalise sign, then classify.
  const seen = new Set<string>();
  const txns: Transaction[] = [];
  for (const r of rawTxns) {
    const id = r.id || `${r.key}|${r.date}|${r.type}|${r.amount}|${r.description}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const symbol = canon(r.symbol);
    if (symbol) instrumentFor(symbol, r.description.split(/\s+\d/)[0] || symbol);
    txns.push({
      id,
      date: r.date,
      settleDate: r.settleDate,
      type: r.type,
      accountKey: r.key,
      description: r.description,
      amount: signed(r.type, r.amount),
      symbol,
      quantity: r.quantity,
      kind: "ignore",
    });
  }
  if (rawTxns.length !== txns.length) issues.push({ level: "info", message: `${rawTxns.length - txns.length} duplicate transaction(s) removed.` });

  const circle = (settings.circle ?? []).map((n) => n.trim().toUpperCase()).filter((n) => n.length >= 3);
  const inCircle = (description: string) => {
    const d = ` ${description.toUpperCase().replace(/[^A-Z0-9]+/g, " ")} `;
    return circle.some((n) => d.includes(` ${n.replace(/[^A-Z0-9]+/g, " ")} `));
  };
  const bucketOf = (key: string) => accounts.get(key)?.bucket ?? "investments";
  const typeOf = (key: string) => accounts.get(key)?.type ?? "";
  const moves = txns.filter((t) => MOVE_TYPES.has(t.type) && t.amount !== 0);
  const pairs = matchTransfers(moves);

  for (const t of txns) {
    let kind: TxnKind;
    const bucket = bucketOf(t.accountKey);
    const household = bucket === "cash" || bucket === "debt";
    if (IGNORE_TYPES.has(t.type)) kind = "ignore";
    else if (TRADE_TYPES.has(t.type)) kind = "trade";
    else if (t.type === "tax") kind = "tax";
    else if (INCOME_TYPES.has(t.type)) kind = t.type === "interest" && (t.amount < 0 || bucket === "debt") ? "flow" : "investment-income";
    else if (MOVE_TYPES.has(t.type)) {
      const peer = pairs.get(t.id);
      if (peer) {
        kind = "transfer";
        t.transferPeer = peer;
      } else kind = household ? "flow" : t.amount >= 0 ? "contribution" : "withdrawal";
    } else kind = household ? "flow" : "ignore";
    t.kind = kind;
    if (kind === "flow") {
      t.category = t.type === "interest" ? "interest-charges" : categorise(t.description, t.amount, typeOf(t.accountKey), settings.rules);
      // Money sent to/received from people in your circle (you, family) is moving money, not spending.
      if (inCircle(t.description)) t.category = "circle-transfer";
    }
  }
  txns.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

  // Closed accounts: out of every present-day view, kept for history.
  const closed = settings.closedAccounts ?? {};
  const closedList = [...accounts.values()].filter((a) => closed[a.key]).map((a) => ({ ...a, closedOn: closed[a.key]! }));
  const openPositions = positions.filter((p) => !closed[p.accountKey]);
  const accountList = [...accounts.values()].filter((a) => !closed[a.key]);
  const asOf = accountList.reduce<string | null>((m, a) => (a.asOf && (!m || a.asOf > m) ? a.asOf : m), null);
  if (asOf) {
    const stale = accountList.filter((a) => a.asOf && dayNumber(asOf) - dayNumber(a.asOf) > 3);
    if (stale.length) issues.push({ level: "warn", message: `${stale.length} account(s) haven't synced in Wealthica for more than 3 days: ${stale.map((a) => a.name).join(", ")}.` });
  }

  return { accounts: accountList, closedAccounts: closedList, positions: openPositions, transactions: txns, instruments, asOf, issues };
}
