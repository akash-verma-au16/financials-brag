# Security & Architecture Research — Private Personal-Finance Dashboard

- Date: 2026-10-13
- Scope: React + TypeScript SPA, private GitHub repo, GitHub Actions build, Wealthica → Google Sheets data, manual accounts (e.g. foreign or household members' accounts), public macro data cron.
- Status: research and recommendation only. No app code.

Legend: **[V]** = verified against current vendor docs during this research; **[U]** = from secondary sources or memory, confirm before relying on it.

---

## 0. TL;DR — Recommended architecture

```
                         ┌───────────────────────────── Cloudflare (free) ─────────────────────────────┐
 Browser ──HTTPS──►      │ Cloudflare Access (Zero Trust Free, ≤50 users)  ──►  Cloudflare Pages (static)│
                         │  login: Google IdP or email OTP, allow-list of emails                         │
                         └───────────────────────────────────────────────────────────────────────────────┘
    │  static bundle contains: code, OAuth *client ID* (public), public macro JSON. NO secrets, NO personal data.
    │
    ├──► Google Identity Services (token model) ──► access token (~1h, memory only)
    │        scopes: drive.file (+ Google Picker) [preferred] or spreadsheets.readonly
    │
    ├──► Sheets API v4 ──► Sheet A: "Wealthica export" (read-only, written daily by Wealthica)
    │                  └─► Sheet B: "Manual accounts" (read/write; e.g. FDs, real estate, household…)
    │
    └──► IndexedDB cache, AES-GCM encrypted with key derived from a local passphrase (Argon2id/PBKDF2),
         auto-lock on idle; key never persisted.

 GitHub Actions (private repo): build + deploy; daily cron fetches PUBLIC macro data (FRED key = Actions secret)
                                and commits/deploys macro.json. Actions never touch personal data.
```

Why: personal data never leaves Google + the user's browser; the host only serves code; Google account security (2FA + passkeys) is the real authorization boundary; Cloudflare Access adds a genuine server-side gate in front of the code for free; Drive sharing is the family access-control mechanism.

---

## 1. Verified platform facts

### 1.1 GitHub Pages and private repos
- **GitHub Free: Pages only from public repositories.** [V — docs.github.com "GitHub's plans": Free includes "GitHub Pages in public repositories"]. If you're on Free, **a private repo cannot publish to Pages today** without upgrading.
- **GitHub Pro / Team:** Pages from private repositories is available [V]. GitHub Team is $4/user/month [V, github.com/pricing]; GitHub Pro is $4/month (or $48/yr) [U — not shown on the pricing page fetch; long-standing price].
- **A Pages site built from a private repo is still publicly reachable on the internet** on Free/Pro/Team. Only the *source* is private. **Access-controlled ("private") Pages requires GitHub Enterprise Cloud, organization-owned repos, project sites only** [V — "Changing the visibility of your GitHub Pages site"]. Not realistic for a personal project.
- Limits [V]: 1 GB site, 100 GB/month soft bandwidth, 10-min deploy timeout, 10 builds/hr soft limit (not applied to custom Actions workflows).
- **GitHub Pages cannot set custom HTTP response headers** (no CSP header, no `X-Frame-Options`, no `Permissions-Policy`) [well-known platform limitation]. CSP is meta-tag only (see §5).

**Implication:** On GitHub Pages the URL is public. The bundle must contain zero secrets and zero personal data, and all protection rests on Google OAuth + client-side crypto. Anyone can download and study the JS.

### 1.2 Google OAuth — "Testing" publishing status [V — support.google.com/cloud/answer/15549945]
- Up to **100 test users** listed on the consent screen.
- **Authorizations by test users expire 7 days after consent** (refresh tokens too) for any scope beyond `openid`/`email`/`profile`. Practical effect: re-consent popup about once a week. With the browser token model there are no refresh tokens anyway.
- Test users see an "unverified app / you have test access" warning before granting. Verification isn't required while in Testing; that requirement applies to apps In production that request sensitive/restricted scopes.
- Scope classes [V — Sheets API scopes page]: `spreadsheets` = **sensitive**, `spreadsheets.readonly` = **sensitive**, `drive.file` = **non-sensitive, "Recommended"**, which covers only files the app created or the user explicitly opened with the app (e.g. via Google Picker).
- An app In production that uses only non-sensitive scopes (`drive.file` + `openid email`) generally doesn't need sensitive-scope verification, and authorizations don't expire after 7 days [U — confirm brand-verification requirements in the console at the time; unverified production apps with sensitive scopes also have a 100-user lifetime cap].

### 1.3 Google Identity Services token model [V — developers.google.com/identity/oauth2/web/guides/use-token-model]
- `initTokenClient({client_id, scope, callback})` → `requestAccessToken()`, which **must be triggered by a user gesture** (popup).
- Access tokens are short-lived (~1 h [U on exact figure, standard Google value]). No refresh token is issued to the browser. Call `requestAccessToken({prompt: ''})` again to renew. If the user is still signed in and consent is still valid, this is a near-instant popup.
- Consent is stored per user + client ID. `google.accounts.oauth2.revoke(token)` removes it.
- Check `hasGrantedAllScopes()` after the callback. Users can deselect scopes on the granular consent screen.

### 1.4 Wealthica
- **Google Sheets export "power-up"**: you link institutions in Wealthica, enable the add-on, click "Authorize your Google account", choose **positions, transactions, or both**, and optionally limit it to selected accounts. Wealthica then **creates/updates a spreadsheet in the user's own Google Drive** [V — wealthica.com/export-to-spreadsheet and Wealthica blog]. Data updates daily after Wealthica finishes syncing, and there's a manual "Refresh" [V]. The Excel export is a separate product.
- **Price:** the export page says Premium "includes Google Sheets export for FREE". Historical standalone price was ~$5.99/month [U — check current pricing page].
- **Tabs/columns: not publicly documented.** The blog example references a sheet named `Transactions` with the transaction type in column C [V]. From memory of user reports [U], tabs are typically `Positions`/`Holdings` and `Transactions`, with columns such as: Institution, Account (name/number/type), Currency, Symbol, Name/Description, Quantity, Book value, Market value, Price, Gain/loss, Asset class (positions); Date, Account, Type (buy/sell/dividend/interest/deposit/withdrawal/fee/transfer), Symbol, Quantity, Amount, Currency, Description (transactions).
  - **Action for owner:** export once and paste the **header row only** (no data) into `docs/research/wealthica-schema.md`. The app must parse **by header name, not column index**, and fail loudly on unknown or missing headers, because Wealthica may change the layout.
  - **Gotcha [V — help.wealthica.com]:** automatic updates **overwrite formulas** in the export sheet. Never put app data or formulas in Sheet A. Keep manual data in a separate Sheet B (matches the recommendation in §2).
  - **Balances:** cash balances usually appear as cash positions (e.g. symbol CAD/USD cash) [U]. Bank chequing balances may not be exported. Verify against the real export.
- **Wealthica API:** a **B2B "Investment API"** for teams building apps for their users: you contact Wealthica for Client ID + **Client Secret (backend only)**, `POST /auth/token` per end user (1 h token), and a Connect widget [V — wealthica.com/docs]. It **needs a backend to hold the secret**, it's aimed at businesses, and pricing isn't public. **Not suitable** for a static personal app. Use the Sheets export.

### 1.5 Hosting alternatives
| Option | Cost | Real auth gate? | Custom headers (CSP etc.) | Notes |
|---|---|---|---|---|
| GitHub Pages, public repo | $0 | No | No (meta only) | Source code public (OK if no secrets), but it reveals data model/sheet structure. |
| GitHub Pages, private repo (Pro) | ~$4/mo [U] | **No**, site is public | No | Pays only to hide source; site is still open. |
| GitHub Enterprise Cloud private Pages | ~$21/user/mo [U] + org | Yes (GitHub login) | No | Overkill. |
| **Cloudflare Pages + Cloudflare Access** | **$0** (Zero Trust Free, **up to 50 users** [U — consistent across multiple 2026 sources; confirm in dashboard]; PAYG ~$7/user/mo beyond) | **Yes**, edge-enforced before any byte is served | **Yes** (`_headers` file) | Login via Google IdP or email one-time PIN (PIN valid 10 min, single use [V]). Must also protect `*.pages.dev` and preview URLs (see §3). Works with a private GitHub repo on GitHub Free. |
| Netlify Pro password protection | ~$19–20/mo [U] | Shared password (Basic-style) | Yes | Shared password, no per-user identity. |
| Vercel Pro password protection | $20/mo per protected project on top of Pro (old $150 add-on removed Sept 2026) [V-ish: Vercel docs + tracker] | Shared password | Yes | Expensive for one personal app. Vercel Authentication (team members only) is another option. |

Note [U]: Cloudflare is steering new projects toward **Workers Static Assets** ("Workers & Pages"). Either works. Access protects either via a hostname-scoped Access application.

---

## 2. Q1 — How the browser should read private Google Sheets

### (a) Client-side OAuth, GIS token model — **RECOMMENDED**
- **Flow:** user clicks "Connect Google" → GIS popup → access token in JS memory → `fetch https://sheets.googleapis.com/v4/spreadsheets/{id}/values:batchGet` → parse → render.
- **Scope choice:**
  - **Preferred: `drive.file` + Google Picker.** Non-sensitive. The user picks Sheet A (Wealthica) once in the Picker, which grants per-file access. Sheet B is created by the app, so it's accessible automatically. **Blast radius = only those files**, even if the token leaks via XSS. Picker needs an API key (restricted by HTTP referrer + Picker API only; public-safe) [U on Picker details; well-established pattern].
  - **Fallback: `spreadsheets.readonly`** (sensitive). Simpler, with no Picker. But a stolen token reads **every** spreadsheet in the account, and Sheet B writes would need `spreadsheets` (read/write on all sheets). Avoid.
- **Consent screen:** create a dedicated GCP project and keep it **In Testing** with only the owner's (and later family's) Gmail addresses as test users (≤100). Accept the weekly re-consent. If that becomes annoying and only `drive.file` + `openid email` are used, consider moving to In production (non-sensitive scopes only).
- **Pros:** no backend, no stored secrets, data never touches GitHub/Cloudflare, revocable from myaccount.google.com, per-person audit, Drive sharing = ACL. Family members use their own Google accounts and see only sheets shared with them.
- **Cons:** XSS in the app = token theft (mitigate with CSP + minimal deps + `drive.file`). Popup UX every hour/week. Requires network for fresh data (mitigated by the encrypted cache).
- **2FA/passkeys:** **fully preserved**. Google does authentication in its own popup on `accounts.google.com`. The app never sees credentials. Passkey/2FA is enforced at Google sign-in, and the app only receives a scoped, short-lived token.

