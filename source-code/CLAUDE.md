# CLAUDE.md — instructions for the AI assistant setting this app up

You (Claude, Copilot or any coding assistant) are helping a **new owner** set up this personal
finance dashboard for themselves. It was shared by its original author **with all of their data
removed**, so out of the box only the demo works. Your job: find out what's missing, walk the human
through the steps only *they* can do (accounts, consoles, downloads), and do the file and code work
yourself.

Read these first, in this order:
1. [SETUP.md](SETUP.md): the full setup guide and the "what's in / what isn't" table
2. [README.md](README.md): what the app is
3. Only when needed: [statements/README.md](statements/README.md), [config/README.md](config/README.md),
   [data/README.md](data/README.md), [docs/self-hosting.md](docs/self-hosting.md), [docs/demo.md](docs/demo.md)

---

## Ground rules (do not break these)

1. **Every example value in this repo is fictional**: "Maple Bank", "Northwind", "Example Corp",
   `a_0000…`, `1234`, `ANYTOWN`, `<your-…>` placeholders. Never treat them as real data, and never try
   to find or recreate the original author's files. They aren't here, on purpose.
2. **The new owner's data is private.** Never commit, paste into issues/PRs, or send anywhere:
   `.env.local`, `config/settings.json`, `contribution-limits.yaml`, anything in `data/` or
   `statements/` (except their READMEs). `.gitignore` already excludes them; don't weaken it unless
   the owner explicitly says their repo is private *and* asks for it (see SETUP.md → "Your data and git").
3. **Don't read their statements' contents into chat when you don't need to.** To build a parser
   for a new bank, use `node tools/pdf-structure.ts <file.pdf>`, which masks every digit and
   non-generic word.
4. The Google OAuth **client ID** is public by design and fine to put in `.env.local`. The client
   **secret** is never needed. If the human offers it, tell them not to share it.
5. Don't change app behaviour while setting up. Configuration lives in `.env.local`, the app's
   Settings pages (→ `config/settings.json`), `contribution-limits.yaml` and `statements/`.

---

## Step 0: check where they are (run this before saying anything else)

Run these read-only checks and keep the results to yourself. Never print the contents of `.env.local`.

```bash
node -v                                                        # needs v24 or newer
test -d node_modules && echo deps-ok || echo deps-missing
test -f .env.local && echo env-ok || echo env-missing
grep -qE '^VITE_GOOGLE_CLIENT_ID=.+' .env.local 2>/dev/null && echo client-id-ok || echo client-id-missing
grep -qE '^VITE_ALLOWED_EMAILS=.+' .env.local 2>/dev/null && echo emails-ok || echo emails-missing
test -f contribution-limits.yaml && echo limits-ok || echo limits-missing
ls statements                                                  # only README.md = no statement accounts yet
test -f config/settings.json && echo settings-exist || echo settings-not-yet  # normal before first use
```

Then tell the human, in plain language, **what will and won't work right now** and **which steps
are left**. Use the checklist below, and only list the steps that still apply:

| Missing | What they'll see | Step |
| --- | --- | --- |
| Node < 24 / deps | `npm run dev` or `node tools/*.ts` fails on TypeScript syntax or `import.meta.main` | H1 |
| Client ID | A "Connect Google Sheets" setup page instead of the sign-in screen | H2 |
| Allowed emails | Always-on server refuses to start: *"Set VITE_ALLOWED_EMAILS in .env.local…"*; sign-in says *"… isn't allowed to use this app."* if their email isn't listed | H2 |
| Sheets | Signed in but empty dashboards; the Data page has no sources | H3 |
| Statements | Cards/banks that Wealthica doesn't sync are missing or have no transactions | H4 (optional) |
| Limits file | Contribution room page shows "limit unknown" | H5 (optional) |
| Always-on | Works only on this computer while `npm run dev` is running | H6 (optional) |

Demo mode (fictional data) works with **nothing** set up: on the sign-in screen, "Explore with demo
data instead". Suggest it first so they can see what they're building toward.

---

## The human steps, in order

Present **one step at a time**. Say why it's needed, what they'll click, and what to send you back.
Wait for them to confirm before moving on. After each step, verify it yourself (column "You verify").

### H1. Install the basics (≈10 min)
- **Human:** install **Node.js 24+** (nodejs.org, LTS) and **git**. Windows, macOS or Linux are all fine.
- **You:** `npm ci`, `cp .env.example .env.local`, `npm test` (all tests should pass), `npm run dev`.
- **You verify:** http://localhost:3000 loads. Ask them to try demo mode.
- **If port 3000 is busy:** the port is fixed on purpose (`strictPort` in `vite.config.ts`, because
  Google sign-in must match the exact origin). Free the port; don't change it unless you also update
  the OAuth origin in H2.

### H2. Google sign-in (≈15 min, Google Cloud console; only the human can do this)
- **Human**, at console.cloud.google.com:
  1. Create a project (any name).
  2. *APIs & Services → Library* → enable **Google Sheets API**.
  3. *Google Auth Platform → Get started*: audience **External**. Under **Test users**, add every Gmail
     address that will sign in.
  4. *Clients → Create client → Web application*. Under **Authorized JavaScript origins**, add
     `http://localhost:3000`. No redirect URIs are needed.
  5. Send you the **Client ID** (ends in `.apps.googleusercontent.com`) and the list of allowed emails.
