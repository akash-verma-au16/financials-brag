/**
 * Pure finance maths for projections and calculators. Rates are annual decimals (0.06 = 6%).
 */

// ── Growth projection ─────────────────────────────────────────────────────────

export interface GrowthInputs {
  start: number;
  /** Contribution in year 1 (spread monthly). */
  annualContribution: number;
  /** Yearly increase of the contribution (0.03 = +3%/yr). */
  contributionGrowth: number;
  rate: number;
  years: number;
  /** Stop contributing after this many years (undefined = never). */
  contributeYears?: number;
  /** Stop once total contributions reach this (e.g. FHSA $40,000 lifetime). */
  contributionCap?: number;
  /** Contributions already made toward the cap. */
  contributedSoFar?: number;
}

export interface GrowthYear {
  year: number; // 0 = today
  value: number;
  contributed: number; // cumulative new contributions
  growth: number; // cumulative investment growth
}

/** Monthly compounding; contributions at the end of each month. Returns year 0..years. */
export function projectGrowth(i: GrowthInputs): GrowthYear[] {
  const monthly = Math.pow(1 + i.rate, 1 / 12) - 1;
  let value = i.start;
  let contributed = 0;
  let capLeft = i.contributionCap === undefined ? Infinity : Math.max(0, i.contributionCap - (i.contributedSoFar ?? 0));
  const out: GrowthYear[] = [{ year: 0, value, contributed: 0, growth: 0 }];
  for (let y = 1; y <= i.years; y++) {
    const active = i.contributeYears === undefined || y <= i.contributeYears;
    const perMonth = active ? (i.annualContribution * Math.pow(1 + i.contributionGrowth, y - 1)) / 12 : 0;
    for (let m = 0; m < 12; m++) {
      value *= 1 + monthly;
      const c = Math.min(perMonth, capLeft);
      capLeft -= c;
      value += c;
      contributed += c;
    }
    out.push({ year: y, value, contributed, growth: value - i.start - contributed });
  }
  return out;
}

/** Today's dollars: divide by cumulative inflation. */
export const toReal = (value: number, inflation: number, years: number) => value / Math.pow(1 + inflation, years);

// ── Mortgage (Canadian) ───────────────────────────────────────────────────────

export type PaymentFrequency = "monthly" | "semi-monthly" | "bi-weekly" | "accelerated-bi-weekly" | "weekly" | "accelerated-weekly";

export const FREQ: Record<PaymentFrequency, { perYear: number; label: string }> = {
  monthly: { perYear: 12, label: "Monthly" },
  "semi-monthly": { perYear: 24, label: "Semi-monthly" },
  "bi-weekly": { perYear: 26, label: "Bi-weekly" },
  "accelerated-bi-weekly": { perYear: 26, label: "Accelerated bi-weekly" },
  weekly: { perYear: 52, label: "Weekly" },
  "accelerated-weekly": { perYear: 52, label: "Accelerated weekly" },
};

/** CMHC premium as a share of the loan, by down-payment percentage (insured mortgages, < 20% down). */
export function cmhcPremiumRate(downPct: number): number {
  if (downPct >= 0.2) return 0;
  if (downPct >= 0.15) return 0.028;
  if (downPct >= 0.1) return 0.031;
  if (downPct >= 0.05) return 0.04;
  return NaN; // below the 5% minimum
}

/** Periodic rate for a nominal annual rate compounded `compoundsPerYear` times, paid `perYear` times. */
export function periodicRate(rate: number, perYear: number, compoundsPerYear = 2): number {
  return Math.pow(1 + rate / compoundsPerYear, compoundsPerYear / perYear) - 1;
}

/** Level payment for a loan. */
export function annuityPayment(principal: number, periodRate: number, periods: number): number {
  if (periods <= 0) return principal;
  if (periodRate === 0) return principal / periods;
  return (principal * periodRate) / (1 - Math.pow(1 + periodRate, -periods));
}

export interface MortgageInputs {
  price: number;
  down: number;
  rate: number;
  amortizationYears: number;
  frequency: PaymentFrequency;
  /** Term (renewal) length in years — balance at renewal is reported. */
  termYears: number;
  /** Extra lump sum paid once a year (anniversary). */
  annualPrepayment?: number;
  /** Extra amount added to every payment. */
  extraPerPayment?: number;
  /** Variable-rate mortgages compound monthly; fixed compound semi-annually. */
  compounding?: "semi-annual" | "monthly";
}

export interface MortgageYear {
  year: number;
  balance: number;
  interestPaid: number; // this year
  principalPaid: number; // this year
  cumulativeInterest: number;
}

