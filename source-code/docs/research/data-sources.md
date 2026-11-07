# Data Sources Catalogue: Macro, Market and Rule Parameters

**Prepared:** 2026-10-13  
**Scope:** Canada (primary), United States, India, and global markets. These are the parameters a personal-finance dashboard needs for calculators and projections.  
**Architecture assumed:** a static React/TS site, plus a daily GitHub Actions cron job that writes `public/data/snapshot.json`. The app loads that file.

## How to read this document

- **Verified** means the endpoint was called on 2026-10-13 from this machine (curl) and returned the value shown. **Doc-verified** means the official web page was read on 2026-10-13. **Secondary** means the value was confirmed only through news or aggregator coverage. Re-check secondary values against the primary source before relying on them.
- **CORS ✅** means the response carries `Access-Control-Allow-Origin: *` (or reflects the origin), so a browser could call it directly. **CORS ❌** means the call must go through the cron job.
- Fallback values are the "last known good" values on the date shown. Put them in `static-defaults.json`.
- The parameters fall into two classes:
  1. **Market/macro series** (rates, CPI, FX, prices). These change daily, weekly or monthly. Fetch them by API in the cron job.
  2. **Rule parameters** (contribution limits, tax brackets, benefit amounts, small-savings rates). These change once a year (or once a quarter). No official machine-readable API exists for almost any of them. Keep them in a **hand-curated, versioned `rules/<region>-<year>.json` file** in the repo, with the source URL for each value. A cron job can optionally scrape the page to *detect a change* (hash the HTML table) and open a GitHub issue. It should never auto-overwrite rule values.

---

## 1. Canada

### 1.1 Bank of Canada Valet API (primary Canadian market/macro source)

