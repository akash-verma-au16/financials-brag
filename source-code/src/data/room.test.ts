import { describe, expect, it } from "vitest";
import type { Account, Dataset, Transaction } from "./model";
import repoLimits from "../../contribution-limits.example.yaml?raw"; // test-only: checks the shipped template parses; the app never bundles this file
import { computeRoom, rrspWindowStart, windowFor } from "./room";
import { parseLimits } from "./limits";

const acct = (key: string, type: string, owners = ["me"]): Account => ({
  key, last4: "", institution: "X", type, name: key, currency: "CAD", balance: 0, asOf: "2026-10-13", bucket: "investments", tax: "tax-free", owners,
});
const txn = (id: string, accountKey: string, date: string, amount: number, kind: Transaction["kind"], extra: Partial<Transaction> = {}): Transaction => ({
  id, accountKey, date, settleDate: date, amount, kind, type: "deposit", description: "", symbol: null, quantity: null, ...extra,
});

const ds: Dataset = {
  accounts: [acct("chq", "chequing"), acct("tfsa1", "tfsa"), acct("tfsa2", "tfsa"), acct("rrsp", "rrsp"), acct("fhsa", "fhsa"), acct("p2tfsa", "tfsa", ["p2"])],
  positions: [],
  transactions: [
    txn("a", "tfsa1", "2026-02-01", 3000, "transfer", { transferPeer: "a0" }),
    txn("a0", "chq", "2026-02-01", -3000, "transfer", { transferPeer: "a" }),
    txn("b", "tfsa2", "2026-03-01", 500, "transfer", { transferPeer: "b0" }),
    txn("b0", "tfsa1", "2026-03-01", -500, "transfer", { transferPeer: "b" }),
    txn("c", "tfsa1", "2026-04-01", -200, "withdrawal"),
    txn("d", "tfsa1", "2026-05-01", 1000, "contribution", { type: "transfer" }),
    txn("e", "rrsp", "2026-02-15", 4000, "contribution"), // first 60 days: previous tax year
    txn("f", "rrsp", "2026-06-01", 2500, "contribution"),
    txn("g", "rrsp", "2027-02-10", 1000, "contribution"), // first 60 days of next year: counts
    txn("h", "fhsa", "2026-01-10", 8000, "contribution"),
    txn("i", "p2tfsa", "2026-01-10", 7000, "contribution"), // someone else's
    txn("j", "tfsa1", "2025-12-30", 999, "contribution"), // last year
  ],
  instruments: new Map(),
  asOf: "2026-10-13",
  issues: [],
};

describe("parseLimits", () => {
  it("reads numbers and treats blanks as unknown", () => {
    const l = parseLimits("types:\n  tfsa:\n    description: Room on Jan 1\nyears:\n  2026:\n    tfsa: 18500.25\n    rrsp: 9850\n    fhsa:\n  2027:\n");
    expect(l.years[2026]).toEqual({ tfsa: 18500.25, rrsp: 9850, fhsa: undefined });
    expect(l.years[2027]).toEqual({ tfsa: undefined, rrsp: undefined, fhsa: undefined });
    expect(l.descriptions.tfsa).toBe("Room on Jan 1");
  });

  it("parses the real file shape in the repo", () => {
    const l = parseLimits(repoLimits);
    // Shape only — the figures are yours to change.
    const years = Object.keys(l.years).map(Number);
    expect(years.length).toBeGreaterThan(0);
    expect(years.every((y) => Number.isInteger(y) && y >= 2000)).toBe(true);
    for (const y of years) for (const v of Object.values(l.years[y]!)) expect(v === undefined || Number.isFinite(v)).toBe(true);
  });

  it("totals contributions even when the limit is unknown", () => {
    const [tfsa] = computeRoom(ds, "me", { year: 2026 }, new Set());
    expect(tfsa!.room).toBeNull();
    expect(tfsa!.remaining).toBeNull();
    expect(tfsa!.contributed).toBe(4000);
  });
});

describe("windows", () => {
  it("uses the 60-day RRSP rule", () => {
    expect(rrspWindowStart(2026)).toBe("2026-03-02");
    expect(rrspWindowStart(2028)).toBe("2028-03-01"); // leap year
    expect(windowFor("rrsp", 2026)).toEqual(["2026-03-02", "2027-03-01"]);
  });
});

describe("computeRoom", () => {
  const [tfsa, rrsp, fhsa] = computeRoom(ds, "me", { year: 2026, tfsa: 20000, rrsp: 11000, fhsa: 16000 }, new Set());

  it("counts transfers from chequing, skips TFSA→TFSA moves, tracks withdrawals", () => {
    expect(tfsa!.contributed).toBe(4000); // 3000 from chequing + 1000 unmatched transfer
    expect(tfsa!.withdrawn).toBe(200);
    expect(tfsa!.remaining).toBe(16000);
    expect(tfsa!.txns.find((x) => x.txn.id === "b")!.counted).toBe(false);
    expect(tfsa!.txns.find((x) => x.txn.id === "d")!.note).toMatch(/exclude/);
  });

  it("applies the RRSP window and FHSA calendar year", () => {
    expect(rrsp!.contributed).toBe(3500);
    expect(rrsp!.remaining).toBe(7500);
    expect(fhsa!.remaining).toBe(8000);
  });

  it("honours user exclusions and per-person ownership", () => {
    const [t2] = computeRoom(ds, "me", { year: 2026, tfsa: 20000 }, new Set(["d"]));
    expect(t2!.contributed).toBe(3000);
    const [p2] = computeRoom(ds, "p2", { year: 2026, tfsa: 7000 }, new Set());
    expect(p2!.remaining).toBe(0);
  });
});