### (b) Service account + GitHub Action that encrypts and publishes — acceptable alternative, not recommended as primary
- **Flow:** share Sheet A/B with `sa@project.iam.gserviceaccount.com` (Viewer) → scheduled Action reads via Sheets API → encrypts JSON (AES-256-GCM, key from passphrase via Argon2id) → publishes ciphertext with the site → browser asks for passphrase and decrypts.
- **Credentials:** prefer **Workload Identity Federation (GitHub OIDC → GCP)**, so there's no long-lived JSON key [U on setup details; standard pattern]. If you must use a key, store it only as an Actions **environment** secret, rotate it, and restrict the SA to no IAM roles (sheet sharing is enough).
- **Pros:** fast page load, works offline, no Google popup, viewer needs no Google account.
- **Cons (serious):** **ciphertext is published to a public URL forever** (Git history, CDN caches, archive crawlers). Security collapses to passphrase strength under **unlimited offline brute force**, and you can't revoke a past leak. The passphrase must be shared with family, so there's no per-person revocation. The SA key/WIF config is a new standing credential that can read all financial data. Sheet B edits would need a write path anyway.
- **2FA/passkeys:** **bypassed by design**. The SA authenticates with a key/OIDC, not the user's Google login. Google account 2FA no longer protects this data path. That's the main reason it's second choice.

