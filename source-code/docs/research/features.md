# Family Finance Dashboard: Feature Catalogue

> Status: research draft · Prepared 2026-10-13 · Target user: a Canadian-resident household, possibly with US and Indian assets and several family members
> Scope: product research only. No code. Every feature is tagged **[MVP] [V1] [V2] [Later]**.

---

## 0. Executive summary

**Target user.** Someone living in Canada. Wealthica aggregates their Canadian and US accounts and syncs into Google Sheets. Any Indian accounts and family members' finances are added by hand. They want one private, subscription-free dashboard that answers six questions:

- What do we own?
- Where is it?
- In what currency?
- How is it doing?
- What can we contribute next?
- Are we on track?

**Positioning.** Commercial tools each cover one part of this:

- Monarch and Copilot do budgeting.
- Kubera does net worth.
- Sharesight and Snowball do investments and dividends.
- ProjectionLab and Boldin do planning.
- INDmoney and Kuvera do India.

None of them handles **CA+US+IN cross-border, multi-person, registered-room-aware** finance well. This product should be that tool. It should be private, self-owned, and auditable, with every number traceable to a source row.

**Design principles**

1. **Traceability.** Every figure can be drilled down to the source rows behind it, including the source sheet, the FX rate and the ownership share applied.
2. **Freshness is visible.** Every number carries an "as of" time. Stale data is flagged and never silently mixed in.
3. **Global context.** Person/group, institution, currency and date range are set once and respected everywhere.
4. **Reporting currency is a lens, not a mutation.** Native amounts are always kept, and conversion happens at read time with a dated rate.
5. **Canada-first tax logic,** with US and India modules alongside.
6. **No fluff.** No gamification, upsells or social features. Density and clarity come first.

---

## 1. Competitive landscape: what to harvest

| Tool | What users love (harvest) | What users complain about (avoid) |
|---|---|---|
| **Wealthica** (CA) | 100+ Canadian institutions; Google Sheets/Excel export of holdings and transactions; dividend tracking; add-on ecosystem (Wealthscope analytics) | Connection breakage when banks change security (RBC, TD, CIBC IE, National Bank notices); support follow-up; add-ons cost extra; limited planning |
| **Monarch Money** | Household/partner sharing; goals; flexible budgets; reports; rules; web + Android + iOS | Subscription ($99.99/yr core, Plus tier added in 2026); weak Canadian investment depth; no registered-room awareness |
| **Copilot Money** | Best-in-class per-user ML categorisation; recurring/subscription detection; beautiful review-inbox workflow | Apple-only, single-user, no household view |
| **Empower (Personal Capital)** | Free investment checkup; fee analyser; retirement planner; allocation "you vs target" | US-only; sales calls; aggregation flakiness |
| **Kubera** | Any-asset net worth (real estate, crypto, private); multi-currency; "dead-man switch"/beneficiary access; clean balance-sheet UI | Expensive (~$249/yr); light budgeting and forecasting |
| **ProjectionLab** | Beautiful life-plan timelines; Monte Carlo; milestones; multiple plans and scenarios; supports non-US tax regimes | Steep setup; manual data entry |
| **Boldin (NewRetirement)** | 2026: Planner Score (plan completeness), encrypted Document Vault, "Investments: Today" allocation-vs-risk-profile, AI that edits plan assumptions, full-plan document view | Learning curve; no expense tracking; US-centric (Social Security, Medicare) |
| **Ghostfolio** (OSS) | Self-hosted, privacy-first; **X-ray** (concentration, liquidity, currency-cluster risk); allocation by platform/currency/asset class; TWR/ROAI by timeframe | Manual transaction entry; limited cash/budget features |
| **Actual Budget** (OSS) | Fast local-first envelope budgeting; rules applied retroactively; keyboard-centric | Multi-currency still experimental |
| **Firefly III** (OSS) | Double-entry; full rule engine; per-currency budgets; REST API | Steep UX; dated UI |
| **YNAB** | "Give every dollar a job"; age-of-money; targets | Subscription; budgeting-only |
| **Lunch Money** | Multi-currency budgeting; developer API; rules; crypto | Subscription; investments shallow |
| **Sharesight** | Accurate performance incl. dividends and FX; Canadian tax reports; contribution-adjusted returns; SOC 2 | Pricing tiers by holdings count; dated charts |
| **Snowball Analytics** | Dividend calendar, income forecasting, dividend rating, broker imports (1,000+), clean dashboards | Data "not necessarily real-time nor accurate"; subscription |
| **Passiv** | Target-allocation rebalancing; "buy-only" rebalancing with new cash; CA brokers | Trading-centric; few analytics |
| **Portfolio Visualizer / testfol.io** | Backtests, factor regressions, efficient frontier, MC sims | Not tied to real holdings |
| **CA tools** (Ratehub, WOWA, adjustedcostbase.ca, PWL/Cascade calculators, Richify) | Live mortgage rates and penalties calc, land-transfer tax, CMHC insurance; ACB tracking incl. superficial loss; RRSP vs TFSA scenarios | Fragmented; ad-supported; no link to your actual data |
| **INDmoney / Kuvera / ET Money** | Family accounts with Family / Personal / Individual view switching; tracks Indian stocks, MF, NPS, EPF, PPF, FDs, gold, real estate, ESOPs, credit dues; XIRR; goal-based SIPs | Upsell to own products; India-only; KYC-gated; cross-border blind |

**Key 2026 reference parameters** (to be fetched live and versioned, not hard-coded). Verify each at its source:

- **CA**
  - TFSA 2026 annual limit $7,000; cumulative $109,000 since 2009.
  - RRSP 2026 dollar limit $33,810, or 18% of prior-year earned income if lower.
  - FHSA $8,000/yr, $40,000 lifetime, carry-forward capped at $8,000.
  - Over-contribution penalty 1%/month.
  - BoC overnight rate 2.25% as of the Sep 2026 decision; next decision 2026-10-28.
- **US:** 401(k) $24,500 (+$8,000 catch-up 50+, $11,250 ages 60–63); IRA $7,500.
- **IN:** PPF 7.1%, NSC 7.7%, SSY 8.2% (Oct–Dec 2026 quarter, unchanged).

---

## 2. Core logic / domain engine

### 2.1 Data model (canonical entities)
- **[MVP] Person.** Owner, spouse, children, parents. Fields: tax residency, DOB (for age-based rules), country flags such as US person, NRI and Canadian resident, and SIN/PAN/SSN last-4 only.
- **[MVP] Group.** Saved sets of people: Household, Me+Spouse, Parents, or any custom group. Groups are first-class filter targets.
- **[MVP] Institution.** Name, country, logo, sync source, and connection health.
- **[MVP] Account.** Institution, currency, country, and account type, chosen from a taxonomy:
  - CA: TFSA, RRSP, Spousal RRSP, FHSA, RESP, RDSP, LIRA/LIF, RRIF, non-registered, chequing, savings, HISA, GIC, credit card, LOC, HELOC, mortgage.
  - US: 401k, Roth 401k, IRA, Roth IRA, HSA, 529, brokerage.
  - IN: savings, NRE, NRO, FCNR, FD, RD, PPF, EPF, VPF, NPS, SSY, demat, MF folio, ULIP/LIC.
  - Other: real estate, vehicle, crypto, gold, private equity, receivable.
