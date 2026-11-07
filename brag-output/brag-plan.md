# /brag plan: Financials

**What it is:** a private household finance dashboard that pulls every account (chequing, cards, TFSA, RRSP, pension) into one calm page: net worth, spending, holdings and projections.
**Who it's for:** one household that's tired of logging into every bank to answer "how are we doing?"
**What sets it apart:** it reads your own Google Sheets live in the browser and stores nothing, so it's private by design.
**Visual hook:** account chips scattered across the screen collapse into one logo.
**Share caption:** see share-copy.txt.

**Privacy:** every frame comes from the app's built-in **demo mode**, captured in a clean browser profile. All names, institutions and amounts are fictional ("Maple Bank", "Lakeside Invest", …). No real data, sheet IDs, hostnames or emails appear anywhere.

## Tone: polished
Serious and restrained: long holds, soft dips through the background, a slow push-in on the real UI.

## Visual identity (from src/styles.css)
- Background `#e9e4db`, panel `#efeae2`, ink `#221f19`, muted `#66625a`
- Accent `#3a60aa`, positive `#00705f`
- Inter (variable) from the app's own bundle; app logo from public/favicon.svg

## Music
96 BPM (beat = 0.625 s), A minor. Am – F – C – G pads, soft kick on 1 and 3, a sub bass that follows the roots, and a glassy bell on every scene cut. 34 beats = 21.25 s.

## Storyboard (every cut on a beat)
| # | Beats | Time | Scene |
|---|---|---|---|
| 1 Hook | 0–5 | 0–3.125 s | Account chips (Chequing, Rewards Visa, TFSA, RRSP, FHSA, Pension) drift in one per half-beat around the headline "Your money lives in too many places." |
| 2 Reveal | 5–9 | 3.125–5.625 s | Chips get pulled to the centre and fold into the Financials logo. "One private page for all of it." |
| 3 Overview | 9–17 | 5.625–10.625 s | Real Overview page rises in a window, then pushes into the KPI row while a cursor glides over net worth. Caption: "Net worth, debt and cash at a glance." |
| 4 Spending | 17–23 | 10.625–14.375 s | Spending page; the cursor clicks "Last 12" and the view pushes into the month-by-month chart. Caption: "Every month, every category." |
| 5 Projections | 23–29 | 14.375–18.125 s | Projections page; slow push along the 25-year curve. Caption: "And where it's headed, 25 years out." |
| 6 Outro | 29–34 | 18.125–21.25 s | Logo + "Read live from your own Google Sheets." then "Nothing stored. Nothing shared." |

## v2 (2026-11-07): the full tour, ~94 s

Feedback on v1: too small, too short, and most of the app wasn't shown. v2 records the real app, the public demo build (fictional data), frame by frame at 1.33× zoom so the UI is legible, with a caption per chapter and a dip through the background on every cut. 150 beats at 96 BPM; every cut is on a beat.

| Beats | Scene | Caption |
|---|---|---|
| 0–9 | Hook + reveal (composition.html) | "Your money lives in too many places." → Financials |
| 9–21 | Overview | Net worth, cash flow and investments on one page. |
| 21–31 | Net worth | Where it stands, how it moved, what it's made of. |
| 31–45 | Spending (clicks "Last 3") | Every month, every category, every merchant. |
| 45–53 | Credit cards | Each card on its own, recurring charges found for you. |
| 53–61 | Bank accounts | e-Transfers, bills and big payments, month by month. |
| 61–71 | All transactions | An income statement for the household. |
| 71–77 | Holdings (clicks XEQT) | Everything you hold, across every account. |
| 77–89 | Holding detail | One ETF, looked through down to the companies. |
| 89–103 | Portfolio analysis | Sectors, countries, fee tiers and overlap, across it all. |
| 103–109 | Allocation | By asset class, region, account and tax treatment. |
| 109–117 | Investment income | Every dividend and distribution, by month and by holding. |
| 117–123 | Contribution room | TFSA, RRSP and FHSA, counted from your own transactions. |
| 123–133 | Projections (clicks "Aggressive") | Twenty-five years out, low case to high case. |
| 133–141 | Calculators | Mortgages and what-ifs on rate and payment schedule. |
| 141–150 | Outro | Try it yourself: the demo link. |

Build: work/v2/capture.js (Playwright, against the demo build), intro/outro from work/composition.html, `node work/music.mjs 150 5,9,21,31,45,53,61,71,77,89,103,109,117,123,133,141 v2/music.wav`, ffmpeg.
