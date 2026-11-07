/**
 * Transactions imported from statement files in the repo's `statements/` folder
 * (one sub-folder per account, described by its account.yaml). Parsed in Node — by the dev
 * server locally, by the build script in CI — and shipped to the app as plain data.
 */

export interface StatementAccountMeta {
  /** Bank name as Wealthica shows it, e.g. "Scotiabank" — used to merge with a Wealthica account. */
  institution: string;
  /** Wealthica-style type: credit, chequing, savings… */
  type: string;
  name?: string;
  /** Last 4 digits of the account/card: merges with the Wealthica account with the same last 4. */
  last4?: string;
  /** Optional current balance (CAD) when the account isn't in Wealthica. Credit balances: amount owed. */
  balance?: number;
  balanceDate?: string;
  /** Flip every amount's sign if a bank exports purchases as positive numbers. */
  flipSign?: boolean;
  /** Date order for ambiguous dates like 03/04/2026. Default: MDY. */
  dateFormat?: "MDY" | "DMY" | "YMD";
  /**
   * Balance just before the first transaction in the files (credit: amount owed), when the files
   * go back to the account's opening. The balance is then worked out from the transactions.
   */
  openingBalance?: number;
  /** "yearly": the folder keeps one master CSV per year and exports are merged into it (tools/ledger.ts). */
  ledger?: "yearly";
  /**
   * Set up but not in use yet (e.g. waiting for the first statement so its layout can be read):
   * statements can be uploaded into the folder, but the account is left out of every figure.
   */
  pending?: boolean;
}

export interface StatementTxn {
  date: string; // ISO
  description: string;
  /** CAD from the account's point of view: + money in, − money out (a card purchase is negative). */
  amount: number;
  /** Source file, relative to statements/. */
  file: string;
}

export interface StatementFile {
  file: string;
  parsed: number;
  error?: string;
  /** Which parser read it, e.g. "scotia-credit", "generic-pdf", "csv". */
  format?: string;
  /** Cross-check against the statement's own totals, e.g. "ok" or "credits differ by $12.00". */
  check?: string;
  /** Statement period [start, end], ISO. */
  period?: [string, string];
}

export interface StatementAccount {
  folder: string;
  meta: StatementAccountMeta;
  txns: StatementTxn[];
  files: StatementFile[];
  /** Last 4 digits read from the statements themselves (used when account.yaml has none). */
  detectedLast4?: string;
  /** Closing balance on the most recent statement (credit: amount owed). */
  latestBalance?: { date: string; balance: number };
}

/** What merging one CSV export into a yearly ledger did (tools/ledger.ts). Counts only. */
export interface LedgerFileResult {
  folder: string;
  file: string;
  years: {
    year: string;
    added: number;
    /** Rows on or before the master's last date that were already there. */
    alreadyThere: number;
    /** Rows dated before the master's last date that the master doesn't have (left out by design). */
    olderSkipped: number;
  }[];
  /** Rows skipped because they aren't settled yet. */
  pending: number;
  /** Rows without a readable date. */
  unreadable: number;
  /** Repo-relative paths written or deleted. */
  changed: string[];
  error?: string;
}

export interface StatementBundle {
  accounts: StatementAccount[];
  errors: string[];
}
