# Running it from your own machine

Your machine is the server. Nothing is paid for, and GitHub isn't needed to use the app.

## How it works

- **`tools/server.ts`** serves the built app (`dist/`) plus a small private-file API
  (`tools/api.ts`). It listens on `127.0.0.1:18787` only, so nothing else on your network can
  reach it directly.
- **Tailscale Funnel** publishes that port at `https://<your-machine>.<your-tailnet>.ts.net`.
  It's free on the personal plan, the address never changes, and the HTTPS certificate is handled
  for you. Tailscale runs as a Windows service, so it's up from boot.
- **Who gets in:**
  - Anyone with the URL can load the app's code. It contains no data.
  - Every data request has to carry your Google sign-in token. The server checks it with Google:
    it must have been issued to this app's client ID, for a verified email in
    `VITE_ALLOWED_EMAILS` (`.env.local`, see SETUP.md).
  - Anything else gets `401`, and only allowlisted paths are reachable: `statements/`, limits,
    settings, history.
- **Your files stay in the repo folders on your machine:**
  - `statements/<account>/<YYYY>/<YYYY-MM>.pdf`, or `statements/<account>/<YYYY>.csv` for
    yearly-ledger accounts such as a credit card you export as CSV (see `statements/README.md`)
  - `config/settings.json`: settings, rules, circle, Wealthica sheet IDs
  - `data/history.csv`: daily net-worth snapshots
  - `contribution-limits.yaml`

  Each save from the app is also committed to the local git history, so nothing is ever lost.
  Pushing to GitHub is optional.
- **Wealthica data** is read live from Google Sheets in your browser, with your own sign-in.

## One-time setup

1. **Turn on Funnel.** Run `tailscale funnel --bg 18787` once. If it prints a link to enable
   Funnel, open it, approve, and run the command again. The setting is kept across restarts.
2. **Start at boot.** From an *Administrator* PowerShell in this folder, run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File tools\install-service.ps1 -KeepAwake
   ```

   This registers the scheduled task *Financials*. The task:
   - starts at boot (before login) and at logon
   - runs as you, without storing a password
   - restarts every minute if it stops

   `-KeepAwake` stops the machine sleeping while it's plugged in.
3. **Google sign-in from the new address:**
   1. Google Cloud console → Google Auth Platform → Clients → your Web client.
   2. Under *Authorized JavaScript origins*, add `https://<your-machine>.<your-tailnet>.ts.net`.
   3. Keep `http://localhost:3000` there for development.

## Day to day

- **New statements:** use *Upload statements* in the app, from any device. Drop the PDFs/CSVs
  and each one is checked against its statement totals, filed by account and month, saved and
  committed.
- **CSV-export accounts** (e.g. a Wealthsimple credit card): export the CSV whenever you like and
  import it from *Settings → Statement accounts → Import CSV* (or drop it into
  `statements/<account>/`). Only transactions newer than what `<year>.csv` already has are added;
  the export itself is deleted.
- **After changing the code:** run `npm run serve:update`. It rebuilds, then restarts the task.
- **Development** (`npm run dev`, http://localhost:3000) uses the same API and checks the same
  sign-in. It doesn't auto-commit.

## Checks

- `Get-ScheduledTask Financials | Get-ScheduledTaskInfo` shows the last run and its result.
- `tailscale funnel status` shows what's published.
- `curl https://<your-machine>.<your-tailnet>.ts.net/api/statements` should answer `401` (no sign-in).