- **[MVP] Ownership share.** Each (account, person) pair has a % share, so a joint account can be 50/50 or 60/40. Shares can be effective-dated, for example a spouse added in 2024.
- **[V1] Beneficial vs legal owner** for attribution-rule awareness, e.g. spousal RRSP, or money gifted to a spouse invested in a non-registered account.
- **[MVP] Security / Instrument.** Ticker, exchange, ISIN, CUSIP, AMFI scheme code, asset class, sub-class, sector, region, currency of listing, currency of exposure, vehicle (stock/ETF/MF/bond/GIC/FD/crypto/option), MER/TER, and distribution frequency.
- **[MVP] Holding snapshot.** Account × security × date, with quantity, price, market value (native), book value/ACB, and source.
- **[MVP] Transaction.** Date, account, amount (native), type (buy, sell, dividend, interest, fee, transfer, deposit, withdrawal, contribution, ROC, split, DRIP, FX conversion, card spend, refund), category, merchant, notes, tags, source row ID and a hash.
- **[MVP] Balance snapshot.** Daily or as-synced balance per account. This is the source of net worth history.
- **[MVP] FX rate.** Date, pair, rate, and source (BoC Valet, RBI reference, ECB, market feed).
- **[V1] Manual asset valuation.** Property, vehicle or private holdings, with a valuation method (appraisal, index-tracked, depreciation curve) and a revaluation schedule.
- **[V1] Liability schedule.** Mortgage/loan terms (rate, amortisation, term end, payment frequency, prepayment privileges) that drive amortisation and payoff projections.

### 2.2 Ingestion & normalisation
- **[MVP] Google Sheets connector (Wealthica sync).** Reads the Wealthica-populated tabs (holdings, transactions, balances) through the Sheets API on a schedule or on demand. It keeps a versioned copy of each pull.
- **[MVP] Column mapping profiles.** A declarative map from sheet columns to the canonical schema, so the app survives Wealthica column changes. It validates headers and fails loudly if they drift.
- **[MVP] Manual entry.** Forms for India and family accounts: balance updates, holdings, and transactions.
- **[MVP] CSV/XLSX import** with a mapping wizard, dry-run preview and diff before commit. Remembers mappings per institution.
- **[V1] Indian statement imports.**
  - CAMS/KFintech CAS (consolidated MF statement), PDF or parsed.
  - NSDL/CDSL CAS for demat.
  - EPFO passbook.
  - Bank statement CSV (HDFC, ICICI, SBI).
- **[V1] Broker-native CSVs** as a Wealthica fallback: Questrade, Wealthsimple, IBKR Flex Query, TD, RBC DI.
- **[V2] Email/receipt parsing** for statements, e.g. a forwarded PDF statement leads to an extracted balance.
- **[Later] Direct aggregator APIs** (Plaid/Flinks/Account Aggregator framework in India) as an optional source.
- **[MVP] Source lineage.** Every derived row points to its source file, sheet, row and import batch. Undo is available per import batch.
- **[MVP] Idempotent re-import.** Rows are keyed on a stable hash of (account, date, amount, description, quantity), with tolerance rules.

### 2.3 Dedupe & reconciliation
- **[MVP] Exact-duplicate detection** across re-imports.
- **[V1] Fuzzy duplicate detection.** Same amount ±0, date ±3 days, similar description, presented for review.
- **[MVP] Transfer matching.** Pairs an outflow in account A with an inflow in account B, cross-currency included, so neither counts as spending or income. Example: CAD chequing to a USD brokerage via Norbert's Gambit.
- **[V1] Norbert's Gambit / DLR detection.** Links DLR to DLR.U journal pairs and computes the effective FX rate achieved compared with the BoC rate.
- **[V1] Balance reconciliation.** Computed balance (opening + transactions) is compared with the reported balance, and gaps are flagged.
- **[V1] Holdings reconciliation.** Quantity from transactions is compared with quantity in the snapshot, with "missing transaction" hints.

### 2.4 FX engine
- **[MVP] Multi-currency core.** CAD, USD and INR at launch; any ISO currency is extensible.
- **[MVP] Historical daily rates.**
  - BoC Valet API for CAD pairs; this is the official CRA-acceptable source.
  - RBI reference rate or market close for INR.
  - Rates are cached locally, with a fallback chain.
- **[MVP] Reporting currency switch** (CAD/USD/INR) at read time. Native values are never overwritten.
- **[MVP] Rate policy per context:**
  - Point-in-time valuations use the spot rate on the date.
  - Historical transactions use the transaction-date rate.
  - Tax reports use the BoC daily or annual average rate, user-selectable as CRA allows.
- **[V1] FX attribution.** Splits returns into local-currency return and currency effect, e.g. "your US stocks rose 8% in USD but 5% in CAD".
- **[V1] Currency exposure vs currency of listing.** A CAD-listed S&P 500 ETF has USD exposure. Exposure is also look-through for hedged vs unhedged ETFs.
- **[V2] Effective FX cost tracking.** Measures the bank/broker spread you actually paid compared with mid-market.

### 2.5 Ownership & aggregation
- **[MVP] Share-weighted aggregation.** Each person's view = Σ(account value × share). Group views sum shares across members, so a joint account counts at most 100%.
- **[MVP] "Full vs my share" toggle.** Show joint accounts at full value or at your share.
- **[V1] Effective-dated shares** for changes of ownership over time.
- **[V1] Inter-family loans/receivables.** A loan to a parent appears as an asset for one person and a liability for another, and nets to zero in the household view.

### 2.6 Categorisation & rules
- **[MVP] Category tree.** Two levels, editable, with seed categories tuned for Canada and India (e.g. "Property tax", "Remittance to India", "Daycare (CCB-eligible)").
- **[MVP] Rules engine.** If merchant/description/amount/account matches, then set category, tags, merchant name, or mark as transfer or excluded. Rules are ordered, can be previewed, and can be applied retroactively (as in Actual and Firefly).
- **[V1] Learn-from-edits.** When the user recategorises, the app offers to create a rule (Copilot-style), using deterministic suggestions rather than an opaque ML model.
- **[V1] Merchant normalisation.** "AMZN MKTP CA*2X3" becomes "Amazon".
- **[V1] Split transactions.** One Costco charge can be split into Groceries, Household and Gifts. Splits across persons are also supported, e.g. a shared expense paid by one person.
- **[V1] Tags** (orthogonal to category), e.g. #trip-2026, #reimbursable, #tax-deductible, #medical.
- **[V2] Recurring detection.** Subscriptions, bills and paycheques, with expected next date and amount, plus price-increase alerts.

