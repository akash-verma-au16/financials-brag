# Build plan

Status: approved 2026-10-13. M1–M6 built the same day (see git log). Next: verify against real data
via Data → "Save diagnostics", then V1 items. Based on the real structure of the Wealthica Google Sheets exports
(structure only; no values). Supersedes the speculative data model in `research/features.md` where they differ.

## 1. What the data actually is

Three Wealthica exports, each a single tab named `Default`, all amounts already converted to CAD.

| Export | Grain | Key columns | History? |
|---|---|---|---|
| **Balances** | 1 row per account | Date, Institution, Account Number, Account Type, Account Name, Balance | **No.** Latest snapshot only |
| **Positions** | 1 row per holding per account | Date, Symbol, Name, Book Value, Market Value, Value, Quantity, Category, Asset Class, Account Number/Type | **No.** Latest snapshot only |
| **Transactions** | 1 row per transaction (from when you linked the accounts) | Trade/Settlement Date, Type, Account Number/Type, Description, Currency Amount, Symbol, Quantity, Category, ID | Yes, from the link date |

The app identifies each export by its headers, so there's no manual labelling. The join key across all three is **Account Number**.

### Data findings that shape the design

1. **No balance history.** Net worth over time needs (a) a daily snapshot we store ourselves, plus (b) a back-fill
   from transactions. That back-fill is exact for cash/chequing/credit and approximate for investment accounts, because price moves aren't in
   the data.
2. **Everything is CAD.** No FX engine is needed for the MVP. The listing currency can be inferred from the symbol (`.TO` = CAD).
3. **Asset classification is too coarse.** `Category` is only Canadian/US Stocks and `Asset Class` is only Equities/Cash/Others, while
   multi-asset or regional ETFs (e.g. XEQT, VBAL) need look-through. → We ship an **instrument table** (symbol → asset class, region,
   type) with sensible defaults, editable in Settings.
4. **No spending categories.** Transaction `Category` is the *account* kind (Broker/Checking/Credit…). Spending
   categories come from **rules on Description** (keyword → category) plus an "uncategorised" review queue.
5. **Internal transfers must be netted.** Transfer/Deposit/Withdrawal pairs between own accounts and credit-card
   payments would otherwise double-count income and spending.
6. **Noise rows.** `loan`/`recall` (securities lending) and `Mark to Market` are excluded from cash flow.
7. **Symbol normalisation.** The same security can appear as `XEQT` and `XEQT.TO`.
8. **Account names are often empty.** The display name falls back to Institution + type + last 4 digits.
9. **Positions `Value` vs `Market Value`.** Both exist, and `Value` is mostly empty. To be verified on real rows which one is
   authoritative for funds without a symbol (e.g. pension funds).
10. **Credit balance sign.** To be verified on real rows. Liabilities are normalised to negative.
11. **Registered room.** Contributions are derivable only from the earliest transaction onward, so starting room per account type
    (TFSA/RRSP/FHSA) is a one-time manual input from CRA My Account.

## 2. Milestones (each ends with typecheck + build + unit tests + a commit)

| # | Milestone | Delivers |
|---|---|---|
| M1 | **Data layer** | Auto-detect the 3 exports; typed `Account`, `Position`, `Transaction`; normalisation (findings 5–10); instrument table; unit tests on synthetic fixtures |
| M2 | **Overview + Accounts** | Net worth now; assets vs liabilities; split by liquidity (cash / investments / retirement-locked / debt), institution and account type; per-account freshness |
| M3 | **Holdings + Allocation** | Positions merged across accounts; unrealised gain where Book Value exists; allocation by asset class, region, account type and institution |
| M4 | **Cash Flow + Income** | Monthly in/out with transfer netting; spending categories by rules; dividends, interest and distributions by month and by symbol |
| M5 | **Net worth history** | Daily snapshot store + transaction back-fill; net-worth-over-time chart |
| M6 | **Registered room** | TFSA / RRSP / FHSA room from starting inputs + contributions |
| Later | V1 | Performance (TWR/XIRR), projections, budgets, goals, manual (non-Wealthica) accounts |

## Statement sources

Example of how accounts map to sources (yours are configured in `config/settings.json`, see SETUP.md):

| Account | Source | Status |
|---|---|---|
| e.g. a chequing account and a Scotiabank or RBC credit card | Monthly PDF statements (`statements/<account>/<YYYY>/<YYYY-MM>.pdf`) | Supported layouts in tools/pdf-profiles.ts |
| e.g. a card whose provider exports CSV | CSV exports merged into one CSV per year (`ledger: yearly`, tools/ledger.ts); import from Settings | Supported |
| A card with a not-yet-supported PDF layout | Monthly PDF statements | Mark it `pending: true` until its first statement arrives, then add a profile to tools/pdf-profiles.ts and remove `pending` |

## 3. Decisions (approved 2026-10-13)

- **Snapshots (M5):** a "Financials History" Google Sheet in the owner's Drive, created by the app, with one row per account per day.
  Needs the `drive.file` scope, which covers only files the app itself creates.
- **Ownership:** household. Each account has one or more owners (joint accounts allowed). Views can be filtered per person.
  Owner assignments are configured in Settings.
- **Order:** M1 → M6 as above, with a commit per milestone.
