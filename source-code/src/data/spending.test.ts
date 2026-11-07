import { describe, expect, it } from "vitest";
import type { ScopedTxn } from "./cashflow";
import { isLeftOut, lastYearRange, merchants, spendByMonth, needsReview, previousRange, recurring, totalsBy, byParent } from "./spending";

let n = 0;
const t = (date: string, amount: number, description: string, category: string, kind: ScopedTxn["kind"] = "flow"): ScopedTxn => ({
  id: `t${++n}`, date, settleDate: date, type: "x", accountKey: "card", description, amount, symbol: null, quantity: null, kind, category, share: 1,
});

const months = (from: number, count: number, f: (m: string) => ScopedTxn) =>
  Array.from({ length: count }, (_, i) => f(`2026-${String(from + i).padStart(2, "0")}`));

describe("recurring", () => {
  const txns = [
    ...months(1, 9, (m) => t(`${m}-05`, -16.99, "NETFLIX.COM", "streaming")),
    ...months(1, 9, (m) => t(`${m}-01`, -1850, "RENT PAYMENT", "rent")),
    ...months(3, 3, (m) => t(`${m}-10`, -20 - Math.random() * 80, "GROCER #1", "groceries")), // varies too much
    t("2025-03-01", -120, "AMAZON PRIME MEMBERSHIP", "memberships"),
    t("2026-03-01", -129, "AMAZON PRIME MEMBERSHIP", "memberships"),
    ...months(1, 4, (m) => t(`${m}-15`, -45, "OLD GYM", "fitness")), // stopped in April
  ];
  const r = recurring(txns, "2026-09-20");
  const find = (m: string) => r.find((x) => x.merchant === m);

  it("finds monthly and yearly charges with steady amounts", () => {
    expect(find("NETFLIX.COM")).toMatchObject({ frequency: "monthly", active: true });
    expect(find("NETFLIX.COM")!.annualCost).toBeCloseTo(16.99 * 12);
    expect(find("RENT PAYMENT")).toMatchObject({ frequency: "monthly", amount: 1850 });
    expect(find("AMAZON PRIME MEMBERSHIP")).toMatchObject({ frequency: "yearly" });
    expect(find("GROCER")).toBeUndefined();
  });

  it("marks stopped ones as inactive and lists active first", () => {
    expect(find("OLD GYM")!.active).toBe(false);
    expect(r.at(-1)!.merchant).toBe("OLD GYM");
  });
});

describe("totals and merchants", () => {
  const txns = [
    t("2026-01-03", -50, "LOBLAWS #12", "groceries"),
    t("2026-01-10", -30, "LOBLAWS #45", "groceries"),
    t("2026-01-12", 10, "LOBLAWS #12 RETURN", "groceries"), // return nets off
    t("2026-01-15", -500, "PAYMENT TO CARD", "card-payment"), // transfer, not spending
    t("2026-01-20", 3000, "PAYROLL", "salary"),
    t("2026-01-21", -25, "XYZ SHOP ON", "in-store"),
  ];
  const range: [string, string] = ["2026-01-01", "2026-01-31"];

  it("nets returns and ignores transfers and income", () => {
    expect(totalsBy(txns, range, byParent)).toEqual([
      { key: "food", total: 70, count: 3 },
      { key: "unknown", total: 25, count: 1 },
    ]);
    const lob = merchants(txns, range).find((m) => m.merchant === "LOBLAWS")!;
    expect(lob).toMatchObject({ total: 70, count: 2, average: 40 });
  });

  it("lists merchants that need a category", () => {
    expect(needsReview(txns, range).map((m) => m.merchant)).toEqual(["XYZ SHOP ON"]);
  });
});

describe("period helpers", () => {
  it("computes the previous equal period and last year", () => {
    expect(previousRange(["2026-07-01", "2026-09-30"])).toEqual(["2026-04-01", "2026-06-30"]);
    expect(lastYearRange(["2026-01-01", "2026-10-13"])).toEqual(["2025-01-01", "2025-10-13"]);
  });
});

describe("leaving things out", () => {
  const t = (id: string, description: string, amount: number, category: string) =>
    ({ id, date: "2026-03-05", description, amount, category, kind: "flow", share: 1, accountKey: "a" }) as unknown as ScopedTxn;
  const trip = t("1", "AIR CANADA", -800, "flights");
  const food = t("2", "LOBLAWS", -100, "groceries");
  const pay = t("3", "PAYROLL", 3000, "salary");
  it("drops spending by area, category, merchant or single transaction — never income", () => {
    const ex = new Set(["p:travel"]);
    expect([trip, food, pay].filter((x) => !isLeftOut(x, ex)).map((x) => x.id)).toEqual(["2", "3"]);
    expect(isLeftOut(trip, ex, "p:travel")).toBe(false);
    expect(isLeftOut(food, new Set(["t:2"]))).toBe(true);
    expect(isLeftOut(food, new Set(["m:LOBLAWS"]))).toBe(true);
    expect(isLeftOut(pay, new Set(["c:salary"]))).toBe(false);
    expect(spendByMonth([trip, food, pay]).get("2026-03")).toBe(900);
  });
});