### 2.7 Snapshots & history
- **[MVP] Daily net-worth snapshot** materialised per account, so history is fast and frozen even if a source later edits.
- **[MVP] Backfill.** Reconstructs past values from transactions plus historical prices where snapshots are missing. Reconstructed points are marked "estimated".
- **[V1] Point-in-time "time machine".** View any page as of a past date.
- **[V1] Restatement log.** When imported history changes, the app shows what changed and why.

### 2.8 Pricing & market data
- **[MVP] End-of-day prices** for TSX, NYSE/NASDAQ, NSE/BSE and AMFI MF NAVs, with source plus timestamp. Wealthica prices are used when present; otherwise an external feed. A free-tier stack is to be evaluated during engineering.
- **[V1] Intraday delayed quotes** (optional; banner shows the delay).
- **[V1] Security metadata enrichment.** Sector, region, ETF look-through holdings, MER and distribution history.
- **[V2] ETF look-through.** Decomposes VEQT/XEQT/VGRO etc. into underlying regions, sectors and top holdings for true exposure.

### 2.9 Performance math
- **[MVP] Simple gain** (market value − book value) and **% gain** per holding and account.
- **[MVP] Money-weighted return / XIRR** per account, person, group or portfolio, over any period.
- **[V1] Time-weighted return (TWR),** daily-linked with modified Dietz fallback.
- **[V1] Total return including dividends**, and returns with vs without FX.
- **[V1] Benchmarks.** User-chosen benchmark per portfolio (e.g. VEQT, S&P 500 TR in CAD, Nifty 50 TRI, a 60/40 blend), with relative performance.
- **[V2] Risk metrics.** Volatility, max drawdown, Sharpe/Sortino, beta to benchmark.
- **[V2] Attribution.** Allocation effect vs selection effect vs FX.

### 2.10 Tax-aware calculations
**Canada**
- **[MVP] Contribution room ledger** for TFSA, RRSP, FHSA and RESP. Inputs are the CRA starting room (from the NOA / My Account) plus contributions and withdrawals. Withdrawals are added back to TFSA room on Jan 1 of the following year.
- **[V1] ACB tracking** per security, per person, across all non-registered accounts of that person, as CRA requires. Includes:
  - Superficial loss detection (30-day window, including spouse and registered accounts).
  - Return of capital (ROC) adjustments.
  - Phantom (reinvested) capital-gains distributions.
- **[V1] Realised capital gains report** (Schedule 3 style), with the 50% inclusion rate (versioned rule).
- **[V1] T1135 foreign property monitor.** Shows the cost of specified foreign property (US brokerage, Indian FDs/MFs/stocks, NRO balances) against the $100k threshold, with the max cost during the year.
- **[V1] US withholding tax awareness.** Flags the 15% withholding on US dividends in a TFSA/RESP (unrecoverable) vs an RRSP (treaty-exempt) vs non-registered (foreign tax credit). Supports asset-location suggestions.
- **[V1] Income tax estimator.** Federal and provincial brackets (versioned), with dividend gross-up and credit, capital gains inclusion, RRSP deduction, foreign tax credit, and marginal and average rates.
- **[V2] RRIF minimum withdrawal schedule,** OAS clawback threshold, CPP/OAS start-age modelling.
- **[V2] Spousal attribution rule warnings.**

**United States** (for US accounts held as a Canadian resident; US-person mode optional)
- **[V1] 401k/IRA limits tracker** (if contributing). Roth vs traditional treated per the CA–US treaty: RRSP-like for traditional; Roth needs a treaty election note.
- **[V1] US situs estate-tax exposure estimate** for Canadian residents holding US-listed securities above the US$60k threshold, with the treaty-prorated exemption shown as indicative.
- **[V2] US-person mode.** PFIC warnings for Canadian/Indian funds, FBAR/FATCA thresholds.

**India** (as an NRI / Canadian resident with Indian assets)
- **[V1] FY (Apr–Mar) aware periods** alongside the calendar year.
- **[V1] NRE vs NRO treatment.** NRE interest is tax-free in India but taxable in Canada. NRO has TDS. Tracks TDS deducted for foreign tax credit claims in Canada.
- **[V1] Indian capital gains.** Equity/MF LTCG/STCG with the current rates and exemption threshold, versioned (post-2024 budget: 12.5% LTCG above ₹1.25L, 20% STCG on listed equity).
- **[V1] PPF rules.** 15-year maturity, extension blocks, partial withdrawal from year 7, loan window, ₹1.5L/yr cap. NRIs cannot open new PPF accounts but can continue existing ones until maturity.
- **[V1] EPF/VPF interest accrual** at the declared rate.
- **[V2] 80C/80D tracker** (for family members filing in India under the old regime) with an old vs new regime comparison.
- **[V2] Indian resident family-member tax view** (parents in India).

**Cross-cutting tax rules**
- **[MVP] Versioned rule tables.** Each limit, rate or bracket has an effective date, source URL and "last verified" date. Historical calculations use the rules in force at the time.

### 2.11 Projection engine
- **[V1] Deterministic cash-flow projection.** Yearly then monthly, by account. Inputs are contributions, returns, inflation, FX drift, income, expenses and life events.
- **[V2] Monte Carlo.** Historical bootstrap and parametric modes, with sequence-of-returns risk and success probability bands.
- **[V2] Tax-aware drawdown ordering** (RRSP/RRIF meltdown vs TFSA last, etc.) with CPP/OAS integration.
- **[MVP] Assumption sets.** Named and versioned (Conservative/Base/Optimistic), and shared across goals, projections and calculators.

### 2.12 Integrity, security & privacy
- **[MVP] Local-first / self-hosted** data storage, encrypted at rest.
- **[MVP] App lock** (passphrase/PIN, auto-lock on idle).
- **[MVP] Read-only connectors.** No credentials to banks are stored; Wealthica holds bank credentials and the app only reads the sheet.
- **[V1] Per-person access.** A family member can be given their own view only, e.g. a parent sees only their own accounts.
- **[V1] Audit log** of edits, imports and rule changes.
- **[V1] Encrypted backups,** with export and restore of the full dataset.
- **[V2] Emergency access / "In case of emergency" pack** (Kubera-style dead-man switch, but offline). A sealed, printable summary of accounts, institutions, contacts and beneficiaries.

---

## 3. App shell & navigation

### 3.1 Global context bar (persistent, top)
- **[MVP] Person / group selector.** Me · Spouse · each member · Household · custom groups. Multi-select builds an ad-hoc group. The share toggle switches between full value and ownership share.
- **[MVP] Reporting currency** (CAD/USD/INR) with the FX date displayed.
- **[MVP] Date range.** Presets (MTD, YTD, FY-India, last 12m, all, custom) plus compare-to (prior period, same period last year).
- **[V1] Institution filter** (multi-select chips).
- **[V1] Account-type filter** (registered/non-registered/cash/credit/loan; country).
- **[V1] Country filter** (CA/US/IN).
- **[MVP] Filter state lives in the URL,** so it is shareable, bookmarkable and back/forward-safe.
- **[MVP] Active-filter summary** ("Showing: Household · CAD · YTD · excl. Parents"), with one-click reset.

