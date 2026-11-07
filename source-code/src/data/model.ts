/**
 * Canonical domain model, built from the three Wealthica Google Sheets exports
 * (Balances, Positions, Transactions). All amounts are CAD — Wealthica converts before export.
 * See docs/build-plan.md for how each field maps to the source columns.
 */

/** Where money sits, from most to least liquid. Drives the net-worth breakdown. */
export type Bucket = "cash" | "investments" | "retirement" | "debt";

export type TaxTreatment = "tax-free" | "tax-deferred" | "taxable" | "n/a";

export interface Account {
  /** Stable opaque key (hash of institution + account number). Raw numbers are never kept. */
  key: string;
  /** Last 4 characters of the account number, for display only. */
  last4: string;
  institution: string;
  /** Wealthica account type, lower-case: chequing, credit, tfsa, rrsp, fhsa, nrsp, rpp, dpsp, epsp, cash… */
  type: string;
  /** Wealthica's account name when present, else derived (see displayName). */
  name: string;
  currency: string;
  /** CAD. Liabilities are negative. */
  balance: number;
  /** ISO date of the balance. */
  asOf: string;
  bucket: Bucket;
  tax: TaxTreatment;
  /** Person ids from settings; empty = unassigned. Two or more = joint. */
  owners: string[];
  /** Where the data comes from. Absent = Wealthica only. */
  source?: "statements" | "wealthica+statements";
  /** Set when the user marked the account closed: the last day it counts (ISO date). */
  closedOn?: string;
}

export type AssetClass = "equity" | "fixed-income" | "balanced" | "real-estate" | "cash" | "other";
export type Region = "CA" | "US" | "intl" | "global" | "emerging" | "mixed" | "n/a";
export type Vehicle = "stock" | "etf" | "fund" | "cash" | "other";

export interface Instrument {
  /** Canonical symbol, or `name:<NAME>` for funds without a ticker. */
  key: string;
  symbol: string | null;
  name: string;
  assetClass: AssetClass;
  region: Region;
  vehicle: Vehicle;
}

export interface Position {
  accountKey: string;
  instrumentKey: string;
  symbol: string | null;
  name: string;
  quantity: number | null;
  /** CAD. Null when the source has no book value (e.g. some pension funds). */
  bookValue: number | null;
  /** CAD. */
  marketValue: number;
  asOf: string;
}

/**
 * What a transaction means for the household, after transfer matching.
 * - flow: money entering/leaving the household (income, spending, refunds)
 * - transfer: moves between the household's own accounts (netted out of cash flow)
 * - contribution / withdrawal: external money into/out of an investment or retirement account
 * - trade: buy/sell/reinvest inside an investment account
 * - investment-income: dividends, distributions, interest
 * - tax: withholding tax
 * - ignore: bookkeeping rows (securities lending, mark-to-market)
 */
export type TxnKind = "flow" | "transfer" | "contribution" | "withdrawal" | "trade" | "investment-income" | "tax" | "ignore";

export interface Transaction {
  id: string;
  date: string; // trade date, ISO
  settleDate: string;
  /** Wealthica type, lower-case: buy, sell, deposit, withdrawal, transfer, dividend, distribution, interest, reinvested, tax, mark to market, loan, recall */
  type: string;
  accountKey: string;
  description: string;
  /** CAD, signed from the account's point of view (+ in, − out). */
  amount: number;
  symbol: string | null;
  quantity: number | null;
  kind: TxnKind;
  /** Id of the opposite leg when kind === "transfer" and a match was found. */
  transferPeer?: string;
  /** Spending/income category id, for kind === "flow". */
  category?: string;
}

export interface Dataset {
  /** Open accounts. Everything about the present (balances, holdings, lists) uses these. */
  accounts: Account[];
  /** Accounts the user marked closed: kept for history (net worth over time, past transactions). */
  closedAccounts?: Account[];
  positions: Position[];
  transactions: Transaction[];
  instruments: Map<string, Instrument>;
  /** Latest balance date across accounts. */
  asOf: string | null;
  issues: DataIssue[];
}

export interface DataIssue {
  level: "info" | "warn";
  message: string;
}