### (c) Google Apps Script web app — possible, not recommended
- **Flow:** a script bound to the sheet, deployed as a web app "Execute as: me, Access: only myself / specific users", returns JSON (`doGet`).
- **Pros:** no GCP OAuth client needed, and Apps Script can do server-side shaping.
- **Cons:** CORS/redirect quirks (`script.googleusercontent.com` redirects; it's awkward from a SPA, often forcing JSONP-like hacks or "Anyone" access). **The tempting "Anyone, even anonymous" deployment makes the URL a bearer secret**, which is a classic leak. Quotas, cold starts, a second codebase, and less observable.
- **2FA/passkeys:** preserved only if the deployment requires Google sign-in ("Only myself"/domain users). An "Anyone" deployment bypasses them entirely.

### (d) Publish to the web — **REJECT**
- File → Share → Publish to web makes the sheet readable by **anyone with the URL, without sign-in**. The URL is guessable/leakable via Referer headers, logs, browser history, and shared screenshots. It's indexed if linked anywhere and cached by Google for minutes after unpublishing. "Restricted" sharing doesn't apply to the published copy.
- It bundles account numbers, balances, and holdings, which is high-value data for social engineering and SIM-swap targeting.
- **2FA/passkeys are completely irrelevant**: no authentication happens at all.

---

## 3. Q2 — Where manual/editable data should live

| Criterion | Second private Google Sheet (Sheet B) | Encrypted blob committed to repo | IndexedDB only |
|---|---|---|---|
| Confidentiality | Google account security (2FA/passkeys) + Drive ACL | Passphrase strength vs offline brute force; history is permanent | Device-local; lost with device/browser data |
| Multi-device | Yes | Yes (needs a write path = GitHub token in browser, which is bad) | No |
| Family sharing | Native (share sheet, per-person, revocable) | Shared passphrase, no revocation | No |
| Editing | Sheets API from the browser, or edit directly in Google Sheets UI | Browser would need a GitHub PAT to commit, which is a big secret in the client | Easy |
| Backup/history | Sheets version history | Git history | None |
| Works with GitHub Pages / CF Pages | Yes | Yes | Yes |

**Recommendation: Sheet B (private Google Sheet, created by the app under `drive.file`).**
- Structure it as normalized tabs (`Persons`, `Institutions`, `Accounts`, `Holdings`, `Valuations`, `Ownership`, `FX`, `Tags`), each with a header row and stable IDs (ULID/UUID). The app writes via `values.append`/`values.batchUpdate`. Use `ProtectedRange` on ID columns to reduce accidental edits.
- Share Sheet B with family members as Viewer or Editor per person. For per-family-member privacy, use **one Sheet B per person** and share each household member's sheet as needed. Drive can't restrict at tab level.
- **IndexedDB as an encrypted cache only** (not source of truth) for offline/fast load. See §5 for the lock design.
- **Reject the committed encrypted blob** for live data (permanent public ciphertext, shared secret, no revocation, and editing needs a repo-write token in the browser). It's acceptable only as an *optional offline export/backup file* that the user keeps locally, never committed.

Do not store full account numbers. Store last-4 / masked IDs only. No passwords, PINs, net-banking IDs, PAN/Aadhaar/SIN anywhere in Sheet B.

---

## 4. Q3 — Hosting recommendation

**Recommended: Cloudflare Pages (or Workers Static Assets) + Cloudflare Access (Zero Trust Free).** Keep the GitHub repo private on GitHub Free.
- **Deploy:** either Cloudflare's GitHub integration (it gets read access to the repo) or GitHub Actions → `wrangler pages deploy` with a **scoped Cloudflare API token** (Pages:Edit for that account only) stored as an Actions environment secret.
- **Access application:** cover the custom domain *and* `<project>.pages.dev` *and* `*.<project>.pages.dev` (preview deployments), or disable previews. **An unprotected `pages.dev` hostname is the most common bypass.**
- **Policy:** Allow → Emails = explicit list (owner, later family). No "Emails ending in @gmail.com". Login methods: Google IdP (passkeys/2FA apply) and/or One-time PIN. Session duration 24 h or less.
- **Headers:** a `_headers` file sets real CSP, `frame-ancestors 'none'`, HSTS, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `X-Content-Type-Options`, and `Cross-Origin-Opener-Policy: same-origin-allow-popups` (needed for the GIS popup).
- Free. A real server-side gate means strangers can't even fetch the JS bundle. Up to 50 users [U].

**If the owner insists on GitHub Pages:**
- Option 1: make the repo **public** (free). Acceptable *only if* the repo contains zero secrets/personal data, which the design guarantees. But it reveals the data model and sheet IDs if they're hard-coded, so don't hard-code them: let the Picker choose them and store them in localStorage.
- Option 2: pay for **GitHub Pro (~$4/mo)** to keep source private. The site is still public.
- In both cases the app works securely because protection = Google OAuth + `drive.file` + Drive ACL. You lose the edge gate and real headers, and CSP is meta-only.

---

## 5. Q4 — The "static credential sign-in": honest assessment and layered design

### What a client-side password on a static site can and cannot do
- **Cannot:** authenticate anyone. All JS is downloadable, and any `if (hash(pw) === "…")` check can be skipped in DevTools. A hard-coded hash is **brute-forceable offline** with no rate limiting. A "static credential" in a `VITE_` env var is shipped in the bundle in plaintext. **There's no such thing as an uncrackable static-site login.** Anything compiled into a static bundle is public.
- **Can:** (1) act as a **key-derivation input** to *decrypt* data that's only available as ciphertext. Strength then = passphrase entropy × KDF cost, with no rate limit. (2) Provide a **local lock** (UX, shoulder-surfing, a borrowed or unlocked laptop) over an encrypted cache.
- Real authentication requires a server-side check: **Cloudflare Access (edge)** and **Google (OAuth)** are the "servers" in this design.

### Layered model
| Layer | Mechanism | Protects against | Strength |
|---|---|---|---|
| L1 Edge gate | Cloudflare Access, email allow-list, Google IdP or OTP, 24 h session | Strangers fetching the app, recon of code, bots | Server-enforced. Free. |
| L2 Data authorization | Google OAuth (GIS token model), `drive.file`, consent screen Testing with listed test users, Drive sharing per person | Anyone without the Google account (and its passkey/2FA) reading data | Google's account security. Revocable. Per-person. |
| L3 Local vault | Passphrase → **Argon2id** (m≥19 MiB, t=2, p=1 per OWASP; prefer m=64 MiB, t=3 for a single-user unlock) via WASM (e.g. `hash-wasm`), or **PBKDF2-HMAC-SHA256 ≥600,000 iterations** [V — OWASP] via WebCrypto (no dependency) → AES-256-GCM key, imported as **non-extractable** `CryptoKey`; random 16-byte salt per vault, 12-byte random IV per record | Theft of device/browser profile; someone using an unlocked machine later | Strong if passphrase ≥ 5–6 diceware words |
| L4 Session hygiene | Auto-lock after 5–10 min idle and on `visibilitychange` hidden > N min: drop `CryptoKey` + OAuth token from memory and clear decrypted React state. "Lock now" button. Revoke token on sign-out. | Walk-away exposure | — |
| L5 Code integrity | CSP, minimal deps, pinned actions, branch protection | XSS/supply chain stealing tokens or decrypted data in memory | Most likely real-world threat. Treat as top priority. |

Notes:
- Never persist the access token or derived key (no localStorage/sessionStorage). Memory only.
- Encrypted cache records: `{v, salt, iv, ciphertext, createdAt}`. Wrong passphrase → GCM auth failure. Offer "forget this device", which wipes IndexedDB.
- Passkeys for the local vault: WebAuthn **PRF extension** can derive a vault key from a passkey (no passphrase) on supporting platforms [U — browser support improving in 2025–26]. Treat it as a future option.
- Family members: added to the Access allow-list + OAuth test users + Drive sharing. Each has their own local passphrase on their own device. **No shared secrets.**

---

## 6. Q5 — Hardening checklist

### Content Security Policy
- Prefer a real header (Cloudflare `_headers`). On GitHub Pages, use `<meta http-equiv="Content-Security-Policy">` as the **first** element in `<head>`.
- **Meta-tag limitations:** `frame-ancestors`, `report-uri`/`report-to`, and `sandbox` are **ignored in meta**. Clickjacking protection isn't possible on GitHub Pages (use a JS frame-buster as a weak fallback). There's no violation reporting, and the policy only applies to content parsed after it.
- Starting policy (adjust after testing GIS/Picker):
  ```
  default-src 'none';
  script-src 'self' https://accounts.google.com/gsi/client https://apis.google.com;
  connect-src 'self' https://sheets.googleapis.com https://www.googleapis.com https://oauth2.googleapis.com;
  frame-src https://accounts.google.com https://docs.google.com;   (Picker)
  img-src 'self' data:;
  style-src 'self' https://accounts.google.com/gsi/style;
  font-src 'self';
  worker-src 'self';  (if Argon2 runs in a worker; add 'wasm-unsafe-eval' to script-src for WASM)
  base-uri 'none'; form-action 'none'; object-src 'none';
  frame-ancestors 'none';   (header only)
  upgrade-insecure-requests;
  require-trusted-types-for 'script';  (test; GIS may conflict)
  ```
- No `'unsafe-inline'`/`'unsafe-eval'`. Vite production builds don't need inline scripts. Remove any inline theme scripts.
- `Cross-Origin-Opener-Policy: same-origin-allow-popups` (header) so the GIS popup can post back.

### Secrets and build
- **Nothing secret in `VITE_*` env vars.** Every `VITE_` value is inlined into public JS. Allowed: Google OAuth client ID, Picker API key (referrer-restricted), Cloudflare-free public config.
- **FRED API key:** GitHub Actions **secret**, used only in the cron workflow that writes `public/data/macro.json`. Never passed to the Vite build. Use a separate workflow/job from the build. Scrub logs (`::add-mask::`). The JSON contains only public series values.
- Google OAuth client: type "Web application". **Authorized JavaScript origins = exact production origin(s) only** (e.g. `https://finance.example.com`), plus `http://localhost:3000` in a *separate* dev client ID. No redirect URIs needed for the token model. A client ID is public-safe but origin-bound.
- Picker/API key: restrict to the **Picker API** and **HTTP referrers** = the production origin.
- Separate GCP project for this app only, with no other APIs enabled. Optional billing alerts.

### GitHub repository settings
- Repo **private**. 2FA/passkey on the GitHub account. Fine-grained PATs only, with expiry.
- Branch protection / ruleset on `main`: require PR (even solo, for review/diff discipline), block force-push/deletion, require status checks, require signed commits (optional).
- **Secret scanning + push protection** enabled (available for private repos on user accounts? [U — GitHub has expanded free secret scanning for private repos via "Secret Protection"; check Settings → Code security]). At minimum, add a local pre-commit `gitleaks` hook.
- **Dependabot** alerts + security updates + version updates (weekly, grouped). `npm audit` in CI.
- **Actions:**
  - Workflow-level `permissions: {}` default. Grant per job (`contents: read`; deploy job: `pages: write`, `id-token: write` only where needed).
  - Settings → Actions → "Allow only actions created by GitHub and selected/verified actions". Set default GITHUB_TOKEN to read-only. Disable "Allow GitHub Actions to create and approve pull requests".
  - **Pin third-party actions to full commit SHAs** (`uses: actions/checkout@<40-char-sha> # v4.x.x`). Let Dependabot update them.
  - **Environments:** `github-pages` / `production` environment with required reviewer (self) and deployment branch = `main` only. Put deploy secrets (Cloudflare token) in the environment, not the repo.
  - No `pull_request_target` workflows. Don't run untrusted forks. Use `npm ci` with lockfile and `--ignore-scripts` where possible.
  - Cron workflow: least privilege `contents: write` only if it commits `macro.json`. Better: build artifact only.

### App/runtime
- `robots.txt` → `Disallow: /`, plus `<meta name="robots" content="noindex,nofollow">` (and `X-Robots-Tag` header on Cloudflare). Not security, but avoids indexing.
- **No analytics, no error-tracking SaaS, no third-party fonts/CDNs.** Self-host everything. Every third-party script can read decrypted data and tokens.
- **Dependency minimisation:** React, a charting lib, a date lib, and maybe `hash-wasm`. No Google API JS client (`gapi`); use plain `fetch` for Sheets REST. Audit transitive deps. Lockfile committed.
- **Subresource Integrity:** applies to cross-origin scripts. The GIS client (`accounts.google.com/gsi/client`) is versioned by Google and changes, so **SRI can't be pinned for it** (accepted risk, Google-origin). Self-host everything else (SRI then unnecessary; Vite hashes filenames). Optionally add `vite-plugin-sri` for defense in depth.
- `Referrer-Policy: no-referrer` (meta tag works on GH Pages) so sheet IDs/paths don't leak.
- Render user/sheet content as text only. No `dangerouslySetInnerHTML`, and no markdown/HTML rendering of cell values. Treat Wealthica cells as untrusted (formula-injection safe on export: prefix `=+-@` with `'` when writing back to Sheets).
- Service worker (if any): cache only static assets, never API responses.

### `.gitignore`
```
.env
.env.*
!.env.example
*.local
dist/
node_modules/
coverage/
*.pem
*.key
*service-account*.json
credentials*.json
client_secret*.json
token*.json
*.xlsx
*.csv
exports/
private/
data/private/
.DS_Store
.vscode/*  (keep shared settings if wanted)
```
Also add a CI step that fails the build if `dist/` contains `@gmail.com`, `docs.google.com/spreadsheets/d/`, long digit runs, or known fixture names (a canary for personal data in bundles).

---

## 7. Q6 — Data model sketch (TypeScript-flavoured, storage-agnostic)

```ts
type ID = string;                 // ULID
type ISODate = string;            // 'YYYY-MM-DD'
type CurrencyCode = 'CAD'|'USD'|'INR'|string; // ISO 4217
type Money = { amount: string; currency: CurrencyCode }; // decimal string, never float

interface Person      { id: ID; displayName: string; relation?: 'self'|'spouse'|'parent'|'child'|'sibling'|'other';
                        residency?: 'CA'|'IN'|'US'|string; googleEmail?: string /* for sharing only */ }
interface Household   { id: ID; name: string; memberIds: ID[]; baseCurrency: CurrencyCode }

interface Institution { id: ID; name: string; country: string; kind: 'bank'|'brokerage'|'insurer'|'government'|'crypto_exchange'|'employer_plan'|'other';
                        wealthicaInstitutionName?: string }

type AccountType =
  // Canada
  | 'chequing'|'savings'|'credit_card'|'tfsa'|'rrsp'|'rrif'|'fhsa'|'resp'|'lira'|'non_registered'|'pension'
  // US
  | '401k'|'ira'|'roth_ira'|'hsa'|'brokerage_us'
  // India
  | 'nre'|'nro'|'savings_in'|'fd'|'rd'|'ppf'|'epf'|'nps'|'demat'
  // Other
  | 'crypto'|'real_estate'|'vehicle'|'loan'|'mortgage'|'line_of_credit'|'cash'|'other_asset'|'other_liability';

interface Account {
  id: ID; institutionId?: ID; type: AccountType; name: string;
  maskedNumber?: string;          // last 4 only
  currency: CurrencyCode;
  isLiability: boolean;           // credit card, loan, mortgage, LOC
  source: 'wealthica'|'manual';
  externalKey?: string;           // stable key to match Wealthica rows (institution+account name/number)
  taxTreatment?: 'tax_free'|'tax_deferred'|'taxable'|'n/a';
  openedOn?: ISODate; closedOn?: ISODate;
  meta?: { maturityDate?: ISODate; interestRatePct?: string; compounding?: 'monthly'|'quarterly'|'annual';
           propertyAddressCity?: string; lender?: string };   // FD / mortgage / real estate specifics
  tagIds?: ID[];
}

interface Ownership { accountId: ID; personId: ID; sharePct: string /* '50' */; role?: 'owner'|'joint'|'nominee'|'beneficiary' }
// Invariant: sum(sharePct) per account = 100. Nominee/beneficiary rows carry 0%.

interface Security { id: ID; symbol?: string; isin?: string; name: string; assetClass: 'equity'|'etf'|'mutual_fund'|'bond'|'gic'|'cash'|'crypto'|'option'|'other';
                     currency: CurrencyCode; exchange?: string }

interface Holding   { id: ID; accountId: ID; securityId: ID; asOf: ISODate; quantity: string;
                      bookValue?: Money; marketValue: Money; source: 'wealthica'|'manual' }

interface Transaction { id: ID; accountId: ID; date: ISODate; type: 'buy'|'sell'|'dividend'|'interest'|'deposit'|'withdrawal'|'fee'|'tax'|'transfer_in'|'transfer_out'|'contribution'|'payment'|'other';
                        securityId?: ID; quantity?: string; amount: Money; description?: string;
                        transferGroupId?: ID;   // pairs both legs of internal transfers → excluded from income/spend
                        source: 'wealthica'|'manual'; sourceRowHash?: string /* dedupe */ }

interface ValuationSnapshot { id: ID; accountId: ID; asOf: ISODate; value: Money; method: 'holdings_sum'|'statement'|'manual_estimate'|'appraisal' }
// Used for manual accounts (FD, PPF, real estate, loans) and for net-worth history.

interface FxRate { date: ISODate; base: CurrencyCode; quote: CurrencyCode; rate: string; source: 'boc'|'fred'|'rbi'|'manual' }
interface Tag    { id: ID; name: string; color?: string }   // e.g. 'emergency-fund', 'retirement', 'kids-education'
```

**Household aggregation rule (no double counting):** for each account, value × `sharePct` for each owner. Person view = sum of their shares. Household view = sum over **distinct accounts** of value × (sum of shares held by members inside the household). A joint account between two members counts once at 100%, never 2 × 100%. A joint account with an outside party counts only the members' share. Liabilities are negative. Exclude `transferGroupId` legs from cash-flow totals. Convert at `FxRate` for `asOf`, keep original currency, and show base currency (CAD by default, INR toggle).

**Storage mapping:** Wealthica (Sheet A) → parsed into `Holding`/`Transaction` with `source:'wealthica'`, keyed by `externalKey`. Sheet B tabs mirror the manual entities 1:1 (`Persons`, `Institutions`, `Accounts`, `Ownership`, `Securities`, `Holdings`, `Transactions`, `Valuations`, `FxRates`, `Tags`), plus a `_schema` tab with a version number for migrations.

---

## 8. Decisions for the owner

| # | Decision | Recommendation |
|---|---|---|
| 1 | Hosting | **Cloudflare Pages + Access (free)**, repo stays private on GitHub Free. If GitHub Pages is mandatory: public repo with zero secrets, or Pro ~$4/mo for private source (site is public either way). |
| 2 | Sheets access method | **GIS token model in browser**. Avoid service-account publishing. Reject Publish-to-web. |
| 3 | OAuth scope | **`drive.file` + Picker** (non-sensitive, per-file). Fall back to `spreadsheets.readonly` only if Picker proves impractical. |
| 4 | Consent screen status | **Testing** with explicit test users (accept weekly re-consent). Revisit "In production" only if non-sensitive scopes only. |
| 5 | Manual data store | **Second private Google Sheet** (one per person if family privacy matters). IndexedDB only as an encrypted cache. |
| 6 | Local lock KDF | **Argon2id via WASM** (m=64 MiB, t=3, p=1). PBKDF2-SHA256 ≥600k if no dependency is wanted. Auto-lock 10 min. |
| 7 | Edge login method | **Google IdP** in Cloudflare Access (reuses passkeys). Add OTP as a fallback for family. |
| 8 | Wealthica | Use the **Sheets export power-up** (Premium includes it). Don't pursue the B2B API. Record the real header row in docs. |
| 9 | Family access | Per-person Google accounts. Add to Access allow-list + test users + Drive share. No shared passwords. |

## Sources
- GitHub plans: https://docs.github.com/en/get-started/learning-about-github/githubs-plans
- Pages visibility (Enterprise Cloud): https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site
- Pages limits: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- GitHub pricing: https://github.com/pricing
- Google OAuth publishing status/testing: https://support.google.com/cloud/answer/15549945
- GIS token model: https://developers.google.com/identity/oauth2/web/guides/use-token-model
- Sheets API scopes: https://developers.google.com/workspace/sheets/api/scopes
- Wealthica export: https://wealthica.com/export-to-spreadsheet/ ; https://wealthica.com/blog/?p=16856 ; https://help.wealthica.com/help/google-sheets-using-formulas-with-automatic-updates-enabled
- Wealthica API: https://wealthica.com/docs/get-started ; https://wealthica.com/docs/authentication
- Cloudflare Access OTP: https://developers.cloudflare.com/cloudflare-one/identity/one-time-pin/
- Cloudflare Access policies: https://developers.cloudflare.com/cloudflare-one/access-controls/policies/
- Cloudflare Zero Trust pricing (secondary): https://costbench.com/software/business-vpn/cloudflare-zero-trust/free-plan/
- Vercel deployment protection pricing: https://vercel.com/docs/deployment-protection/usage-and-pricing
- Netlify pricing: https://netlify.com/pricing/
- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
