import { describe, expect, it } from "vitest";
import { byCategory, merchantKey, monthly, months, periodRange, totals, type ScopedTxn } from "./cashflow";

const t = (date: string, amount: number, kind: ScopedTxn["kind"], category?: string, share = 1): ScopedTxn => ({
  id: `${date}${amount}${kind}`, date, settleDate: date, type: "x", accountKey: "a", description: "", amount, symbol: null, quantity: null, kind, category, share,
});

describe("periods", () => {
  it("builds the trailing 12 months including the current one", () => {
    expect(periodRange("12m", "2026-10-13", "2024-01-01")).toEqual(["2025-11-01", "2026-10-13"]);
    expect(months(["2025-11-01", "2026-10-13"])).toHaveLength(12);
    expect(periodRange("last-year", "2026-10-13", "2024-01-01")).toEqual(["2025-01-01", "2025-12-31"]);
  });
});

describe("monthly cash flow", () => {
  const txns = [
    t("2026-09-01", 3000, "flow", "salary"),
    t("2026-09-03", -100, "flow", "groceries"),
    t("2026-09-04", 20, "flow", "refunds"), // refund reduces spending
    t("2026-09-05", -500, "transfer"), // excluded
    t("2026-09-10", 40, "investment-income"),
    t("2026-09-10", -6, "tax"),
    t("2026-09-12", 1000, "contribution"),
    t("2026-10-02", -200, "flow", "dining", 0.5), // joint account share
  ];
  const rows = monthly(txns, ["2026-09-01", "2026-10-31"]);

  it("separates income, spending, investment income and contributions", () => {
    expect(rows[0]).toMatchObject({ month: "2026-09", income: 3000, spending: 80, net: 2920, investmentIncome: 34, contributions: 1000 });
    expect(rows[1]).toMatchObject({ month: "2026-10", spending: 100 });
    const tot = totals(rows);
    expect(tot.savingsRate).toBeCloseTo((3000 - 180) / 3000);
  });

  it("totals categories with refunds netted", () => {
    const spend = byCategory(txns, ["2026-09-01", "2026-10-31"], "expense");
    expect(spend.find((c) => c.category === "groceries")!.total).toBe(100);
    expect(spend.find((c) => c.category === "refunds")!.total).toBe(-20);
  });
});

describe("merchantKey", () => {
  it("strips store numbers and references", () => {
    expect(merchantKey("LOBLAWS #1042 TORONTO")).toBe("LOBLAWS");
    expect(merchantKey("TIM HORTONS 0815 OTTAWA")).toBe("TIM HORTONS");
    expect(merchantKey("AMZN Mktp CA*2K3")).toBe("AMZN MKTP CA");
    // Bank-statement lines: generic prefixes and reference numbers dropped.
    expect(merchantKey("Deposit 0012345 ACME CORP PAY")).toBe("ACME CORP PAY");
    expect(merchantKey("MISC. PAYMENT UBER CANADA/UBERE")).toBe("UBER CANADA/UBERE");
    expect(merchantKey("Point of sale purchase SHOP ONE TORONTO ON")).toBe("SHOP ONE TORONTO ON");
  });
});
