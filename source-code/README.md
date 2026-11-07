# Financials — a self-hosted personal finance dashboard

Net worth, holdings, cash flow, spending, registered-room tracking (TFSA / RRSP / FHSA),
projections and calculators — for a Canadian household, with optional US and Indian assets.

- **Your data stays yours.** Account data is read live from *your own* private Google Sheets
  (Wealthica sync + any manual sheets) in your browser, after Google sign-in. It is never stored in
  this repo.
- **Statements for accounts Wealthica doesn't sync** (some credit cards, other banks) go in
  [`statements/`](statements/README.md) as PDFs or CSVs, parsed on your own machine.
- **Public market data** (prices, fund look-through, fees, inflation, rates, FX) is fetched by the
  local server from free sources and cached.
- **Runs on your own computer** and can be reached from anywhere over HTTPS with Tailscale Funnel.
  Every data request is checked against your Google sign-in — see
  [`docs/self-hosting.md`](docs/self-hosting.md).
- **A demo mode** with fictional data lets you explore everything before connecting anything.

**Start here → [SETUP.md](SETUP.md).** It explains what you need to provide (Google OAuth client,
your sheets, your statements, your limits), step by step, and what was deliberately left out of
this copy.

Stack: React 19 + TypeScript + Vite + Tailwind, ECharts, Zustand, TanStack Router; a small Node
server in `tools/` (no framework). Tests: `npm test` (Vitest).

Planning and research documents live in [`docs/`](docs/).
