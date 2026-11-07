# Statements

> **This folder ships empty on purpose.** The original author's real bank/card statements (PDFs and
> CSVs) and their `account.yaml` files were removed — they contained account numbers, names,
> addresses and transactions. Put **your own** statements here. Everything in `statements/` except
> this README is git-ignored (see `.gitignore`), so your files never get committed by accident.
> Ready-to-copy example folders: [`docs/examples/statements/`](../docs/examples/statements/).

Transactions for accounts Wealthica doesn't sync, or syncs without transactions (other banks' cards
and chequing, some credit cards). One folder per account; the folder name is up to you:

```
statements/
  mybank-visa/
    account.yaml
    2026/2026-01.pdf          monthly statements, by statement date
  mybank-chequing/
    account.yaml
    2026/2026-01.csv
  some-card-with-full-export/
    account.yaml              ledger: yearly
    2026.csv                  every transaction of 2026 (exports are merged in, then deleted)
```

Folders starting with `.` are ignored, as are files/folders inside an account starting with `.` or `_`
(handy for a `_duplicates/` folder).

## account.yaml

```yaml
institution: Scotiabank     # as Wealthica names the bank — used to merge with a Wealthica account
type: credit                # credit, chequing, savings…
name: My Visa               # optional display name
last4: "1234"               # optional: merges with the Wealthica account with the same last 4 digits
                            #   (for supported PDF layouts it's read from the statement itself)
balance: 512.40             # optional, when the account isn't in Wealthica (credit: amount owed)
balance_date: 2026-10-01    # optional
opening_balance: 0          # optional: balance before the first transaction in the files, when they
                            #   go back to the account's opening; the balance is then worked out
flip_sign: false            # set true if purchases come out as money in
date_format: MDY            # MDY (default), DMY or YMD for dates like 03/04/2026
ledger: yearly              # optional: keep one master CSV per year (see below)
pending: true               # optional: set up, but left out of every figure until it's ready
```

When Wealthica has the same account (same bank and type, or same last 4 digits), its balance is used
and these files only add the transactions Wealthica is missing.

## Yearly ledgers (`ledger: yearly`)

For banks whose CSV export always contains everything so far (e.g. an export that starts at the
card's opening). The folder keeps `<YYYY>.csv`, one per year, in the export's own columns, oldest
first.

- **Adding an export:** Settings → Statement accounts → Import CSV, the Upload statements page, or
  just drop the file into the folder. The server merges it into the right year's file and deletes it
  (`npm run statements:merge` does the same by hand).
- **How rows are merged:** a year's file is never rewritten. With its last date D, export rows dated
  before D are already covered and skipped; rows dated D are matched one for one (two identical
  coffees stay two); rows after D are added. Rows that aren't settled yet (status other than
  Completed/Posted) are skipped and come in with a later export. The result shows counts per year.
- **Re-importing the same export** changes nothing.

Code: `tools/ledger.ts` (tests: `tools/ledger.test.ts`).

## Accounts waiting for their first statement (`pending: true`)

The folder exists so statements can be uploaded into it, but the account is left out of every
figure until its statement layout has been read and a parser profile written (see below).

## Files

- **CSV (preferred, exact):** download from online banking. Header rows with Date / Description /
  Amount (or Debit + Credit / Withdrawals + Deposits) are recognised, as are CIBC's headerless files
  and `snake_case` headers like Wealthsimple's.
- **PDF:** text-based statements. Lines starting with a date and ending with an amount are read;
  bank statements use the running balance to tell deposits from withdrawals. Bank-specific profiles
  live in `tools/pdf-profiles.ts` (Scotiabank and RBC layouts are included). Check the per-file
  counts on the app's Data page — scanned (image) PDFs can't be read.
- **A new bank's PDF layout:** run `node tools/pdf-structure.ts <file.pdf>` — it prints the layout
  with every digit and non-generic word masked, so you (or an AI assistant) can write a profile
  without exposing your transactions. Then add a profile + a synthetic test in
  `tools/pdf-profiles.test.ts`, and check with `node tools/check-statements.ts statements/<folder>`.

Overlapping files are fine: identical rows are kept once, and rows Wealthica already has are skipped.
Files are parsed by the server on your machine (tools/api.ts) and only reach the app after Google
sign-in; they never leave your machine.