- **Base:** `https://www.bankofcanada.ca/valet/`
- **Auth:** none. **CORS ✅** (`Access-Control-Allow-Origin: *`, verified). **Format:** JSON, CSV or XML (`/json`, `/csv`, `/xml`).
- **Pattern:** `observations/{series1,series2,...}/json?recent=N` or `?start_date=YYYY-MM-DD&end_date=...`. Groups: `observations/group/{groupName}/json?recent=1`.
- **Discovery:** `https://www.bankofcanada.ca/valet/lists/series/json` and `.../lists/groups/json`.
- **Licence:** BoC Terms of Use (https://www.bankofcanada.ca/terms/). Free reuse with attribution, no endorsement implied.
- **Response shape:** `{ seriesDetail: {...}, observations: [{ d: "YYYY-MM-DD", SERIES: { v: "2.25" } }] }`. Values are **strings**, so parse them and validate. When you query several series at once, they can land on different dates in separate observation objects. Take the latest *non-empty* value per series.

| Parameter | Series ID | Freq | Verified value (as of) | Static fallback | Backup source |
|---|---|---|---|---|---|
| Policy (overnight) rate target | `V39079` | business daily | **2.25%** (2026-10-12) | 2.25% (2026-10-12) | BoC rate announcement page; FRED `IRSTCB01CAM156N` (monthly) |
| Prime rate (chartered banks, typical) | `V80691311` | weekly (Wed) | **4.45%** (2026-10-07) | 4.45% (2026-10-07) | Big-5 bank sites |
| Conventional 5-yr **posted** mortgage rate | `V80691335` | weekly (Wed) | **6.19%** (2026-10-07) | 6.19% (2026-10-07) | StatCan table 34-10-0145-01 |
| GoC 2y benchmark yield | `BD.CDN.2YR.DQ.YLD` | daily | **3.18%** (2026-10-09) | 3.18% | FRED `IRLTLT01CAM156N` (10y only, monthly) |
| GoC 3y / 5y / 7y | `BD.CDN.3YR.DQ.YLD` / `BD.CDN.5YR.DQ.YLD` / `BD.CDN.7YR.DQ.YLD` | daily | 3.29 / **3.54** / 3.62% (2026-10-09) | same | — |
| GoC 10y benchmark yield | `BD.CDN.10YR.DQ.YLD` | daily | **3.86%** (2026-10-09) | 3.86% | FRED `IRLTLT01CAM156N` = 3.675% (Aug 2026, monthly) |
| GoC long (30y) | `BD.CDN.LONG.DQ.YLD` | daily | 4.23% (2026-10-09) | 4.23% | — |
| Real Return Bond yield | `BD.CDN.RRB.DQ.YLD` | daily | 1.93% (2026-10-09) | 1.93% | — |
| *(group for all above)* | group `bond_yields_benchmark` | | | | |
| Total CPI index (NSA, 2002=100) | `V41690973` | monthly (~3rd Tue) | **169.8** (Aug 2026) | 169.8 (2026-08) | StatCan WDS vector 41690973 |
| CPI YoY % (headline) | `STATIC_TOTALCPICHANGE` | monthly | **3.0%** (Aug 2026) | 3.0% | compute from V41690973 |
| CPI-trim / CPI-median / CPI-common (YoY %) | `CPI_TRIM` / `CPI_MEDIAN` / `CPI_COMMON` | monthly | 1.9 / 2.0 / 2.6% (Aug 2026) | same | — |
| CPIX / CPI-XFET (YoY %) | `ATOM_V41693242` / `STATIC_CPIXFET` | monthly | 2.4 / 2.1% (Aug 2026) | same | — |
| *(group for CPI)* | group `CPI_MONTHLY` | | | | |
| USD/CAD (daily average) | `FXUSDCAD` | business daily (~16:30 ET) | **1.4222** (2026-10-13) | 1.4222 | FRED `DEXCAUS` 1.4269 (2026-10-09); Frankfurter |
| INR/CAD (CAD per 1 INR) | `FXINRCAD` | business daily | **0.01493** (2026-10-13), i.e. ≈66.98 INR per CAD | 0.01493 | Frankfurter CAD→INR 66.905 (2026-10-13) |
| EUR/CAD, GBP/CAD | `FXEURCAD`, `FXGBPCAD` | business daily | 1.5919 / 1.8841 (2026-10-13) | same | Frankfurter |
| *(all 26 currencies)* | group `FX_RATES_DAILY` | | | | |
| Lending rates by chartered banks (mortgage, variable, consumer) | groups `A4_RATES_MORTGAGES`, `A4_RATES_VARIABLE`, `A4_RATES_CONSUMER` | monthly | not sampled | — | — |

Single cron call that covers almost everything for Canada:
```
https://www.bankofcanada.ca/valet/observations/V39079,V80691311,V80691335,BD.CDN.2YR.DQ.YLD,BD.CDN.5YR.DQ.YLD,BD.CDN.10YR.DQ.YLD,BD.CDN.LONG.DQ.YLD,FXUSDCAD,FXINRCAD,FXEURCAD,FXGBPCAD/json?recent=5
https://www.bankofcanada.ca/valet/observations/group/CPI_MONTHLY/json?recent=13
```
Use `recent=13` on CPI so the job can compute YoY itself as a cross-check against `STATIC_TOTALCPICHANGE`.

**Note on posted vs. contract rates:** the 5-yr *posted* rate (6.19%) is what banks use for IRD penalties, and it used to be the insured-mortgage qualifying benchmark. Real *contract* rates are much lower. For an "estimated current 5-yr fixed you could get" parameter, use `GoC 5y + spread` (a spread of ~1.3 to 1.7 pts historically) or a user override. Label clearly whichever you choose.

### 1.2 Statistics Canada Web Data Service (WDS)

- **Base:** `https://www150.statcan.gc.ca/t1/wds/rest/`
- **Auth:** none. **CORS ✅** (verified: `Access-Control-Allow-Origin: *`, GET/POST/OPTIONS). **Format:** JSON.
- **Licence:** Statistics Canada Open Licence (attribution required).
- **Key methods:**
  - `POST getDataFromVectorsAndLatestNPeriods` with body `[{"vectorId":41690973,"latestN":13}]`. Verified: returned `refPer 2026-08-01, value 169.8, releaseTime 2026-09-14T08:30`.
  - `POST getSeriesInfoFromVector`, `GET getFullTableDownloadCSV/{productId}/en`, `GET getChangedSeriesList`. `getChangedSeriesList` is handy to skip work on days with no release.
- **Useful vectors/tables:**
  - CPI all-items Canada: vector `41690973` (table 18-10-0004-01).
  - Provincial CPI (e.g. Ontario): table 18-10-0004-01. Look up the vector with `getSeriesInfoFromCubePidCoord`.
  - Chartered bank posted rates: table 34-10-0145-01 (weekly). Backup for BoC V80691335.
  - New housing price index (18-10-0205-01) and average weekly earnings (14-10-0223-01). Useful for "salary growth" defaults.
- **Release calendar:** CPI is published around the third Tuesday of each month at 08:30 ET.

### 1.3 CRA / ESDC rule parameters (hand-curated; no API)

The canada.ca pages are HTML only. `curl` from this machine returned status 000 (connection reset) on several canada.ca pages, while a browser-like fetcher succeeded. In GitHub Actions, send a browser User-Agent and `--http1.1`, and treat the scrape as *change detection only*.

| Parameter | 2026 value | Status | Official source | Static fallback |
|---|---|---|---|---|
| TFSA annual limit | **$7,000** (2024, 2025, 2026) | Doc-verified | https://www.canada.ca/en/revenue-agency/services/tax/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html | $7,000 (2026) |
| TFSA cumulative room since 2009 (age 18+ and resident since 2009) | **$109,000** (2026) | Secondary (consistent with the official annual sums: 5k×4 + 5.5k×2 + 10k + 5.5k + 5k×3 + 6k×4 + 6.5k + 7k×3 = 109k) | CRA TFSA contributions page | $109,000 |
| TFSA history table (for room calculation) | 2009–12 $5,000; 2013–14 $5,500; 2015 $10,000; 2016–18 $5,500; 2019–22 $6,000; 2023 $6,500; 2024–26 $7,000 | Known | as above | ship the table |
| RRSP: % of prior-year earned income | **18%** | Known (statutory) | CRA RRSP page | 18% |
| RRSP dollar limit | **$33,810 (2026)**; $35,390 (2027); $32,490 (2025) | Doc-verified | MP/RRSP/DPSP/TFSA/YMPE table (link above) | $33,810 |
| Money-purchase (RPP) limit | $35,390 (2026) | Doc-verified | same | — |
| FHSA annual / lifetime / max carry-forward | **$8,000 / $40,000 / $8,000** (not indexed) | Secondary plus Finance Canada design paper | https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account.html | same |
| RESP lifetime contribution limit | $50,000 per beneficiary | Known (not re-verified) | ESDC RESP pages | $50,000 |
| CESG basic | 20% of first $2,500/yr = **$500/yr**; lifetime **$7,200**; additional CESG 20%/10% on first $500 for family income ≤ **$58,523** / ≤ **$117,045** (2026) | Doc-verified | https://www.canada.ca/en/services/benefits/education/education-savings/savings-grant.html | same |
| Canada Learning Bond | $500 first year + $100/yr, lifetime $2,000 | Doc-verified | same | same |
| CPP YBE / YMPE / YAMPE | **$3,500 / $74,600 / $85,000** (2026) | Doc-verified | ESDC "Maximum benefit amounts" page (below); CRA T4032 | same |
| CPP contribution rates | 5.95% employee (11.90% self-employed); CPP2 4.00% (8.00%); max $4,230.45 + $416.00 | Doc-verified | same | same |
| CPP max retirement pension at 65 (monthly) | **$1,507.65** (2026) | Doc-verified | https://www.canada.ca/en/employment-social-development/programs/pensions/pension/statistics/2026-quarterly-october-december.html | same |
| CPP early/late adjustment | −0.6%/month before 65 (max −36% at 60); +0.7%/month after 65 (max +42% at 70) | Known (statutory) | canada.ca CPP pages | same |
| OAS max monthly 65–74 / 75+ | **$762.50 / $838.75** (Oct–Dec 2026) | Doc-verified | same ESDC page (indexed quarterly: Jan/Apr/Jul/Oct) | same |
| OAS recovery tax (clawback) threshold | starts at **$95,323**; full at $155,320 (65–74), $161,320 (75+) | Doc-verified | same | same |
| OAS deferral | +0.6%/month, max +36% at 70 | Doc-verified | same | same |
| GIS max (single) | $1,138.90/month (Oct–Dec 2026) | Doc-verified | same | same |
| EI max insurable earnings / rate | $68,900 / 1.63% (2026, outside QC) | Doc-verified (T4032ON) | CRA T4032ON | same |
| Capital gains inclusion rate | **50%** (the proposed 2/3 increase was cancelled on 2025-03-21) | Secondary (multiple) | CRA line 12700; Finance Canada | 50% |
| Lifetime capital gains exemption | $1,250,000 (since 2024-06-25); indexation from 2026 claimed by one source (~$1.275M), **unverified** | Secondary | CRA | $1,250,000 |

**Federal 2026 brackets** (doc-verified, CRA T4032ON January 2026; indexation 2.0%):

| Taxable income | Rate |
|---|---|
| ≤ $58,523 | **14%** (the lowest rate fell from 15% on 2025-07-01; the full year is at 14% from 2026) |
| $58,523 – $117,045 | 20.5% |
| $117,045 – $181,440 | 26% |
| $181,440 – $258,482 | 29% |
| > $258,482 | 33% |

Federal BPA: $16,452 max (phasing to $14,829 at high incomes).

**Ontario 2026 brackets** (doc-verified, T4032ON):

| Taxable income | Rate |
|---|---|
| ≤ $53,891 | 5.05% |
| $53,891 – $107,785 | 9.15% |
| $107,785 – $150,000 | 11.16% |
| $150,000 – $220,000 | 12.16% |
| > $220,000 | 13.16% |

Ontario BPA $12,989. Surtax: 20% of basic Ontario tax over $5,818, plus 36% of basic Ontario tax over $7,446. Ontario Health Premium: up to $900 (not indexed). The $150k and $220k thresholds are **not indexed**.

**Other provinces:** use the CRA per-province payroll guides. URL pattern: `https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032{xx}-jan/t4032{xx}-january-general-information.html`, where `xx` = `bc, ab, sk, mb, on, nb, ns, pe, nl, yt, nt, nu`. Quebec is administered by Revenu Québec (TP-1015.F). The canonical CRA page "Canadian income tax rates for individuals – current and previous years" links to a per-year page. The guessed `/2026.html` URL returned 404, so navigate from the parent page. Model each province as `{ thresholds[], rates[], bpa, surtax?, healthPremium? }` in `rules/ca-2026.json`. **Not verified in this session:** non-Ontario 2026 provincial values.

### 1.4 Mortgage rules

| Parameter | Value | Status | Source |
|---|---|---|---|
| OSFI MQR (uninsured, B-20) | qualify at **max(contract + 2%, 5.25%)** | Doc-verified (page last modified 2026-01-29) | https://www.osfi-bsif.gc.ca/en/supervision/financial-institutions/banks/minimum-qualifying-rate-uninsured-mortgages |
| Insured MQR | max(contract rate, 5.25%) under the Finance Canada rule. Since Nov 2024, insured *straight switches* at renewal are exempt | Known, not re-verified | Department of Finance |
| OSFI loan-to-income portfolio limits (from 2025) | apply to lenders' portfolios, not a per-borrower rule | Doc mention only | OSFI LTI page |
| CMHC premium (% of loan, by LTV) | ≤65% **0.60**, ≤75% **1.70**, ≤80% **2.40**, ≤85% **2.80**, ≤90% **3.10**, ≤95% **4.00** (4.50 non-traditional down payment) | Doc-verified | https://www.cmhc-schl.gc.ca/consumers/home-buying/mortgage-loan-insurance-for-consumers/cmhc-mortgage-loan-insurance-cost |
| Provincial sales tax on premium | ON 8%, QC 9%, SK 6% (paid in cash, cannot be added to the loan) | Doc-verified (provinces named); rates are known | CMHC |
| 30-yr amortization surcharge | +0.20% premium | Known, **not shown on the CMHC page** | CMHC/lender |
| Insured price cap / min. down payment | price < **$1.5M** (since 2024-12-15); 5% on first $500k, 10% on the portion from $500k to $1.5M; 20% at or above $1.5M | Known, not re-verified | Finance Canada |
| 30-yr insured amortization | first-time buyers (any home) and all new builds (since 2024-12-15) | Known, not re-verified | Finance Canada |

Canadian fixed mortgages compound **semi-annually** (Interest Act). The calculator should convert with `(1 + r/2)^(2/12) − 1`.

---

## 2. United States

### 2.1 FRED (St. Louis Fed)

- **API base:** `https://api.stlouisfed.org/fred/series/observations?series_id={ID}&api_key={KEY}&file_type=json&sort_order=desc&limit=13`
- **Auth:** **free API key required** (verified: a call without a key returns `400 "Variable api_key is not set"`). Store it as GitHub secret `FRED_API_KEY`. **CORS ❌** on the API (no ACAO header), and the key must not ship to the browser anyway.
- **Keyless alternative (verified working):** `https://fred.stlouisfed.org/graph/fredgraph.csv?id={ID}` returns CSV `observation_date,{ID}`. **CORS ❌**. If you pass several ids, the response is a **ZIP**, so request one id per call. It is undocumented for programmatic use, so treat it as a backup.
- **Limits:** 120 requests/min per key. **Licence:** FRED Terms of Use. Many series are third-party copyrighted (e.g. `MORTGAGE30US` © Freddie Mac, ICE BofA indices). Personal, non-commercial display with attribution is fine. Don't republish bulk history publicly without checking each series' notes.

| Parameter | Series | Freq | Verified value (as of) | Fallback | Backup |
|---|---|---|---|---|---|
| CPI-U index, SA | `CPIAUCSL` | monthly | **334.131** (2026-08) | 334.131 | BLS `CUSR0000SA0` |
| Fed funds, effective daily | `DFF` | daily | **3.88%** (2026-10-12) | 3.88% | NY Fed EFFR |
| Fed funds, monthly avg | `FEDFUNDS` | monthly | 3.75% (2026-09) | — | — |
| Fed target range upper/lower | `DFEDTARU` / `DFEDTARL` | daily | not sampled | — | federalreserve.gov |
| 10-yr Treasury CMT | `DGS10` | daily | **5.24%** (2026-10-09) | 5.24% | Treasury par yield CSV (5.21% on 10/13) |
| 30-yr fixed mortgage avg (Freddie Mac PMMS) | `MORTGAGE30US` | weekly (Thu) | **7.40%** (2026-10-08) | 7.40% | freddiemac.com/pmms |
| 10-yr breakeven inflation | `T10YIE` | daily | not sampled | ~2.3% | — |
| USD→INR | `DEXINUS` | daily (H.10) | 96.73 (2026-10-09) | — | RBI/FBIL, Frankfurter |
| USD→CAD | `DEXCAUS` | daily | 1.4269 (2026-10-09) | — | BoC FXUSDCAD |
| India 10y G-sec (OECD) | `INDIRLTLT01STM` | monthly, lagged | 6.78% (2026-07) | — | RBI homepage |
| India CPI (OECD) | `INDCPIALLMINMEI` | **stale: last 2025-03** | do not use | — | — |
| Canada 10y (OECD) | `IRLTLT01CAM156N` | monthly | 3.675% (2026-08) | — | BoC |
| Gold LBMA | `GOLDAMGBD228NLBM` | **discontinued** (LBMA withdrew it from FRED in 2022; the URL now returns an HTML bot page) | — | — | see §4 |

### 2.2 BLS Public Data API

- **Endpoint:** `https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0` (GET) or POST with `{"seriesid":[...],"startyear":"2025","endyear":"2026","registrationkey":"..."}`.
- **Auth:** none for v1-level use (25 queries/day, 10 years, no calculations). A free registration key gives 500/day, 20 years and net/percent changes. **CORS ✅** (verified `Access-Control-Allow-Origin: *`).
- Verified: `CUUR0000SA0` (CPI-U, NSA) = **334.980** (Aug 2026). CPI-W (used for the SS COLA) is `CWUR0000SA0`.
- **Licence:** US government work, public domain.

### 2.3 US Treasury

- **Daily par yield curve (CSV):** `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{YYYY}/all?type=daily_treasury_yield_curve&field_tdr_date_value={YYYY}&page&_format=csv`. **CORS ✅**, no auth. Verified 10/13/2026: 3M 4.26, 2Y 4.79, 5Y 5.00, **10Y 5.21**, 30Y 5.56%. Real yields: use `type=daily_treasury_real_yield_curve`.
- **Fiscal Data API:** `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/...`. **CORS ✅**, no auth, JSON.
  - `v1/accounting/od/rates_of_exchange?filter=country_currency_desc:in:(India-Rupee,Canada-Dollar)&sort=-record_date&page[size]=2`. **Quarterly** official Treasury reporting rates. Verified 2026-09-30: CAD 1.418, INR 95.83. Useful as a sanity cross-check, not as a live rate.
  - `v2/accounting/od/avg_interest_rates`. Verified T-bill avg 3.870% (2026-09-30).
- I Bonds / TIPS rates: TreasuryDirect (HTML, updated May 1 and Nov 1).

### 2.4 IRS limits and brackets (hand-curated)

Sources: IRS "COLA increases for dollar limitations" (https://www.irs.gov/retirement-plans/cola-increases-for-dollar-limitations-on-benefits-and-contributions, HTTP 200 verified) and Rev. Proc. 2025-32 (tax-year 2026 inflation adjustments). The 2027 limits are typically announced late Oct/Nov 2026, so plan a manual update then.

| Parameter | 2026 | Status |
|---|---|---|
| 401(k)/403(b)/457 elective deferral | **$24,500** | Secondary (multiple, consistent) |
| Catch-up 50+ / "super catch-up" 60–63 | $8,000 / $11,250 | Secondary |
| IRA (Trad/Roth) | **$7,500**; catch-up 50+ $1,100 | Secondary |
| HSA self / family / 55+ catch-up | **$4,400 / $8,750 / $1,000** | Secondary |
| Standard deduction single / MFJ / HoH | **$16,100 / $32,200 / $24,150** | Secondary (one outlet says HoH $24,175, so verify) |
| Brackets, single (10/12/22/24/32/35/37%) | 12,400 / 50,400 / 105,700 / 201,775 / 256,225 / 640,600 | 10%, 32% and 37% thresholds secondary-verified; middle thresholds **from memory of Rev. Proc. 2025-32, verify** |
| Brackets, MFJ | 24,800 / 100,800 / 211,400 / 403,550 / 512,450 / 768,700 | same caveat |
| LTCG 0%/15%/20% thresholds | not verified this session | **Unverified**. Take from Rev. Proc. 2025-32 |

### 2.5 Social Security

- **COLA history:** https://www.ssa.gov/oact/cola/colaseries.html (HTML; returned 403 to the automated fetcher, so use a browser UA). Values: 2023 8.7%, 2024 3.2%, 2025 2.5%, **2026 2.8%**.
- **2027 COLA is due to be announced on 2026-10-14 (tomorrow)**. Estimates are ~3.5–3.6%. Update the rules file after the announcement. Also update the 2027 wage base and earnings-test limits, which are announced at the same time (https://www.ssa.gov/news/press/factsheets/colafacts2027.pdf, expected).
- Cross-check: the COLA = Q3 avg CPI-W YoY, computable from BLS `CWUR0000SA0`.

---

## 3. India

### 3.1 Reserve Bank of India / FBIL

No public JSON API. Sources:

| Parameter | Source | Format | Verified value (as of) | Fallback | Backup |
|---|---|---|---|---|---|
| Policy repo rate | RBI homepage "Current Rates" block: https://www.rbi.org.in/ | HTML scrape (cron only, **CORS ❌**) | **5.50%** (hiked 25 bp on 2026-10-07; first hike since Feb 2023. Stance: "calibrated tightening") | 5.50% (2026-10-07) | RBI press releases; DBIE |
| SDF / MSF / Bank rate | same | HTML | 5.25 / 5.75 / 5.75% | same | — |
| CRR / SLR | same | HTML | 3.00 / 18.00% | — | — |
| INR reference rate (FBIL) USD/GBP/EUR/JPY | same block ("Source: FBIL", 1:00 pm IST); FBIL https://www.fbil.org.in/ (Angular SPA) | HTML | **₹95.2477 / USD** (2026-10-13) | 95.25 | FRED `DEXINUS`, Frankfurter (ECB) USD→INR 95.28 |
| 10y G-sec (benchmark 6.94% GS 2036) | same block | HTML | **7.3868%** (2026-10-12) | 7.39% | FRED `INDIRLTLT01STM` 6.78% (Jul 2026, lagged) |
| T-bill cut-offs 91/182/364d | same block | HTML | 5.5747 / 6.0999 / 6.2869% | — | — |
| Term deposit rate > 1 yr (range across banks) | same block | HTML | 6.00 – 6.75% | — | — |
| Savings deposit rate | same block | HTML | 2.50% | — | — |
| Sensex / Nifty 50 | same block | HTML | 71,924.68 / 22,363.35 (2026-10-12) | — | Yahoo `^BSESN`, `^NSEI` |
| Historical series | RBI DBIE: https://data.rbi.org.in/DBIE/ (SPA; manual Excel export) | — | — | — | — |

Scraping approach: fetch the homepage with a browser UA, strip tags, and regex `Policy Repo Rate\s*:\s*([\d.]+)%`. Validate the result against the bounds in §7. Licence: RBI website content is copyrighted; reproduction is permitted with acknowledgement. Private dashboard use is fine.

### 3.2 CPI (MoSPI)

- **New series base 2024=100** from Jan 2026. The old 2012 series ends Dec 2025, and the two are **not comparable**.
- **Latest:** Aug 2026 headline **4.82%** YoY (provisional, released 2026-09-14). Secondary source (PIB coverage). July 4.45%, June 4.38%.
- **API:** `https://api.mospi.gov.in/api/cpi/getCPIIndex?Format=JSON&...`. Verified that it responds, but **only base-2012 data came back** (last Dec 2025). Base-2024 queries returned "No Data Found". The user manual (https://api.mospi.gov.in/API/CPI%20API%20User%20Manual.pdf) says that without a login token, only the first 10 records are returned. A token needs sign-up and lasts 30 minutes. The response sends a 403 to cross-origin requests, so it is **cron only**.
- **Practical recommendation:** treat India CPI as a **semi-manual monthly value** (released ~12th of each month on PIB/MoSPI). Store it in `rules/in-macro.json`, or scrape the PIB release. Fallback **4.8% (Aug 2026)**. For long-run projections, use the RBI target of **4%** (band 2–6%).
- **Unverified:** a working base-2024 API endpoint.

### 3.3 Small-savings schemes (Ministry of Finance, DEA; quarterly)

- **Authority:** DEA notification each quarter (end of Mar/Jun/Sep/Dec) at https://dea.gov.in/ (Budget division → small savings). Also published on the India Post / NSI pages (https://www.nsiindia.gov.in/InternalPage.aspx?Id_Pk=181 has a TLS chain issue for some clients). No API; hand-curate quarterly.
- **Q3 FY2026-27 (1 Oct – 31 Dec 2026): unchanged** from the previous quarter (secondary, multiple outlets, consistent):

| Scheme | Rate | Compounding / notes |
|---|---|---|
| PPF | **7.1%** | annual; 15-yr lock-in; ₹500–₹1.5L/yr |
| Sukanya Samriddhi (SSY) | **8.2%** | annual; max ₹1.5L/yr |
| Senior Citizens Savings (SCSS) | **8.2%** | paid quarterly; max ₹30L |
| NSC (5-yr) | **7.7%** | compounded annually, paid at maturity |
| Kisan Vikas Patra | **7.5%** | doubles in 115 months |
| Post Office MIS | **7.4%** | paid monthly; max ₹9L single / ₹15L joint |
| PO Savings | **4.0%** | — |
| PO Time Deposit 1/2/3/5 yr | 6.9 / 7.0 / 7.1 / 7.5% | quarterly compounding. **Not individually re-verified**; carried from earlier quarters with no change |
| PO Recurring Deposit (5-yr) | 6.7% | same caveat |

### 3.4 EPF / NPS

- **EPF:** **8.25%** for FY2025-26 (approved by the CBT on 2026-03-02; Finance Ministry concurrence ~June 2026). Secondary, consistent. Source: EPFO circulars https://www.epfindia.gov.in/. Annual; fallback 8.25%.
- **NPS:** no "rate" exists, since returns are market-linked. Use the equity/G-sec assumptions from §5. Rules to store (**not re-verified this session; confirm on PFRDA / incometax.gov.in**): 80CCD(1B) extra ₹50,000 deduction (old regime only); employer contribution deduction 80CCD(2) up to 14% of basic+DA in the new regime (10% in the old regime for private employers); equity cap 75% (Active choice). Exit rules were revised in 2025–26 to allow a larger lump sum for non-government subscribers. Treat the annuity % as a user input.

### 3.5 Bank FD rates (SBI as the reference)

- **Source:** https://sbi.co.in/web/interest-rates/deposit-rates/retail-domestic-term-deposits (HTML; did not respond to curl within the timeout from here, so cron scrape is flaky). No API.
- **Current card** (secondary; effective 2025-12-15, reported unchanged through Oct 2026): general public 3.05% (7–45 d) up to ~6.45%; 2–3 yr **6.40%**; 5–10 yr **6.05%**. Senior citizens +50 bp (5–10 yr 7.05%). The "Amrit Vrishti" 444-day special is 6.95% for seniors.
- **Risk:** the repo hike on 2026-10-07 makes an FD rate revision likely within weeks. Mark this parameter **manual, review monthly**. Fallback: 1-yr ≈ 6.25%, 5-yr 6.05% (general), as of 2025-12-15.
- **Backup:** the RBI homepage "Term Deposit Rate > 1 Year" range (6.00–6.75%) is scrapeable and good enough as a generic "Indian FD rate" band.

### 3.6 Income tax (India), FY 2026-27 (AY 2027-28)

The **Income-tax Act 2025 takes effect 2026-04-01** and replaces the 1961 Act. Rates and slabs are carried over, but section numbers change (e.g. 87A, 80C, 111A, 112A get new numbers), so key the rules file by concept, not by section. Secondary sources say Budget 2026 made no slab changes. Verify at https://www.incometax.gov.in/.

**New regime (default):** 0–4L nil; 4–8L 5%; 8–12L 10%; 12–16L 15%; 16–20L 20%; 20–24L 25%; >24L 30%. Rebate up to ₹60,000, so **no tax up to ₹12L** (₹12.75L for salaried with the ₹75,000 standard deduction). Marginal relief applies just above ₹12L. Surcharge capped at 25%. 4% health & education cess.

**Old regime:** <60: 0–2.5L nil; 2.5–5L 5%; 5–10L 20%; >10L 30%. Seniors 60–80 exemption ₹3L; 80+ ₹5L. Rebate ₹12,500 up to ₹5L. Standard deduction ₹50,000. 80C ₹1.5L, 80D, etc.

**Capital gains** (since 2024-07-23; secondary, consistent):
- Listed equity / equity MF: **STCG 20%** (≤12 months); **LTCG 12.5% above ₹1.25L/yr exemption**, no indexation.
- Other assets (property, gold, unlisted): LTCG 12.5% without indexation, holding period 24 months. Land/building bought before 2024-07-23 can choose 20% with indexation (resident individuals).
- Debt MFs bought on or after 2023-04-01: taxed at slab rate regardless of holding period.

**NRI angle:** if you're a Canadian resident with Indian accounts, note TDS on NRO interest (30% + cess before DTAA relief) and the India–Canada DTAA. These are rules, not data, so put them in the rules file.

---

## 4. Markets: prices, history, crypto, gold

| Need | Source | Endpoint | Auth | CORS | Verified | Licence / caveats |
|---|---|---|---|---|---|---|
| ETF/stock/index quotes and history (CA, US, India) | **Yahoo Finance chart API (unofficial)** | `https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?range=10y&interval=1mo` (e.g. `XIU.TO`, `XEQT.TO`, `SPY`, `^GSPTSE`, `^GSPC`, `^NSEI`, `^BSESN`, `NIFTYBEES.NS`) | none, but needs a browser `User-Agent` | **❌** | ✅ XIU.TO 53.76 CAD (2026-10-13) | **Not an official API.** Yahoo ToS restrict automated use. It can break without notice and may rate-limit GitHub Actions IPs. Fine for a personal dashboard; always back it with a fallback |
| Same, official-ish free tier | **Alpha Vantage** | `https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=XIU.TRT&apikey=KEY` (TSX suffix `.TRT`; BSE `.BSE`) | **free key** (25 req/day) | ✅ | ✅ (demo key, IBM 230.80 on 2026-10-13) | Free tier is very limited, so batch monthly history once per week |
| Alternatives | Tiingo (free key, US-centric, EOD), Twelve Data (free key, 800/day), Financial Modeling Prep (free key) | — | free key | varies | not tested | — |
| **Stooq CSV** | `https://stooq.com/q/d/l/?s=spy.us&i=d` | — | — | — | ❌ **now behind a JS proof-of-work bot wall** (verified 2026-10-13); quote endpoint returns 404 | Do not rely on it |
| Long-run historical annual returns (S&P 500, T-bills, T-bonds, corporate bonds, real estate, gold since 1928) | **Damodaran (NYU Stern)** | `https://pages.stern.nyu.edu/~adamodar/pc/datasets/histretSP.xls` (HTML: `.../New_Home_Page/datafile/histretSP.html`) | none | n/a (static file, fetch once a year) | ✅ HTTP 200 | Free for educational use with citation; updated each January |
| Shiller CAPE / long US history | Robert Shiller data (`ie_data.xls`, Yale) | — | none | — | not tested | Free, academic |
| Crypto prices + history | **CoinGecko** | `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=cad,usd,inr`; history `.../coins/bitcoin/market_chart?vs_currency=cad&days=365&interval=daily` | keyless works (low, shared rate limit). Free "Demo" key recommended (`x-cg-demo-api-key`, ~30 req/min, 10k/month) | ✅ | ✅ BTC CAD 118,231 / USD 83,169; ETH CAD 3,562.09 (2026-10-13) | Attribution "Data by CoinGecko" required |
| Crypto backup | Coinbase `https://api.coinbase.com/v2/prices/BTC-CAD/spot`; Kraken public ticker | — | none | ✅ (Coinbase) | not tested | — |
| Gold / silver spot (USD/oz) | **gold-api.com** | `https://api.gold-api.com/price/XAU` (also `XAG`) | none | ✅ | ✅ XAU **$4,158.80** (2026-10-13T20:23Z) | Free and unofficial. Convert to CAD/INR with BoC/RBI FX |
| Gold official benchmark | LBMA Gold Price (https://www.lbma.org.uk/prices-and-data/precious-metal-prices) | HTML/JSON behind the site | — | — | page 200 | Redistribution restricted (ICE/LBMA licence). FRED no longer carries it |
| India gold (₹/10g) | IBJA rates (ibjarates.com, HTML), or compute XAU×USDINR÷31.1035×10 plus ~6% import duty + 3% GST premium | — | — | — | not tested | Computed value is an approximation |
| FX backup (any pair) | **Frankfurter** (ECB reference rates) | `https://api.frankfurter.dev/v1/latest?base=CAD&symbols=USD,INR` | none | ✅ | ✅ CAD→INR 66.905, CAD→USD 0.70219 (2026-10-13) | Open source, ECB data; ~16:00 CET daily. A v2 endpoint is advertised via the `Link` header |

**Recommendation:** prices for held tickers come from Yahoo in the cron job (primary), with Alpha Vantage as backup (key in secrets) and the last-known-good snapshot as the final fallback. Never call price APIs from the browser on page load. The static site should load `snapshot.json` only.

---

## 5. Projection assumptions (expected returns, inflation, volatility)

### 5.1 FP Canada / Institute of Financial Planning: Projection Assumption Guidelines 2026 (PRIMARY for Canadian projections)

- Released **2026-04-16**, effective for projections from 2026-04-30. Meant for horizons of **10+ years**.
- PDF: https://www.fpcanada.ca/docs/professionalsitelibraries/standards/projection-assumption-guidelines.pdf?sfvrsn=6e32eebb_4 (HTTP 200 verified). Announcement: https://fpcanada.ca/newsdetail/fp-canada--and-the-institute-of-financial-planning-jointly-publish-the-2026-projection-assumption-guidelines-for-financial-planners (doc-verified).
- Update cadence: annual (April). No API, so hand-curate.

| Assumption (nominal, before fees) | 2026 PAG | Fallback |
|---|---|---|
| Inflation | **2.1%** | 2.1% |
| Short-term (cash) | **2.4%** | 2.4% |
| Fixed income | **3.2%** (down from 3.4%) | 3.2% |
| Canadian equities | **6.3%** | 6.3% |
| U.S. equities | **6.4%** | 6.4% |
| International developed equities | **6.6%** | 6.6% |
| Emerging-market equities | **7.5%** | 7.5% |
| Borrowing rate | **4.4%** | 4.4% |
| YMPE / wage growth | **3.1%** (inflation + 1%) | 3.1% |
| Shelter (home appreciation and rents), new in 2026 | **3.1%** | 3.1% |

Caveats:
- The IFP French release reportedly swaps the Canadian/US equity numbers (6.4/6.6). The FP Canada English release and trade press agree on 6.3/6.4. Confirm against the PDF.
- The PAG says to **deduct investment fees** from these returns. Expose a "fees/MER" input (e.g. 0.2% for ETFs).
- The PAG publishes a correlation matrix in an addendum, but standard deviations were not stated in the announcement.

### 5.2 Volatility assumptions (for Monte Carlo)

No official free source publishes standard deviations alongside the PAG. Use long-run historical annual σ (computed from Damodaran/MSCI history) as **labelled rules of thumb**, and let the user override them:

| Asset class | Annual σ (approx.) | Basis |
|---|---|---|
| Cash / T-bills | 1% | historical |
| Canadian/US aggregate bonds | 5–6% | historical |
| Canadian equities | 15–16% | historical S&P/TSX |
| US equities | 15–16% | S&P 500 1928–2025 ≈ 19.5% nominal; post-1970 ≈ 15–16% |
| International developed | 16–17% | MSCI EAFE |
| Emerging markets | 21–23% | MSCI EM |
| Indian equities (in INR) | 22–25% | Nifty/Sensex history |
| Gold | 15–17% | historical |
| Bitcoin | 60–80% | short history, unstable; cap allocations in projections |

### 5.3 Other published CMAs (backup / cross-check)

- **Vanguard VCMM 10-yr outlook (USD, nominal):** US equities **3.9–5.9%** (Jan 2026 update; Dec 2025 outlook 4.0–5.0%); ex-US equities 4.9–6.9%; US aggregate bonds 3.8–4.8%. Page: https://corporate.vanguard.com/content/corporatesite/us/en/corp/vemo/vemo-return-forecasts.html. Updated ~monthly or quarterly; HTML only.
- Others to cross-check by hand (free, HTML/PDF, annual): BlackRock CMAs (interactive), J.P. Morgan Long-Term Capital Market Assumptions (published each Oct/Nov), Research Affiliates Asset Allocation Interactive.
- **India:** no official CMA exists. Reasonable labelled defaults: inflation 4% (RBI target); Indian equities 10–11% nominal INR; G-sec 7–7.4% (current 10y yield); FD 6–6.5%; PPF 7.1%.
- **US:** Social Security Trustees intermediate assumptions (CPI 2.4%, wage growth ~3.5%) are a free official long-run anchor: https://www.ssa.gov/oact/tr/.

---

## 6. CORS summary

| Endpoint | Browser-callable (CORS) | Auth |
|---|---|---|
| Bank of Canada Valet | ✅ `*` | none |
| StatCan WDS | ✅ `*` | none |
| BLS API v2 | ✅ `*` | none / free key |
| Treasury par-yield CSV, Fiscal Data API | ✅ `*` | none |
| Frankfurter | ✅ `*` | none |
| CoinGecko | ✅ `*` | none / free demo key |
| gold-api.com | ✅ `*` | none |
| Alpha Vantage | ✅ `*` | **free key** (would be exposed if called from the browser, so don't) |
| FRED API | ❌ | **free key** |
| FRED fredgraph.csv | ❌ | none |
| Yahoo Finance chart | ❌ | none (UA needed) |
| RBI homepage, SBI, canada.ca, IRS, SSA, DEA (HTML) | ❌ (HTML pages, scrape only) | none |
| MoSPI API | ❌ (403 to cross-origin; token for >10 rows) | sign-up token |

Even where CORS is allowed, the recommended architecture is **cron-only fetching**. The browser never calls third parties. This gives deterministic loads, no rate-limit exposure and no keys in the client. Optional exception: a manual "refresh FX now" button could call BoC Valet or Frankfurter directly.

---

## 7. Recommended snapshot design

### 7.1 Files

```
public/data/snapshot.json          # written by cron daily; committed to repo (last-known-good history = git log)
public/data/rules/ca-2026.json     # hand-curated annual rules (brackets, limits, CPP/OAS), PR-reviewed
public/data/rules/us-2026.json
public/data/rules/in-fy2026-27.json
public/data/rules/assumptions.json # FP Canada PAG, volatilities, India/US long-run defaults
src/data/static-defaults.ts        # compiled-in fallbacks (same shape), last resort
```

### 7.2 Parameter record shape (TypeScript)

```ts
type Status = "fresh" | "stale" | "fallback";

interface Param<T = number> {
  id: string;                 // "ca.boc.policyRate"
  label: string;              // "BoC policy rate"
  value: T;
  unit: "percent" | "index" | "CAD" | "USD" | "INR" | "ratio" | "fx"; // fx: quote per 1 base
  region: "CA" | "US" | "IN" | "GLOBAL";
  asOf: string;               // date the value refers to (observation date / effective date), ISO
  fetchedAt: string;          // when the cron obtained it, ISO datetime UTC
  source: { name: string; url: string; seriesId?: string; licence?: string };
  status: Status;             // fresh = fetched OK this run & within maxAge; stale = older than maxAge
                              // (carried from last good snapshot); fallback = from static defaults
  maxAgeDays: number;         // e.g. 5 for daily series, 45 for monthly CPI, 120 quarterly, 400 annual
  frequency: "daily" | "weekly" | "monthly" | "quarterly" | "annual" | "adhoc";
  previous?: { value: T; asOf: string };   // for change display & jump detection
  notes?: string;             // e.g. "posted rate, not contract rate"
  validation?: { min: number; max: number; maxJumpAbs?: number; maxJumpPct?: number };
}

interface Snapshot {
  schemaVersion: 1;
  generatedAt: string;
  runId?: string;             // GitHub run id for traceability
  params: Record<string, Param<number>>;
  series?: Record<string, { asOf: string; points: [string, number][] }>; // small histories (e.g. 13 mo CPI, 10y monthly ETF closes)
  errors: { id: string; message: string; at: string }[];
}
```

Rules files use the same envelope (`asOf` = effective date, `source.url` = official page, `status` always "fallback"-class unless reviewed this year). For example:
`{ "ca.tfsa.annualLimit": { "value": 7000, "unit": "CAD", "asOf": "2026-01-01", "source": {...}, "frequency": "annual", "validUntil": "2026-12-31" } }`.
Add `validUntil` to rules. The UI shows a warning when `today > validUntil`, e.g. on 2027-01-01 if the 2027 file hasn't been added.

### 7.3 Fallback chain

```
for each param:
  1. try primary source       → parse → validate → status "fresh"
  2. on failure: try backup   → parse → validate → status "fresh" (source = backup)
  3. on failure: carry value from previous committed snapshot.json (last known good)
        status = (now - asOf) > maxAgeDays ? "stale" : keep "fresh"-but-carried flag (use "stale" if fetch failed and
        asOf older than one expected publication cycle)
  4. if no previous: static-defaults.ts → status "fallback"
  write snapshot; append failure to errors[]
```

Operational rules:
- **Never fail the whole job because one source failed.** Each param is isolated. The job fails (red) only if more than ~30% of params failed, or if a schema or validation error occurred in the writer itself.
- **Commit only when values change.** Use the git history as an audit log and for rollback.
- Validation uses `previous` from the last snapshot, not from defaults.
- Open or update a GitHub Issue automatically when any param has been `stale` for more than 2 cycles, when a rules file is past `validUntil`, or when a change-detection hash on an official page (CRA limits table, DEA small-savings notice, SBI rate card, FP Canada PAG page) changes.
- In the app, show a status badge per value: green fresh, amber stale (with "as of"), grey fallback. Always show `asOf` and source on hover.
- Calendar-driven manual tasks: Jan 1 (CA/US rules), Apr 1 (India FY rules), April (FP Canada PAG), quarterly OAS (Jan/Apr/Jul/Oct) and India small-savings rates (around Mar 31/Jun 30/Sep 30/Dec 31), mid-Oct SS COLA, Oct/Nov IRS limits for next year.

### 7.4 Sanity bounds (reject the value and fall through the chain if violated)

| Param | min | max | max jump vs previous |
|---|---|---|---|
| BoC policy rate | 0.0 | 10 | 1.0 pt/run; must be a multiple of 0.25 |
| Prime (CA) | 1.5 | 13 | 1.0 pt; expect prime − policy ≈ 2.2 (±0.5) |
| 5-yr posted mortgage (CA) | 2 | 12 | 1.0 pt |
| GoC yields (2–30y) | −1 | 10 | 0.5 pt/day |
| CPI index (CA, US) | previous × 0.97 | previous × 1.03 | monthly. YoY computed must be in −3…15% |
| CPI YoY % (any country) | −5 | 20 | 3 pt/month |
| USD/CAD | 1.0 | 1.8 | 5%/day |
| INR per CAD | 40 | 110 | 5%/day |
| INR per USD | 60 | 130 | 5%/day; cross-check BoC-implied (FXUSDCAD/FXINRCAD) vs RBI within 1.5% |
| Fed funds (effective) | 0 | 10 | 1.0 pt |
| US 10y / 30y mortgage | 0 / 2 | 10 / 12 | 0.5 / 0.75 pt |
| RBI repo | 2 | 10 | 1.0 pt; multiple of 0.05 (in practice 0.25) |
| India 10y G-sec | 4 | 10 | 0.5 pt/day |
| Small-savings rates | 3 | 10 | 1.0 pt/quarter |
| EPF | 7 | 10 | 0.5 pt/yr |
| SBI FD rates | 2.5 | 9 | 1.0 pt |
| Equity/ETF price | > 0 | — | 25%/day (index 15%/day); split detection by checking Yahoo `splits` events |
| BTC (USD) | 1,000 | 1,000,000 | 40%/day |
| Gold (USD/oz) | 1,000 | 10,000 | 10%/day; cross-check vs Yahoo `GC=F` within 3% |
| Expected returns (assumptions) | −2 | 15 | manual only |
| TFSA/RRSP/FHSA/IRA/401k limits | previous | previous × 1.15 | manual; must not decrease, except the TFSA 2015→2016 precedent, so allow with an override flag |
| Tax bracket thresholds | previous | previous × 1.10 | manual; thresholds strictly increasing; rates in 0–60% |
| Any `asOf` | not in the future (> now + 1 day) | not older than 3 × maxAgeDays when marked fresh | — |

Also parse strictly: Valet values are strings (`Number()` must give a finite number); FRED uses `"."` for missing values; Treasury CSV dates are `MM/DD/YYYY`; WDS has `scalarFactorCode` and `decimals` fields to respect.

---

## 8. API keys and secrets needed

| Service | Needed? | Secret name | Notes |
|---|---|---|---|
| FRED | **Yes, free key** (for the JSON API; keyless CSV exists as backup) | `FRED_API_KEY` | https://fred.stlouisfed.org/docs/api/api_key.html |
| Alpha Vantage | Optional, free key (backup price source) | `ALPHAVANTAGE_API_KEY` | 25 req/day |
| CoinGecko | Optional, free Demo key (keyless works, rate-limited) | `COINGECKO_DEMO_KEY` | attribution required |
| BLS | Optional, free key (higher limits; not needed for a few daily calls) | `BLS_API_KEY` | — |
| MoSPI | Sign-up token required for full data | — | not recommended; treat India CPI as manual |
| BoC, StatCan, Treasury, Frankfurter, gold-api, Yahoo, RBI/SBI scrape | No | — | — |

---

## 9. Not verified / open items

1. **India CPI base-2024 API:** the MoSPI API returned only base-2012 data (to Dec 2025). The 4.82% Aug-2026 figure is from secondary coverage of the PIB release.
2. **SBI FD card:** the official page did not respond to curl here. Rates are from aggregators (effective 2025-12-15) and are likely to change after the 2026-10-07 repo hike.
3. **Small-savings TD/RD rates** (1/2/3/5-yr TD, RD): carried forward, not individually confirmed for Q3 FY27. PPF/SSY/SCSS/NSC/KVP/MIS were confirmed via multiple outlets, though not from the DEA notification itself.
4. **India slabs/LTCG/NPS rules under the Income-tax Act 2025:** confirmed only by secondary sources. Section numbers have changed.
5. **IRS 2026 middle bracket thresholds, LTCG thresholds, HoH standard deduction:** verify against Rev. Proc. 2025-32.
6. **SS 2027 COLA:** to be announced 2026-10-14.
7. **Non-Ontario 2026 provincial brackets:** not pulled. Use the CRA T4032 per-province pages.
8. **Insured-mortgage rules** ($1.5M cap, 30-yr amortization eligibility, +0.20% surcharge) and the **LCGE indexation** for 2026: from memory or a single source.
9. **FP Canada PAG equity figures:** a minor EN/FR discrepancy (6.3/6.4 vs 6.4/6.6). Confirm in the PDF.
10. **Yahoo Finance:** works today but is unofficial and ToS-restricted. Stooq is now bot-walled. FRED's LBMA gold series is discontinued.
11. **canada.ca from curl:** connection resets were seen from this machine (status 000). Test from a GitHub Actions runner before relying on scraping for change detection.
