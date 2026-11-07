# SETUP — make this app yours

This is a working copy of someone's personal finance dashboard, shared **without any of their
data**. Everything that was personal to the original author has been removed and replaced with
examples or templates. You (or your AI coding assistant — Claude, Copilot, etc.) supply your own
pieces. This file lists exactly what those are and how to set them up.

> **For an AI assistant reading this:** follow the steps in order. Never commit files listed as
> "personal" below. All example values in this repo (`Maple Bank`, `Example Corp`, `a_000…`,
> `1234`, `<your-…>`) are fictional placeholders, not real data.

---

## 1. What's in this copy, and what isn't

| Item | In this copy? | Why | What you do |
| --- | --- | --- | --- |
| All app code (`src/`), server + parsers (`tools/`), tests, docs | ✅ Yes | Generic code | Nothing — it's ready |
| `.env.local` (Google OAuth client ID, allowed emails) | ❌ Removed | The author's own Google project and email | Create yours from `.env.example` — [step 3](#3-google-sign-in-oauth-client) |
| `config/settings.json` (rules, labels, household, sheet IDs, birth year) | ❌ Removed | Built from the author's own transactions and sheets | Nothing: the app creates it. Format: [`config/README.md`](config/README.md), [`config/settings.example.json`](config/settings.example.json) |
| `contribution-limits.yaml` (TFSA/RRSP/FHSA room) | ❌ Removed | The author's CRA figures | Copy the template — [step 6](#6-contribution-limits-tfsa--rrsp--fhsa) |
| `statements/**` (bank/card PDF & CSV statements, `account.yaml`s) | ❌ Removed | Real statements: names, addresses, account numbers, transactions | Add your own — [step 5](#5-statements-for-accounts-wealthica-doesnt-sync) |
| `data/history.csv` (net-worth history) | ❌ Removed | Real balances | Nothing: the app builds it — [`data/README.md`](data/README.md) |
| `data/private/**` (market cache, logs, diagnostics) | ❌ Removed | Machine-local cache | Nothing: created automatically |
| The author's Tailscale hostname, GitHub handle, Google Sheet IDs | ❌ Replaced with `<your-…>` placeholders | Identifying | Use your own when you get there |
| A few tests/comments that used the author's real values | ✏️ Rewritten with fictional values | Same tests, same behaviour | Nothing |
| `demo/market/*.json` | ✅ Yes | Public market data snapshot for the fictional demo | Nothing (re-record with `tools/demo-market.ts` if you change demo tickers) |

Your own copies of all the "removed" files are **git-ignored** by [`.gitignore`](.gitignore), so
they can't be committed by accident. See [Your data and git](#your-data-and-git).

---

## 2. Run it with demo data (5 minutes, no accounts needed)

Requirements: **Node.js 24+** (the server runs TypeScript directly with Node's built-in type
stripping), **git**, and a modern browser. Windows, macOS or Linux all work for development; the
always-on service script (`tools/install-service.ps1`, `npm run serve:update`) is Windows-only.

```bash
npm ci
cp .env.example .env.local      # can stay empty for demo mode
npm run dev                     # http://localhost:3000
```

On the sign-in screen choose **"Explore with demo data instead"**. Everything you see is generated
by `src/data/demo.ts` (fictional "Maple Bank" accounts).

`npm test` runs the test suite; `npm run typecheck` checks types.

---

## 3. Google sign-in (OAuth client)

The app signs you in with Google and reads your sheets with your own token (read-only scope).
Nothing is sent to any third party; there is no backend database.

1. In **console.cloud.google.com**, create a project and enable the **Google Sheets API**.
2. **Google Auth Platform → Get started**: audience *External*; add your Gmail under *Test users*.
3. **Clients → Create client → Web application.** Authorized JavaScript origins:
   - `http://localhost:3000` (development — the port is fixed on purpose, see `vite.config.ts`)
   - later, your public address, e.g. `https://<your-machine>.<your-tailnet>.ts.net` ([step 7](#7-always-on-reachable-from-anywhere-optional))
4. Put the values in `.env.local` (git-ignored):

   ```ini
   VITE_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
   VITE_ALLOWED_EMAILS=you@example.com,partner@example.com
   ```

   - The client **ID** is public by design (it ships in the page). You never need the client
     *secret* — don't put it anywhere.
   - `VITE_ALLOWED_EMAILS` is **required**: the server refuses every data request from anyone else,
     and the app signs other accounts straight out.
5. Restart `npm run dev`. Until a client ID is set, the app shows a built-in setup page
   (`src/features/setup/SetupPage.tsx`) with these same steps.

Code: `src/lib/google-auth.ts` (browser), `tools/api.ts` (server-side token check).

---

## 4. Your account data: Wealthica → Google Sheets

The app's main data source is **Wealthica** (a Canadian aggregator) exporting to Google Sheets.

1. In Wealthica, connect your institutions, then set up its Google Sheets export/sync so you get
   three spreadsheets (any names): **accounts/balances**, **positions**, **transactions**.
2. In the app, open **Data** and paste each sheet's link. Only the sheet ID and title are stored
   (in `config/settings.json` → `sources`), never cell data.
3. The app recognises each export by its column headers (`src/data/table.ts → detectKind`):
   - transactions: `Trade Date`, `Type`, `Currency Amount`, …
   - positions: `Market Value`, `Account Number`, …
   - balances: `Balance`, `Account Number`, `Account Type`, …

   If your export's headers differ, adjust `detectKind` and the column reads in
   `src/data/build.ts` (the sheet inspector on the **Data** page shows any sheet's columns and types to help).
   `src/data/demo.ts` contains the exact header lists the app expects.

No Wealthica? Any sheet with those headers works — you can maintain them by hand.

Account keys in the app are hashes (`a_` + 16 hex) of institution + account number, so raw
account numbers are never stored.

---

## 5. Statements for accounts Wealthica doesn't sync

For cards/banks Wealthica can't sync (or syncs without transactions), drop statements into
`statements/<your-folder>/` with an `account.yaml`. Everything there except the README is
git-ignored.

- Full guide and every `account.yaml` option: [`statements/README.md`](statements/README.md)
- Copy-ready examples: [`docs/examples/statements/`](docs/examples/statements/) (credit card with
  PDFs, chequing with CSV, yearly-ledger card)
- **PDF layouts included:** Scotiabank (chequing + credit cards) and RBC credit cards
  (`tools/pdf-profiles.ts`). **CSV:** most banks' Date/Description/Amount exports, CIBC headerless
  files, Wealthsimple-style `snake_case` exports.
- **A bank that isn't supported yet:** run `node tools/pdf-structure.ts your-statement.pdf`. It
  prints the layout with every digit and non-generic word masked, so you can share it with an AI
  assistant safely. Ask it to add a profile in `tools/pdf-profiles.ts` with a *synthetic* test in
  `tools/pdf-profiles.test.ts`, then verify with `node tools/check-statements.ts statements/<folder>`.
  Mark the account `pending: true` until it parses.
- You can also upload statements from the app (**Upload statements** page), from any device.

---

## 6. Contribution limits (TFSA / RRSP / FHSA)

```bash
cp contribution-limits.example.yaml contribution-limits.yaml
```

Fill in your own numbers from CRA My Account / your notice of assessment, once a year. Empty
values show as "limit unknown". Without the file, the Room page still works and shows every limit
as unknown. The file is read by the local server only after sign-in; it's never bundled into the
website.

---

## 7. Always on, reachable from anywhere (optional)

Your own computer acts as the server: `tools/server.ts` serves the built app plus the private-file
API on `127.0.0.1:18787`, and **Tailscale Funnel** publishes it over HTTPS. Full guide:
[`docs/self-hosting.md`](docs/self-hosting.md). In short (Windows):

1. Install Tailscale, then run `tailscale funnel --bg 18787` once (approve Funnel if asked).
2. `npm run build`, then from an **Administrator** PowerShell:
   `powershell -ExecutionPolicy Bypass -File tools\install-service.ps1 -KeepAwake`
3. Add `https://<your-machine>.<your-tailnet>.ts.net` to your OAuth client's JavaScript origins.
4. After code changes: `npm run serve:update`.

macOS/Linux: run `npm run build && npm run serve` under your own service manager (launchd,
systemd) instead of the PowerShell script.

Who can get in: anyone can load the app's code (it contains no data); every data request must carry
a Google token issued to *your* client ID for an email in `VITE_ALLOWED_EMAILS`, otherwise `401`.

---

## 8. Make it yours

| What | Where |
| --- | --- |
| Household members, joint-account owners, account labels | Settings / Accounts pages (saved to `config/settings.json`) |
| Spending categories and the built-in merchant keyword lists (Canadian chains) | `src/data/categories.ts` |
| Your own merchant → category rules | Spending page (recategorise a transaction) → `config/settings.json` → `rules` |
| Names that appear on e-Transfers between your household (not counted as spending) | Settings → circle |
| Marginal tax rate (default 0.33), birth year (for projections) | Settings / Projections pages |
| Known ETFs / asset classes | `src/data/instruments.ts`, `tools/fund-holdings.ts` |
| Market data sources (Yahoo, Bank of Canada, iShares, RBC GAM, Sun Life fact sheets…) | `tools/market.ts` and friends |
| Country/tax specifics (CRA limits, India macro data) | `src/data/room.ts`, `src/data/limits.ts`, `docs/research/data-sources.md` |
| Port / CSP / build options | `vite.config.ts` |

---

## 9. Publish a public demo (optional)

`npm run build:demo` produces `dist-demo/`: demo data only, no sign-in, every private-file call
disabled, and your `.env.local` values blanked. Guide: [`docs/demo.md`](docs/demo.md). Always run
the leak check in that guide before publishing.

---

## Your data and git

- The always-on server tries to `git commit` every file it saves (statements, settings, history)
  so you get version history for free (`tools/api.ts`).
- With the shipped `.gitignore`, those personal files are ignored, so the commit is skipped and
  the files are just saved on disk. **This is the safe default — keep it if your repo is public or
  might ever be.**
- Only if your repo is **private** and you want that history, remove the personal-data lines from
  `.gitignore`. Even then, never push that repo anywhere public.
- Before making any repo public, check: `git ls-files statements data config contribution-limits.yaml .env.local`
  should list only READMEs and `*.example.*` files.

## Security notes

- Sign-in tokens live in `sessionStorage` (gone when the tab closes). Production builds carry a
  strict Content-Security-Policy (`vite.config.ts`).
- The server only reads/writes an allowlist of paths (`tools/api.ts → isReadable/isWritable`).
- Only ticker symbols and fund names leave your machine for market data, never amounts or
  account details.
- Background reading: `docs/research/security-architecture.md`.