### 3.2 Navigation
- **[MVP] Left sidebar** with page groups: Overview · Wealth (Net Worth, Accounts, Holdings, Allocation, Performance, Dividends) · Money (Cash Flow, Budgets, Credit & Debt) · Plan (Room, Goals, Projections, Calculators) · Family · India · Data (Market & Rates, Data Health, Reports) · Settings.
- **[MVP] Collapsible sidebar,** with the active page highlighted and badges (e.g. a Data Health warning count).
- **[MVP] Breadcrumbs on drill-down pages** (Holdings › XEQT › Lots).

### 3.3 Command palette & search
- **[V1] ⌘K / Ctrl+K command palette.** Jump to page, account, holding, person or saved view. Run actions ("Add manual balance", "Import CSV", "Switch to INR", "Toggle privacy").
- **[V1] Global search** across transactions (merchant, notes, amount ranges like `>500`, `tag:#medical`), holdings and accounts.
- **[V2] Natural-language query** that runs locally ("dividends from US stocks in TFSA this year"). It compiles to a filter and shows the generated filter so the user can verify it.

### 3.4 Keyboard shortcuts
- **[V1]** `g o` overview, `g n` net worth, `g h` holdings, `g t` transactions; `/` search; `p` privacy toggle; `c` cycle currency; `[` `]` previous/next period; `?` shortcut sheet. In the transaction review inbox: `j/k` move, `e` edit category, `x` exclude.

### 3.5 Privacy & lock
- **[MVP] Privacy/blur mode.** Hides absolute amounts and keeps percentages. It is a hotkey and persists per device.
- **[V1] "Percent-only" mode** for screen-sharing with an advisor.
- **[MVP] Auto-lock** after idle and on lid close.
- **[V1] Per-panel sensitivity.** Always blur specific accounts, e.g. a parent's.

### 3.6 Theming & layout
- **[MVP] Light/dark,** system-following.
- **[V1] Density toggle** (comfortable/compact).
- **[V1] Number formatting per currency.** Indian lakh/crore grouping for INR (₹12,34,567 / 12.3 L / 1.2 Cr) and western grouping for CAD/USD. The user can also choose a global style.

---

## 4. Panels / pages

Format per page: **Purpose** · **Widgets** · **Interactions**.

### 4.1 Overview / Home **[MVP]**
- **Purpose:** a 10-second answer to "how are we doing, and does anything need attention?"
- **Widgets:**
  - Net worth KPI with Δ day/MTD/YTD and sparkline [MVP]
  - Assets vs liabilities split [MVP]
  - Investable assets vs illiquid [V1]
  - Top movers today, by holding [V1]
  - Cash position and cash drag % [V1]
  - Month-to-date spending vs typical [V1]
  - Upcoming items: bills, card due dates, GIC/FD maturities, dividends expected [V1]
  - Contribution room remaining this year (TFSA/RRSP/FHSA) [V1]
  - Insights feed (see §5.4) [V1]
  - Data freshness strip with per-source "as of" [MVP]
- **Interactions:** every tile drills down to its page with filters carried over. Widgets are reorderable and can be hidden [V1].

### 4.2 Net Worth **[MVP]**
- **Purpose:** the balance sheet over time.
- **Widgets:**
  - Stacked area chart by asset category, toggleable by person/account type/country/currency [MVP]
  - Assets and liabilities tables with Δ [MVP]
  - Net worth change waterfall: contributions vs market gains vs FX vs debt paydown vs spending [V1]
  - Milestones (first $100k, $1M, crossovers) as chart annotations [V1]
  - Net worth in multiple currencies side-by-side [V1]
  - Per-person contribution to household net worth [MVP]
  - Real (inflation-adjusted) toggle [V1]
- **Interactions:** brush to zoom; click a point to open the time-machine snapshot as of that date [V1]; add an annotation [V1].

### 4.3 Accounts **[MVP]**
- **Purpose:** an inventory of every account with health and ownership.
- **Widgets:**
  - Grouped table (by institution / type / person / country) [MVP]: balance native + reporting, owners and shares, last sync, sync source badge (Wealthica/manual/import)
  - Account detail page: balance history, holdings, transactions, contribution history (registered), statements/notes, and fees (MER-weighted cost) [MVP→V1]
- **Interactions:** inline edit of nickname, owner shares and type [MVP]; archive closed accounts while keeping their history [MVP]; quick "update balance" for manual accounts [MVP]; merge duplicates [V1].

### 4.4 Holdings / Portfolio **[MVP]**
- **Purpose:** what you own, consolidated across accounts.
- **Widgets:**
  - Consolidated holdings table: security, qty, price, MV, book, unrealised $/%, weight %, day Δ, yield, MER, accounts held in [MVP]
  - Grouping by security / account / asset class [MVP]
  - Expand a row to see per-account lots [V1]
  - Holding detail: price chart with buy/sell markers, dividends received, ACB history, which family members hold it [V1]
  - Look-through view for all-in-one ETFs [V2]
- **Interactions:** column chooser and saved column sets [V1]; sort, filter and search [MVP]; export the table [MVP]; tag holdings (e.g. "core", "satellite", "speculative") [V1].

### 4.5 Allocation & Diversification **[MVP] (basic) / [V1] (full)**
- **Purpose:** how the money is spread across every useful dimension.
- **Dimensions:**
  - asset class (equity/fixed income/cash/real estate/alternatives/crypto)
  - sub-class (CA/US/Intl/EM equity; govt/corp bonds)
  - sector
  - geography (by listing and look-through)
  - currency (listing vs exposure)
  - account type (registered vs taxable)
  - vehicle (stock/ETF/MF/GIC/FD/PPF)
  - institution
  - person
  - liquidity tier
- **Widgets:**
  - Donut/treemap per dimension [MVP]; sunburst for nested views (asset class → region → holding) [V1]
  - **Target vs actual** with drift bands [V1]
  - Rebalancing suggestions, Passiv-style "buy-only with new cash" plus a full rebalance, and tax/withholding-aware placement [V2]
  - **X-ray risk panel** (Ghostfolio-inspired) [V1]: single-holding concentration, institution concentration (CDIC/CIPF coverage), currency cluster, home-country bias, and employer-stock exposure
  - Pivot: any dimension × any dimension heatmap, e.g. account type × geography [V1]
- **Interactions:** click a slice to filter Holdings; set targets per group; save multiple target models [V2].

