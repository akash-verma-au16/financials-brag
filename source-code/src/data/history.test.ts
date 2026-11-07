import { describe, expect, it } from "vitest";
import type { Account, Dataset, Transaction } from "./model";
import { buildHistory, changeOver, historyCsv, parseHistoryCsv, snapshotsToAppend } from "./history";

const acct = (key: string, bucket: Account["bucket"], balance: number, owners = ["me"]): Account => ({
  key, last4: "", institution: "X", type: bucket === "debt" ? "credit" : "chequing", name: key, currency: "CAD", balance, asOf: "2026-10-13", bucket, tax: "taxable", owners,
});
const txn = (id: string, accountKey: string, date: string, amount: number, kind: Transaction["kind"]): Transaction => ({
  id, accountKey, date, settleDate: date, amount, kind, type: "x", description: "", symbol: null, quantity: null,
});

const ds: Dataset = {
  accounts: [acct("chq", "cash", 1000), acct("card", "debt", -200), acct("tfsa", "investments", 10000, ["me", "p2"])],
  positions: [],
  transactions: [
    // newest first, as the builder sorts them
    txn("t4", "tfsa", "2026-09-20", 1000, "contribution"),
    txn("t3", "tfsa", "2026-09-21", 30, "investment-income"), // ignored for investments
    txn("t2", "card", "2026-09-15", -200, "flow"),
    txn("t1", "chq", "2026-09-01", 3000, "flow"),
  ].sort((a, b) => b.date.localeCompare(a.date)),
  instruments: new Map(),
  asOf: "2026-10-13",
  issues: [],
};

describe("snapshotsToAppend", () => {
  it("appends new balances and skips unchanged ones", () => {
    const first = snapshotsToAppend(ds, [], "2026-10-13T10:00:00Z");
    expect(first).toHaveLength(3);
    expect(snapshotsToAppend(ds, first, "2026-10-13T11:00:00Z")).toHaveLength(0);
    const changed = { ...ds, accounts: ds.accounts.map((a) => (a.key === "chq" ? { ...a, balance: 1100 } : a)) };
    expect(snapshotsToAppend(changed, first).map((r) => r.accountKey)).toEqual(["chq"]);
  });
});

describe("buildHistory", () => {
  it("rolls cash and debt back exactly, investments by contributions only", () => {
    const pts = buildHistory(ds, [], "all");
    const aug = pts.find((p) => p.date === "2026-08-31")!;
    expect(aug.estimated).toBe(true);
    expect(aug.byBucket.cash).toBe(0); // 1000 − 3000 would be negative: clamped at zero
    expect(aug.byBucket.debt).toBe(0); // before the card purchase
    expect(aug.byBucket.investments).toBe(9000); // before the 1000 contribution
    expect(pts.at(-1)).toMatchObject({ date: "2026-10-13", net: 10800, estimated: false });
  });

  it("uses saved snapshots as actual points and applies person shares", () => {
    const snaps = [
      { date: "2026-10-01", recordedAt: "a", accountKey: "tfsa", bucket: "investments", balance: 9500 },
      { date: "2026-10-01", recordedAt: "b", accountKey: "tfsa", bucket: "investments", balance: 9600 }, // later wins
    ];
    const pts = buildHistory(ds, snaps, "p2");
    expect(pts.filter((p) => !p.estimated).map((p) => [p.date, p.net])).toEqual([
      ["2026-10-01", 4800],
      ["2026-10-13", 5000],
    ]);
    expect(changeOver(pts, 10)?.change).toBe(200);
  });

  it("counts a closed account up to its last day, then drops it", () => {
    const old = { ...acct("old", "cash", 700), asOf: "2026-10-05", closedOn: "2026-10-05" };
    const withClosed: Dataset = { ...ds, closedAccounts: [old] };
    const snaps = [{ date: "2026-10-01", recordedAt: "a", accountKey: "old", bucket: "cash", balance: 600 }];
    const pts = buildHistory(withClosed, snaps, "all");
    expect(pts.filter((p) => !p.estimated).map((p) => [p.date, p.net])).toEqual([
      ["2026-10-01", 600],
      ["2026-10-05", 700], // its last balance from the sheet
      ["2026-10-13", 10800], // gone after its last day
    ]);
    const sep = (p: typeof pts) => p.find((x) => x.date === "2026-09-30")!.net;
    expect(sep(pts) - sep(buildHistory(ds, [], "all"))).toBe(700);
    expect(snapshotsToAppend(withClosed, []).map((r) => r.accountKey)).not.toContain("old");
  });
});

describe("history file", () => {
  it("round-trips through CSV, including keys with commas and quotes", () => {
    const rows = [
      { date: "2026-10-01", recordedAt: "2026-10-01T12:00:00.000Z", accountKey: 'RBC|chequing, "joint"', bucket: "cash", balance: 1234.5 },
      { date: "2026-10-02", recordedAt: "2026-10-02T12:00:00.000Z", accountKey: "WS|tfsa", bucket: "investments", balance: -0.25 },
    ];
    expect(parseHistoryCsv(historyCsv(rows))).toEqual(rows);
    expect(parseHistoryCsv("")).toEqual([]);
  });
});