- **You:** set `VITE_GOOGLE_CLIENT_ID=` and `VITE_ALLOWED_EMAILS=` (comma-separated) in `.env.local`,
  then restart `npm run dev`.
- **You verify:** the sign-in screen appears and they can sign in.
- **Common failures:**
  - Google shows *origin_mismatch* / *invalid origin*: the origin in step 4 must be exactly
    `http://localhost:3000` (no trailing slash).
  - *"access blocked / app not verified"*: the email isn't under **Test users**.
  - *"Read access to Google Sheets was not granted."*: they unticked the Sheets permission in
    Google's consent popup. Sign in again and allow it.
  - *"… isn't allowed to use this app."*: that email isn't in `VITE_ALLOWED_EMAILS`.

### H3. Connect their accounts: Wealthica → Google Sheets (≈30 min + sync time)
- **Human:**
  1. Create a Wealthica account (wealthica.com) and connect their banks and brokerages.
  2. Set up Wealthica's Google Sheets export/sync so they get three spreadsheets (any names): **accounts/
     balances**, **positions**, **transactions**. Use the same Google account as in H2, or share the
     sheets with it.
  3. In the app → **Data** → paste each sheet's link.
- **You verify:** the Data page recognises all three. *"Not recognised as a Wealthica export"* means
  the headers differ from what `src/data/table.ts → detectKind` expects (see SETUP.md §4). Use the
  sheet inspector on the **Data** page to see the actual columns, then adapt `detectKind` and the column reads in
  `src/data/build.ts`, keeping the tests green.
- **No Wealthica?** They can keep sheets by hand with the same headers. The header lists are in
  `src/data/demo.ts` (`POS_H`, `TXN_H`, …). Offer to generate empty template sheets as CSV for them
  to import.

### H4. Statements for accounts Wealthica can't sync (optional, per account)
- **Human:** download statements from online banking, **CSV preferred** (exact), otherwise text PDFs
  (scanned/image PDFs can't be read). Tell you the bank, the account type, and whether Wealthica
  already has the account.
- **You:** create `statements/<folder>/account.yaml` from `docs/examples/statements/`, place the
  files as `YYYY/YYYY-MM.pdf|csv`, and check the per-file counts on the app's **Data** page or with
  `node tools/check-statements.ts statements/<folder>`.
- **Supported PDF layouts:** Scotiabank (chequing + credit cards) and RBC credit cards. For any
  other PDF layout: mark the account `pending: true`, run `node tools/pdf-structure.ts` on one
  statement (masked output), add a profile in `tools/pdf-profiles.ts` with a **synthetic** test in
  `tools/pdf-profiles.test.ts`, then remove `pending`.

### H5. Contribution limits (optional, Canada, ≈5 min once a year)
- **Human:** from CRA My Account (or their notice of assessment), get the TFSA room, RRSP deduction
  limit and FHSA participation room for the current year.
- **You:** `cp contribution-limits.example.yaml contribution-limits.yaml` and fill in those numbers.
  Don't echo them back in chat.

### H6. Always on, reachable from their phone (optional, ≈20 min)
Follow [docs/self-hosting.md](docs/self-hosting.md). Human parts:
- Install **Tailscale**, sign in, then approve **Funnel** when `tailscale funnel --bg 18787` prints a link.
- On Windows, run `powershell -ExecutionPolicy Bypass -File tools\install-service.ps1 -KeepAwake`
  from an **Administrator** PowerShell. On macOS/Linux, help them make a launchd/systemd service
  running `npm run serve` after `npm run build`.
- Add `https://<their-machine>.<their-tailnet>.ts.net` to the OAuth client's **Authorized JavaScript
  origins** (H2, step 4).
- **You verify:** `curl https://<their host>/api/statements` returns `401`. The app works from their
  phone after sign-in. After any code change: `npm run serve:update` (Windows).

### H7. Make it theirs (in the app, ongoing)
Walk them through these pages, in the app itself (no file editing needed):
- **Settings → Household:** people. On the Accounts page, set owners for joint accounts.
- **Settings → circle:** names that appear on e-Transfers between family members.
- **Accounts:** labels, closed accounts.
- **Spending:** recategorise a few transactions; that creates their rules.
- **Projections:** birth year (optional). **Settings:** marginal tax rate (default 0.33).
- **Holding detail:** link a fund to a market symbol if prices/look-through are missing.

All of this is saved to `config/settings.json` automatically (git-ignored).

---

## Working on the code afterwards

- `npm test` (Vitest), `npm run typecheck`, `npm run dev`. Keep tests green; fixtures stay fictional.
- Layout: `src/data/` (pure domain logic + tests), `src/features/` (pages), `src/components/`
  (charts/UI), `src/lib/` (auth, sheets, private-file client), `tools/` (Node server, API, parsers,
  market data).
- The server only reads/writes an allowlist of paths (`tools/api.ts → isReadable / isWritable`).
  Extend it deliberately.
- Before they publish anything (repo or demo): `git ls-files statements data config contribution-limits.yaml .env.local`
  must list only READMEs and `*.example.*` files. For a public demo, run the leak check in [docs/demo.md](docs/demo.md).