### 4.6 Performance **[V1]**
- **Purpose:** honest returns, compared with something meaningful.
- **Widgets:**
  - Return table by period (1M/3M/YTD/1Y/3Y/5Y/inception) × method (TWR, MWR/XIRR, simple) [V1]
  - Growth-of-$10k chart vs benchmark(s) [V1]
  - Contributions vs growth chart [V1]
  - Return decomposition: price, dividends, FX [V1]
  - Per-account and per-person leaderboard [V1]
  - Calendar heatmap of monthly returns [V2]
  - Risk stats [V2]
  - Fee drag: MER $/yr and lifetime projection [V1]
  - Realised vs unrealised gains [V1]
- **Interactions:** pick benchmarks (including blended); switch currency to see FX effect; click a period to see the transactions behind it.

### 4.7 Dividends & Income **[V1]** (basic list [MVP])
- **Purpose:** passive income tracking and forecasting.
- **Widgets:**
  - Received dividends/interest/distributions list [MVP]
  - Monthly bar chart by year (stacked by person/account/security) [V1]
  - Trailing-12-month income and YoY growth [V1]
  - Forward 12-month forecast from holdings × declared/estimated distributions [V1]
  - Dividend calendar (ex-date / pay-date) [V1]
  - Yield on cost vs current yield [V1]
  - Withholding tax paid by account type (highlights TFSA US-dividend leakage) [V1]
  - Income coverage of expenses ("dividends cover 23% of your spending") [V1]
  - Interest from HISA/GIC/FD/PPF/EPF included [V1]
- **Interactions:** toggle gross/net of withholding; DRIP vs cash; export for tax.

### 4.8 Cash Flow / Transactions / Spending **[MVP]**
- **Purpose:** where money comes from and goes.
- **Widgets:**
  - Transaction ledger with fast filters, bulk edit, splits and notes [MVP]
  - **Review inbox** for new and uncategorised transactions (Copilot-style), keyboard-driven [V1]
  - Income vs expense bars by month, with savings rate % [MVP]
  - Category breakdown (treemap/bar) with prior-period comparison [MVP]
  - Sankey: income → taxes → savings/investments → spending categories [V1]
  - Merchant leaderboard [V1]
  - Recurring and subscriptions panel with annualised cost [V2]
  - Cross-currency spending (spending in INR on a trip shown in CAD) [MVP]
  - Remittance tracker (CA → IN transfers, FX achieved, fees) [V1]
- **Interactions:** click a bar → filtered ledger; create a rule from a transaction [MVP]; mark as transfer/excluded/reimbursable [MVP]; attach a receipt [V2].

### 4.9 Budgets **[V1]**
- **Purpose:** spending guardrails without YNAB's dogma.
- **Widgets:**
  - Category budgets (monthly or annual, rollover optional) [V1]
  - Per-person or household budgets [V1]
  - Progress bars with pace indicator ("on pace to exceed by $120") [V1]
  - Flex budgeting (fixed / flexible / non-monthly buckets, Monarch-style) [V2]
  - Sinking funds for annual items (insurance, property tax, India trip) [V2]
  - Optional envelope/zero-based mode [Later]
- **Interactions:** auto-suggest budgets from a 6–12 month median; copy forward; per-currency budgets for India expenses [V2].

### 4.10 Credit & Debt **[V1]**
- **Purpose:** liabilities under control.
- **Widgets:**
  - Credit cards: balance, limit, utilisation %, statement and due date, rewards category notes [V1]
  - Mortgage: remaining principal, rate, term end / renewal countdown, amortisation remaining, prepayment privilege used vs available, penalty estimate (IRD vs 3-month interest) [V1]
  - Loans/LOC/HELOC: rate (prime-linked rates auto-update with prime) [V1]
  - Debt-free date projection, and interest paid YTD and lifetime [V1]
  - Payoff planner (snowball/avalanche) linked to the calculators [V1]
  - Credit score log (manual) [V2]
- **Interactions:** "what if I prepay $X" inline; renewal scenario at current posted/discounted rates [V2].

### 4.11 Registered Account Room **[MVP] (TFSA/RRSP/FHSA) / [V1] (rest)**
- **Purpose:** never over-contribute, and never leave room unused.
- **Widgets:**
  - Per-person cards for TFSA, RRSP, FHSA: CRA starting room (as of NOA date), contributions YTD across all institutions, withdrawals, room remaining, and an over-contribution alert including the $2,000 RRSP buffer [MVP]
  - RRSP deadline countdown (first 60 days of the year) and receipt reconciliation [V1]
  - TFSA withdrawal re-add timeline [MVP]
  - FHSA lifetime progress and 15-year / age-71 deadline [V1]
  - RESP: lifetime $50k per beneficiary, CESG 20% on first $2,500/yr up to $7,200 lifetime with carry-forward, CLB, and an "unclaimed grant" alert [V1]
  - Spousal RRSP 3-year attribution timer [V2]
  - RDSP grants/bonds [Later]
  - US: 401k/IRA/HSA limits by person [V1]
  - India: PPF annual ₹1.5L cap and maturity/extension timeline; EPF/VPF; NPS; 80C utilisation [V1]
  - Optimal contribution order suggestion (FHSA → RRSP/TFSA by marginal rate → RESP to max CESG) [V2]
- **Interactions:** enter the NOA figure once per year; the app tracks deltas. Flags contributions detected from transactions that are not yet counted.

### 4.12 Goals **[V1]**
- **Purpose:** named targets with funding.
- **Widgets:**
  - Goal cards: target amount (in any currency), date, linked accounts or % allocation, progress, required monthly contribution, probability of success (from projection) [V1]
  - Goal types: emergency fund, house down payment (FHSA+TFSA), child education (RESP), India property, retirement, car, travel [V1]
  - Goal timeline [V2]
- **Interactions:** fund a goal from specific accounts without double counting; what-if slider for contribution.

### 4.13 Projections **[V1] deterministic / [V2] Monte Carlo**
- **Purpose:** "Are we on track?" and "When can we stop working?"
- **Widgets:**
  - Net-worth projection fan chart by account type, in real or nominal terms [V1]
  - FIRE dashboard: FI number (expenses ÷ SWR), years to FI, Coast-FI, Barista-FI, Lean/Fat FI [V1]
  - Retirement drawdown: year-by-year table (income sources: CPP, OAS, pension, RRIF minimums, TFSA, non-reg, Indian assets/rental), taxes, and account depletion order [V2]
  - Monte Carlo success %, percentile bands, failure-year histogram [V2]
  - Scenario compare (side-by-side plans: "retire at 55 vs 60", "move to India at 65", "buy a cottage") [V2]
  - Life events timeline (kids, house, sabbatical, inheritance, relocation, currency switch) [V2]
  - CPP/OAS start-age optimiser [Later]
- **Interactions:** assumption panel (returns per asset class, inflation CA/IN separately, FX drift INR/CAD, salary growth, SWR); sensitivity tornado chart [V2]; save scenarios.

### 4.14 Calculators Hub **[MVP] (core 6) / [V1] (rest)**
- **Purpose:** standalone tools prefilled from live rates and your own data, with an "apply to my plan" option.
- **Behaviour common to all calculators:**
  - Each shows its parameters with source and as-of (e.g. "5-yr fixed 4.29% · lender average · fetched 2026-10-12")
  - The user can override any value, and overrides are marked
  - Shareable URL state; print view
  - "Use my data" prefill (e.g. current mortgage balance)
