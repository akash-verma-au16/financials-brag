import { describe, expect, it } from "vitest";
import { annuityPayment, cmhcPremiumRate, monthsToPayoff, mortgage, paymentForMonths, periodicRate, projectGrowth, toReal } from "./finance-math";

describe("projectGrowth", () => {
  it("compounds a lump sum at the annual rate", () => {
    const r = projectGrowth({ start: 10000, annualContribution: 0, contributionGrowth: 0, rate: 0.06, years: 10 });
    expect(r.at(-1)!.value).toBeCloseTo(10000 * 1.06 ** 10, 2);
    expect(r).toHaveLength(11);
  });

  it("adds growing contributions, stops after N years, and respects a lifetime cap", () => {
    const flat = projectGrowth({ start: 0, annualContribution: 12000, contributionGrowth: 0, rate: 0, years: 3 });
    expect(flat.map((y) => y.contributed)).toEqual([0, 12000, 24000, 36000]);
    const growing = projectGrowth({ start: 0, annualContribution: 1000, contributionGrowth: 0.1, rate: 0, years: 2 });
    expect(growing.at(-1)!.contributed).toBeCloseTo(2100);
    const stopped = projectGrowth({ start: 0, annualContribution: 1000, contributionGrowth: 0, rate: 0, years: 5, contributeYears: 2 });
    expect(stopped.at(-1)!.contributed).toBeCloseTo(2000);
    const fhsa = projectGrowth({ start: 0, annualContribution: 8000, contributionGrowth: 0, rate: 0, years: 10, contributionCap: 40000, contributedSoFar: 16000 });
    expect(fhsa.at(-1)!.contributed).toBeCloseTo(24000);
  });

  it("reports growth separately and converts to today's dollars", () => {
    const r = projectGrowth({ start: 1000, annualContribution: 1200, contributionGrowth: 0, rate: 0.05, years: 1 });
    expect(r[1]!.growth).toBeCloseTo(r[1]!.value - 1000 - 1200);
    expect(toReal(1102.5, 0.05, 2)).toBeCloseTo(1000);
  });
});

describe("mortgage", () => {
  it("uses Canadian semi-annual compounding", () => {
    expect(periodicRate(0.06, 12)).toBeCloseTo(Math.pow(1.03, 1 / 6) - 1, 10);
    // $400k at 5% over 25 years, monthly: ≈ $2,326.42 (semi-annual compounding)
    const m = mortgage({ price: 500000, down: 100000, rate: 0.05, amortizationYears: 25, frequency: "monthly", termYears: 5 });
    expect(m.insurance).toBe(0);
    expect(m.payment).toBeCloseTo(2326.42, 0);
    expect(m.schedule.at(-1)!.balance).toBeCloseTo(0, 0);
    expect(m.balanceAtTerm).toBeGreaterThan(300000);
  });

  it("adds CMHC insurance below 20% down and rejects < 5%", () => {
    expect(cmhcPremiumRate(0.1)).toBe(0.031);
    const m = mortgage({ price: 500000, down: 50000, rate: 0.05, amortizationYears: 25, frequency: "monthly", termYears: 5 });
    expect(m.insurance).toBeCloseTo(450000 * 0.031);
    expect(mortgage({ price: 500000, down: 10000, rate: 0.05, amortizationYears: 25, frequency: "monthly", termYears: 5 }).error).toMatch(/5%/);
  });

  it("pays off faster with accelerated payments and prepayments", () => {
    const base = { price: 500000, down: 100000, rate: 0.05, amortizationYears: 25, termYears: 5 } as const;
    const monthly = mortgage({ ...base, frequency: "monthly" });
    const accel = mortgage({ ...base, frequency: "accelerated-bi-weekly" });
    const prepay = mortgage({ ...base, frequency: "monthly", annualPrepayment: 10000 });
    expect(accel.payoffYears).toBeLessThan(monthly.payoffYears);
    expect(accel.totalInterest).toBeLessThan(monthly.totalInterest);
    expect(prepay.payoffYears).toBeLessThan(18);
  });
});

describe("debt payoff", () => {
  it("computes months and the payment for a target", () => {
    expect(monthsToPayoff(1000, 0.2, 10)).toBeNull();
    const r = monthsToPayoff(5000, 0.2, 200)!;
    expect(r.months).toBe(33); // n = −ln(1 − rB/P) / ln(1 + r) ≈ 32.6 → 33rd payment is partial
    expect(paymentForMonths(5000, 0, 10)).toBe(500);
    expect(annuityPayment(1000, 0.01, 12)).toBeCloseTo(88.85, 2);
  });
});