export interface MortgageResult {
  loan: number;
  insurance: number;
  downPct: number;
  payment: number;
  periodsPerYear: number;
  totalInterest: number;
  payoffYears: number;
  balanceAtTerm: number;
  interestOverTerm: number;
  schedule: MortgageYear[];
  error?: string;
}

export function mortgage(i: MortgageInputs): MortgageResult {
  const downPct = i.price > 0 ? i.down / i.price : 0;
  const premiumRate = cmhcPremiumRate(downPct);
  const base = Math.max(i.price - i.down, 0);
  const empty = { loan: base, insurance: 0, downPct, payment: 0, periodsPerYear: 12, totalInterest: 0, payoffYears: 0, balanceAtTerm: 0, interestOverTerm: 0, schedule: [] };
  if (Number.isNaN(premiumRate)) return { ...empty, error: "Down payment must be at least 5% of the price." };
  if (premiumRate > 0 && i.price >= 1_500_000) return { ...empty, error: "Insured mortgages (< 20% down) require a price under $1.5M." };

  const insurance = base * premiumRate;
  const loan = base + insurance;
  const { perYear } = FREQ[i.frequency];
  const compounds = i.compounding === "monthly" ? 12 : 2;
  const monthlyRate = periodicRate(i.rate, 12, compounds);
  const monthlyPayment = annuityPayment(loan, monthlyRate, i.amortizationYears * 12);
  // Accelerated: monthly payment ÷ 2 (or ÷ 4) paid 26 (or 52) times a year — one extra monthly payment a year.
  const payment =
    i.frequency === "accelerated-bi-weekly" ? monthlyPayment / 2
    : i.frequency === "accelerated-weekly" ? monthlyPayment / 4
    : i.frequency === "monthly" ? monthlyPayment
    : annuityPayment(loan, periodicRate(i.rate, perYear, compounds), i.amortizationYears * perYear);
  const r = periodicRate(i.rate, perYear, compounds);
  const pay = payment + (i.extraPerPayment ?? 0);

  let balance = loan;
  let cumulative = 0;
  const schedule: MortgageYear[] = [{ year: 0, balance, interestPaid: 0, principalPaid: 0, cumulativeInterest: 0 }];
  let payoffYears = i.amortizationYears;
  let balanceAtTerm = 0;
  let interestOverTerm = 0;
  for (let y = 1; y <= i.amortizationYears && balance > 0.005; y++) {
    let interestY = 0;
    let principalY = 0;
    for (let p = 0; p < perYear && balance > 0.005; p++) {
      const interest = balance * r;
      const principal = Math.min(pay - interest, balance);
      if (principal <= 0) return { ...empty, loan, insurance, error: "The payment doesn't cover the interest." };
      balance -= principal;
      interestY += interest;
      principalY += principal;
      if (balance <= 0.005) payoffYears = y - 1 + (p + 1) / perYear;
    }
    if (i.annualPrepayment && balance > 0) {
      const extra = Math.min(i.annualPrepayment, balance);
      balance -= extra;
      principalY += extra;
      if (balance <= 0.005) payoffYears = y;
    }
    cumulative += interestY;
    schedule.push({ year: y, balance: Math.max(balance, 0), interestPaid: interestY, principalPaid: principalY, cumulativeInterest: cumulative });
    if (y === i.termYears) {
      balanceAtTerm = Math.max(balance, 0);
      interestOverTerm = cumulative;
    }
  }
  if (i.termYears > schedule.length - 1) {
    balanceAtTerm = 0;
    interestOverTerm = cumulative;
  }
  return { loan, insurance, downPct, payment, periodsPerYear: perYear, totalInterest: cumulative, payoffYears, balanceAtTerm, interestOverTerm, schedule };
}

// ── Debt payoff ───────────────────────────────────────────────────────────────

/** Months to pay off `balance` at APR `rate` (monthly compounding) with a fixed monthly payment. */
export function monthsToPayoff(balance: number, rate: number, monthlyPayment: number): { months: number; interest: number } | null {
  const r = rate / 12;
  if (monthlyPayment <= balance * r) return null; // never pays off
  let b = balance;
  let months = 0;
  let interest = 0;
  while (b > 0.005 && months < 1200) {
    const i = b * r;
    interest += i;
    b = b + i - monthlyPayment;
    months++;
  }
  return { months, interest };
}

/** Monthly payment needed to clear `balance` in `months`. */
export const paymentForMonths = (balance: number, rate: number, months: number) => annuityPayment(balance, rate / 12, months);