- **Calculators:**

| Calculator | Tag | Live inputs / notes |
|---|---|---|
| Mortgage payment (CA semi-annual compounding, accelerated bi-weekly) | MVP | Prime, posted 5-yr, BoC rate; CMHC premium table |
| Amortisation with prepayments (lump-sum, increased payments, anniversary) | MVP | Schedule table + chart; interest saved |
| Affordability (GDS/TDS, stress test = max(contract+2%, 5.25%)) | V1 | Versioned OSFI rule |
| Rent vs buy (opportunity cost, closing costs, LTT incl. Toronto MLTT, maintenance %) | V1 | Land transfer tax tables by province |
| Mortgage renewal / break penalty (IRD vs 3-month) | V2 | Current rates |
| Compound interest / future value | MVP | |
| Loan payment (car, personal, LOC) | MVP | Prime-linked |
| Debt payoff — snowball vs avalanche | MVP | Prefill from Credit & Debt |
| FD / RD (Indian compounding quarterly; TDS) | V1 | Bank FD rate table (manual or fetched) |
| SIP / step-up SIP / SWP / lump-sum (XIRR) | V1 | |
| PPF / SSY / NSC maturity | V1 | Govt quarterly rates (7.1/8.2/7.7 for Q3 FY27) |
| RRSP vs TFSA (marginal rate now vs in retirement, OAS clawback) | V1 | Tax brackets |
| FHSA vs RRSP HBP | V2 | |
| Income tax estimator CA (fed + province) | V1 | Versioned brackets |
| India tax: old vs new regime | V2 | |
| Currency converter (live + historical, "what was ₹X worth in CAD on date") | MVP | BoC/RBI |
| Inflation-adjusted value (CPI Canada, CPI India, CPI US) | V1 | StatCan/MOSPI/BLS |
| Emergency fund (months of expenses from actual spending) | MVP | From Cash Flow |
| FIRE / Coast FIRE / SWR | V1 | |
| CPP/OAS estimator | V2 | |
| RESP grant maximiser | V1 | |
| GIC ladder builder | V2 | |
| Norbert's Gambit vs bank FX cost | V1 | |
| Remittance cost compare (bank vs Wise etc., manual quotes) | V2 | |
| Capital gains / ACB what-if (sell X shares now) | V2 | |
| Smith manoeuvre | Later | |

### 4.15 Family / Household **[MVP] (switching) / [V1] (page)**
- **Purpose:** each member and the household at a glance.
- **Widgets:**
  - Member cards: net worth, liquid assets, room remaining, key alerts [V1]
  - Household composition by person (stacked bar) [V1]
  - Ownership matrix (accounts × people with %) [V1]
  - Inter-family flows: gifts, loans, remittances to parents [V2]
  - Dependants view: RESP per child, kids' accounts [V1]
  - Parents' India finances (pension, FDs, medical insurance renewal dates) [V1]
  - Estate snapshot: beneficiaries per account, will/POA location notes [V2]
- **Interactions:** click a member to set the global person filter; create a custom group from a selection.

### 4.16 India **[V1]**
- **Purpose:** first-class Indian assets for a Canadian resident and Indian family members.
- **Widgets:**
  - Assets by type: savings/NRE/NRO/FCNR, FDs, PPF, EPF, NPS, MF folios, demat stocks, gold (physical/SGB), real estate, LIC/ULIP [V1]
  - FD/RD maturity ladder with interest and TDS [V1]
  - MF portfolio with XIRR per scheme, direct vs regular plan flag (commission leakage) [V1]
  - PPF passbook with year-wise interest and lock-in [V1]
  - EPF balance and interest accrual [V1]
  - INR view and CAD view; INR depreciation effect on CAD returns [V1]
  - Repatriation tracker: NRO repatriation limit (USD 1M/FY), Form 15CA/CB notes [V2]
  - India tax and TDS summary for Canadian FTC [V1]
  - Property: rental income, municipal tax due dates [V2]
  - Lakh/crore formatting [MVP]
- **Interactions:** CAS import [V1]; manual quick-update grid for many FDs [V1].

### 4.17 Market Data & Rates **[MVP]**
- **Purpose:** show the live parameters every calculation uses, with source and freshness.
- **Widgets:**
  - FX table: CAD/USD, CAD/INR, USD/INR spot + 1D/1M/1Y change and sparkline; source (BoC Valet / RBI / market) and timestamp [MVP]
  - Rates: BoC overnight, prime, CORRA, GoC 2/5/10-yr yields, average 5-yr fixed & variable mortgage, HISA top rates, GIC rates (manual or fetched), US Fed funds/T-bill, RBI repo, Indian small-savings rates [MVP→V1]
  - Inflation: CPI CA/US/IN latest YoY [V1]
  - Index levels: TSX, S&P 500, Nifty 50 [V1]
  - Regulatory limits table (TFSA/RRSP/FHSA/401k/IRA/PPF) with effective year and source link [MVP]
  - Upcoming macro dates: next BoC decision (2026-10-28), RRSP deadline, TFSA reset, India quarterly rate reset [V1]
- **Interactions:** manual override with a reason; staleness badge (green < 1 day, amber < 7 days, red otherwise); refresh now.

### 4.18 Data Health / Sync Status **[MVP]**
- **Purpose:** trust in the numbers.
- **Widgets:**
  - Source list: Google Sheet (last pull, rows added/changed, schema check), manual accounts (days since last update), price feeds, FX feeds [MVP]
  - Per-account freshness heat strip [MVP]
  - Issues queue: unmapped columns, unknown securities, uncategorised transactions, unmatched transfers, reconciliation gaps, stale manual balances, missing FX dates, possible duplicates [MVP→V1]
  - Import history with undo [MVP]
  - Wealthica broken-connection detector (account values flat for N days while other accounts move) [V1]
- **Interactions:** one-click fixes (map, merge, ignore); "remind me to update manual balances monthly" [V1].

### 4.19 Reports & Exports **[MVP] (CSV) / [V1] (rest)**
- **Purpose:** take data out for taxes, advisors, family and archives.
- **Exports:**
  - Any table to CSV [MVP] or XLSX [V1]
  - Every page has a print stylesheet [V1]
  - PDF reports [V1]
- **Reports:**
  - Monthly/annual net worth statement [V1]
  - Year-end tax pack (CA): realised gains, dividends by type (eligible/foreign), interest, foreign income and tax paid, T1135 helper, RRSP/FHSA contributions [V1]
  - India tax pack (FY) [V2]
  - Household balance sheet for lender/mortgage applications [V1]
  - Advisor pack (percent-only option) [V2]
  - Estate/emergency binder [V2]
  - Scheduled report generation saved to a folder [V2]
- **Interactions:** report builder (pick sections + filters) [V2]; full data export (JSON/CSV zip) [MVP].

### 4.20 Settings **[MVP]**
- People and groups; ownership shares
- Institutions and accounts mapping
- Data sources (Sheets connection, column maps)
- Categories and rules
- Currencies and FX policy
- Assumption sets
- Tax profile per person (province, residency, marginal rate override)
- Number format
- Privacy/lock
- Backups
- Benchmark list
- Target allocations
- Notification preferences
- Rule tables viewer (limits/brackets with sources)

---

## 5. Cross-cutting UX

### 5.1 Empty & loading states
- **[MVP] Guided empty states** with a single next action ("Connect your Wealthica sheet", "Add your first Indian FD"). Sample-data preview mode is [V1].
- **[MVP] Skeleton loaders.** No layout shift.
- **[V1] Setup checklist** (Boldin "Planner Score"-like, but neutral). Shows completeness of the data: room entered, shares set, India accounts added, targets set.

### 5.2 Freshness & trust
- **[MVP] "As of" chips** on every KPI; the stale-data colour scale is consistent everywhere.
- **[MVP] Mixed-freshness warning** when a total combines data more than N days apart.
- **[MVP] Estimated values** are visually distinct (dotted lines, italic).
- **[V1] "Explain this number."** A side panel shows the calculation, inputs, FX rates, shares and source rows.

### 5.3 What-if scenarios
- **[V1] Global sandbox mode.** Changes such as hypothetical trades, a new contribution or a rate change flow through all pages. A banner shows "Scenario: X" and edits are discarded or saved.
- **[V2] Scenario compare** split view.

### 5.4 Insights & alerts (deterministic rules, explainable, dismissible, snoozable)
- **[V1] Unusual spending.** Category spending more than 1.5× its trailing median.
- **[V1] New recurring charge or price increase.**
- **[V1] Cash drag.** Idle cash above X% or $Y in investment accounts, with the yield opportunity.
- **[V1] Concentration risk.** Single holding above 10%, single institution above the CIPF/CDIC limit, employer stock.
- **[V1] Unused contribution room** (TFSA/RRSP/FHSA/RESP grant), with a deadline countdown.
- **[V1] Over-contribution risk.**
- **[V1] FX exposure drift** (e.g. USD above target).
- **[V1] Asset location.** US dividend payers held in a TFSA.
- **[V1] Allocation drift** beyond bands.
- **[V1] GIC/FD maturity in the next 30 days.**
- **[V1] Mortgage renewal within 180 days.**
- **[V1] Credit utilisation above 30%; payment due soon.**
- **[V1] Stale manual account.**
- **[V1] T1135 threshold approaching.**
- **[V2] Tax-loss harvesting opportunity** that is superficial-loss safe.
- **[V2] High-MER funds; Indian regular-plan MFs** (switch to direct).
- **[V2] Large FX move** affecting net worth.
- **[V2] Delivery:** in-app inbox, optional email digest (self-hosted SMTP), weekly summary.

### 5.5 Annotations
- **[V1] Chart annotations** (e.g. "Bought house", "Job change", "Market crash"), shown on all time-series charts. They can be global or per person.
- **[V1] Notes on accounts, holdings and transactions**, searchable.

### 5.6 Drill-downs
- **[MVP] Consistent drill path:** KPI → breakdown → list → item → source row.
- **[V1] Peek panels** (side drawer), so context isn't lost.

### 5.7 Saved views
- **[V1] Saved views.** Name a filter + page + layout state ("Parents' India FDs", "My TFSA US stocks"), pin it to the sidebar, and make it the default per page.

### 5.8 Dashboard customisation
- **[V1] Drag/drop widget grid** on Overview, with resize and per-widget filter override.
- **[V2] Multiple dashboards** (e.g. "Monthly review", "Tax season").
- **[V2] Widget library** (any chart can be pinned to a dashboard).

### 5.9 Responsive & mobile
- **[MVP] Responsive layouts.** Overview, Net Worth, Accounts and Transactions are usable on a phone. Tables become cards.
- **[V1] Installable PWA** with offline read of the last snapshot.
- **[V2] Mobile quick actions** (update manual balance, categorise inbox).

### 5.10 Accessibility
- **[MVP] Accessibility basics:**
  - WCAG 2.2 AA contrast
  - Full keyboard navigation and focus rings
  - Screen-reader labels on charts, with a data-table alternative for every chart
  - Colour-blind-safe palette, with gain/loss never conveyed by colour alone (±signs, arrows)
- **[V1] Reduced motion; zoom to 200% without breakage.**

### 5.11 Print
- **[V1] Print stylesheets.** Clean typography, no chrome, page breaks between sections, header with filters and as-of date, privacy mode respected.

---

## 6. Prioritisation & milestones

### 6.1 MVP scope (definition: "you can stop opening the spreadsheet")
- **Data:** Sheets/Wealthica ingestion with column maps, manual entry, CSV import, lineage and undo, exact dedupe, transfer matching, daily snapshots.
- **Model:** people, groups, ownership shares; account taxonomy for CA/US/IN.
- **FX:** BoC historical rates; CAD/USD/INR reporting switch.
- **Shell:** global person/group, currency and date filters in the URL; privacy blur; lock; light/dark; responsive.
- **Pages:**
  - Overview
  - Net Worth
  - Accounts
  - Holdings
  - Allocation (basic donuts)
  - Dividends list
  - Cash Flow (ledger, categories, rules, income/expense bars)
  - Registered Room (TFSA/RRSP/FHSA)
  - Calculators (mortgage, amortisation with prepayments, compound interest, loan, debt payoff, currency, emergency fund)
  - Market Data & Rates
  - Data Health
  - CSV/full export
  - Settings
- **Rules:** versioned limit tables with sources.

### 6.2 Milestones
| Milestone | Theme | Contents |
|---|---|---|
| **M0 — Foundation** | Trustworthy data | Canonical schema; Sheets connector + mapping; manual entry; CSV import; lineage/undo; FX engine (BoC Valet); people/groups/shares; snapshots; app lock; Data Health v0 |
| **M1 — See everything** | MVP read views | Shell + global filters; Overview, Net Worth, Accounts, Holdings, basic Allocation; privacy mode; exports (CSV) |
| **M2 — Money in/out** | MVP flows | Transactions ledger, categories, rules, transfer matching, income/expense, dividends list; Registered Room (CA); Market & Rates page; core calculators → **MVP complete** |
| **M3 — Investor depth** | V1 | TWR/XIRR, benchmarks, FX attribution, dividend forecast & calendar, withholding analysis, ACB & superficial loss, X-ray risk, targets & drift |
| **M4 — Family & India** | V1 | Family page, ownership matrix, per-person access; India page, CAS/EPF imports, FD ladder, PPF/EPF engines, NRE/NRO tax tracking, lakh/crore |
| **M5 — Control & plan** | V1 | Budgets, Credit & Debt with mortgage engine, Goals, deterministic projections & FIRE, remaining calculators, insights engine, saved views, command palette, PDF/print, tax pack (CA) |
| **M6 — Planning pro** | V2 | Monte Carlo, drawdown ordering with CPP/OAS/RRIF, scenarios compare, life events, rebalancing suggestions, ETF look-through, recurring detection, India tax regime compare, multi-dashboards |
| **M7 — Polish & resilience** | V2/Later | Emergency binder, NL query, statement parsing, direct aggregator option, mobile quick actions, Smith manoeuvre, CPP/OAS optimiser |

---

## 7. Delight ideas (better than any commercial tool for this kind of household)

1. **"Explain this number" everywhere.** One click shows the formula, FX rate (with date and source), ownership share and source sheet rows. No commercial tool is this auditable.
2. **Cross-border tax radar.** One panel for:
   - T1135 threshold
   - US situs estate exposure
   - US dividend withholding leakage by account type
   - NRE/NRO interest taxable in Canada plus Indian TDS available as a foreign tax credit
   - Superficial loss checks across the household
3. **Household ACB engine.** Tracks ACB across all of a person's accounts and flags superficial losses that involve the spouse's accounts and TFSA/RRSP. Most tools get this wrong.
4. **FX-truth returns.** Every return is shown in native and reporting currency, with the FX effect separated out ("Your Indian MFs earned 11% in INR, 6.2% in CAD").
5. **Norbert's Gambit and remittance scorecard.** The FX rate you achieved versus BoC mid and versus a bank, with lifetime dollars saved.
6. **Room-aware "where should my next $1,000 go?"** A deterministic waterfall using the household's actual room, marginal rates, RESP grant gaps, FHSA status and emergency fund level.
7. **Wealthica sync-break detector.** Spots accounts whose values have frozen while markets moved, and nudges you before stale data corrupts history.
8. **Lakh/crore-native and multi-currency side-by-side.** The household net worth card can show CAD, USD and INR at once, with Indian digit grouping where it applies.
9. **Time machine.** View any page as of any date: "What did our allocation look like before the house purchase?"
10. **Live-parameter calculators linked to your plan.** Each calculator shows rates with source and freshness, prefills from your data, and "apply to plan" pushes the result into projections and goals.
11. **Family estate/emergency binder.** A printable, encrypted pack with every account, institution, contact, beneficiary and instruction, in English for the spouse and printable for parents in India.
12. **Percent-only advisor mode.** Share a screen or PDF with an advisor or parent without revealing amounts.
13. **Maturity & deadline calendar** combining GIC/FD maturities, PPF extension windows, RRSP deadline, TFSA reset, mortgage renewal, card due dates, BoC decision dates and Indian quarterly rate resets. Exportable as an ICS feed.
14. **Regular-plan MF leakage report (India).** Lifetime commission paid on regular-plan funds held by parents, with the switch-to-direct saving.
15. **Rule tables with provenance.** Every limit, bracket and rate is versioned with its source link and "last verified" date. When CRA, IRS or the Government of India changes a number, one update fixes every calculation, and history stays correct.
16. **Monthly money review ritual.** A 10-minute guided flow: inbox zero → stale balances → room check → allocation drift → insights → snapshot note.

---

## 8. Open questions (answer for your own setup)
- Hosting preference: local desktop app, home server, or private cloud. This affects the PWA, backups and the per-person access design.
- Exact Wealthica sheet layout and refresh cadence. A sample is needed to finalise the column maps.
- Which family members need their own login, and which are managed views only?
- Is anyone in the household a US person (citizen/green card)? If so, PFIC/FBAR logic becomes MVP.
- Market data budget: free sources only, or a low-cost key acceptable? The goal is no subscriptions, which implies free/open feeds plus Wealthica prices.
- Province of residence, for tax brackets and land transfer tax.

---

## Sources (consulted 2026-10-13)
- Wealthica Google Sheets export & add-ons: https://wealthica.com/export-to-spreadsheet/ · https://wealthica.com/blog/add-ons-google-sheets-export-opening-wealthica-3rd-party-developers/ · https://loanscanada.ca/money/wealthica-review/ · https://maplemoney.com/wealthica-review/
- Wealthica connectivity issues: https://wealthica.com/blog/ftq-connectivity-issue/ · https://ca.trustpilot.com/review/wealthica.com
- Monarch vs Copilot: https://getfinny.app/blog/copilot-money-vs-monarch-money-2026 · https://getfinny.app/blog/copilot-money-review-2026 · https://www.tablewealth.com/compare/monarch-vs-copilot-vs-tablewealth
- Kubera: https://www.kubera.com/blog/wealthica-alternatives · https://www.kubera.com/crypto-tracker
- Boldin 2026 release notes: https://www.boldin.com/retirement/release-notes/ · https://smartasset.com/retirement/boldin-review-compare
- Ghostfolio: https://blog.elest.io/ghostfolio-free-open-source-privacy-first-portfolio-wealth-tracker/ · https://www.selfhostyourself.com/services/ghostfolio
- Actual / Firefly III: https://beancount.io/blog/2026/07/26/firefly-iii-vs-actual-budget-self-hosted-open-source-budgeting-guide · https://beancount.io/compare/firefly-iii-alternatives
- Sharesight / Snowball: https://snowball-analytics.com/sharesight-vs-dividend-watch-vs-snowball-analytics · https://stockunlock.com/snowball-analytics-alternatives.html
- Canadian alternatives: https://waypointbudget.com/wealthica-alternative · https://www.richify.ai/ca/compare/richify-vs-wealthica
- INDmoney family accounts: https://www.indmoney.com/networth/family-accounts · Kuvera: https://equitiesindia.com/tools-directory/kuvera-review
- 2026 CA limits: https://www.investmentexecutive.com/industry-news/registered-plan-contributions-conversations-in-2026/ · https://beta.bnnbloomberg.ca/investing/opinion/2025/12/31/cra-sets-new-savings-and-pension-plan-limits-for-2026-dale-jackson/
- 2026 US limits: https://www.visionretirement.com/401k-and-ira-contribution-limits
- BoC 2026 schedule & rate: https://www.bankofcanada.ca/2025/08/bank-canada-publishes-2026-schedule-policy-interest-rate-announcements-other-major-publications/
- India small savings Q3 FY27: https://www.businesstoday.in/personal-finance/story/small-savings-scheme-interest-rates-unchanged-for-q3-fy27-check-ppf-scss-ssy-rates-558892-2026-09-30

> Research caveats:
> - Direct Reddit threads (r/PersonalFinanceCanada, r/fican, r/IndiaInvestments) did not surface in search. Community sentiment above comes from secondary reviews, Trustpilot and vendor pages, plus well-known recurring community themes (Wealthica sync breaks, subscription fatigue, ACB/superficial-loss pain, regular-vs-direct MF plans).
> - ProjectionLab and Lunch Money 2026 specifics could not be verified via search; their entries reflect established feature sets.
> - All rates and limits must be re-verified at the source by the rule-table workflow.
