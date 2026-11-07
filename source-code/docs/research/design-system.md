# Design System & Frontend Stack — Family Finance Dashboard

Researched 2026-10-13. Scope: React + TypeScript SPA, static hosting, data-dense (charts + tables), light and dark themes, multi-currency (CAD / USD / INR), multi-person household.
Companion docs: [features.md](features.md) (what to build), [security-architecture.md](security-architecture.md) (how data flows / CSP).

Every colour in this file was computed in OKLCH, converted to sRGB hex, and the chart palettes were run through a CVD/contrast validator (Machado 2009 protan/deutan/tritan simulation, OKLab ΔE×100; WCAG 2.x contrast). Measured numbers are quoted next to each set. **Hex is the source of truth** (a few OKLCH entries sit just outside sRGB and were gamut-clipped; the hex shown is what was validated).

---

## 0. TL;DR

- **Look:** "paper and graphite". Light theme = warm off-white paper (`#f5f2ec` page, `#fbf9f5` cards), never `#fff`. Dark theme = cool charcoal (`#191c20` page, `#202327` cards, `#282c30` raised), never `#000`. Very low-opacity SVG grain on the page plane only. One calm accent (muted indigo-blue, hue 262).
- **Semantics:** gain = teal-green (hue 180), loss = vermilion (hue 35). Chosen to separate under deuteranopia (ΔE 11–14) **and** always paired with sign, ▲/▼ glyph and text — never colour alone. Optional "blue / orange" CVD mode.
- **Charts:** one 10-slot categorical palette (blue, orange, teal, violet, clay, sky, olive, pink, gold, sage) with a separate dark-mode step for each hue; passes adjacent-pair CVD ≥ 9.5 and normal-vision ≥ 17.6 in both themes. Red and green are deliberately *not* categorical hues — they belong to gain/loss.
- **Type:** Inter Variable (UI + all figures, `tabular-nums`, `cv11`/`ss01` alternates), Geist Mono or JetBrains Mono only for IDs/account numbers/code. 13–14 px base for density.
- **Stack:** Vite 8 · React 19.3 · TypeScript 7 · TanStack Router · TanStack Query 5 + Zustand 5 · Tailwind CSS 4.3 + CSS variables · shadcn/ui (Base UI flavour) · **Apache ECharts 6** as the single chart engine (+ hand-rolled SVG sparklines) · TanStack Table + TanStack Virtual · react-hook-form + zod 4 · date-fns 4 (+ Temporal when Safari ships) · `Intl` (en-IN lakh/crore) · lucide-react · Dexie 4 · WebCrypto · write-excel-file / SheetJS-from-CDN · browser print → PDF.

---

## 1. Design principles

1. **Numbers first, chrome last.** The figure is the hero; borders, fills, gridlines and icons are recessive. A screen should read as a page of figures with quiet structure, not a collection of boxes. Default to hairline borders and tonal surface steps rather than heavy shadows.
2. **Calm by default, loud only on exception.** Neutral surfaces carry 90 %+ of the pixels; colour is a signal. Accent marks the one primary action or current selection; semantic colours appear only when something is gained/lost, stale, over-budget or wrong. If everything is coloured, nothing is.
3. **Every colour has a job and a token.** No raw hex in components. Colours come from four families with exclusive jobs: *identity* (categorical: accounts, persons, categories, asset classes), *magnitude* (sequential), *polarity* (diverging / gain-loss), *state* (status: positive/negative/warning/info). A colour never moves between jobs — "violet" is never also "warning".
4. **Identity is stable.** An entity keeps its colour everywhere (person "A" is always slot 1; "Equities" always the same hue in every chart). Colour follows the entity, never its rank or current filter. Filters don't repaint survivors.
5. **Never colour alone.** Gains/losses carry sign (+/−), ▲/▼ and, in tables, optional parentheses for negatives. Charts with ≥ 2 series have a legend and direct labels where ≤ 4 series. Status pills carry an icon and a word. A texture/decal mode exists for CVD, print and `forced-colors`.
6. **Honest and current.** Every number knows its as-of time, currency and source. Stale data is badged, estimates are visibly estimates (dashed lines, hatched fills, "≈"), projections show ranges (fan charts), never a single confident line. No dual-axis charts.
7. **Dense but scannable.** Tabular numerals, right-aligned figures, consistent precision per column, 4-px spacing grid, compact density as default with a comfortable toggle. Progressive disclosure: tile → card → drawer → full page.
8. **Private by design.** One keystroke blurs every monetary value; screenshots/print respect it. Nothing sensitive in titles, URLs or the browser history.

---

## 2. Tokens

### 2.1 Naming and layering

Three layers, Tailwind v4 consumes the semantic layer via `@theme inline`:

```
primitive   --paper-50 … --graphite-900, --cat-blue-l, --cat-blue-d …   (never used in components)
semantic    --surface-panel, --text-2, --border, --pos, --neg, --chart-1 …   (theme-switched)
component   --tile-bg, --table-row-hover, --tooltip-bg …                 (optional, aliases only)
```

Theme switching: `:root` = light; dark under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }` **and** `:root[data-theme="dark"] {…}` so the in-app toggle beats the OS in both directions. Set `color-scheme: light | dark` accordingly so native scrollbars/inputs match.

### 2.2 Surfaces

Light leans warm (hue 85, "paper"); dark leans cool (hue 255, "graphite"). Each step is a small, perceptually even L jump so elevation reads through tone, not shadow.

| Token | Light hex | Light OKLCH | Dark hex | Dark OKLCH | Use |
|---|---|---|---|---|---|
| `--surface-bg-deep` | `#f0ece5` | 0.945 0.011 85 | `#141619` | 0.200 0.007 255 | sidebar / well / sunken areas |
| `--surface-bg` | `#f5f2ec` | 0.962 0.009 85 | `#191c20` | 0.225 0.008 255 | page plane (gets grain) |
| `--surface-panel` | `#fbf9f5` | 0.982 0.006 85 | `#202327` | 0.255 0.009 255 | cards, tiles, table body, **chart surface** |
| `--surface-raised` | `#fefcf9` | 0.992 0.004 85 | `#282c30` | 0.290 0.010 255 | popovers, dropdowns, sticky headers |
| `--surface-overlay` | `#fefdfb` | 0.995 0.003 85 | `#2f3338` | 0.320 0.011 255 | dialogs, drawers, command palette |
| `--surface-hover` | `#f0ece5` | 0.945 0.011 85 | `#24282d` | 0.275 0.010 255 | row/item hover |
| `--surface-selected` | `#eae6dd` | 0.925 0.012 85 | `#2c3136` | 0.310 0.012 255 | selected row, active segment |
| `--scrim` | `rgb(36 33 27 / .28)` | — | `rgb(8 9 11 / .60)` | — | behind modal/drawer |

In dark mode elevation = *lighter* surface (Material/Radix convention); in light mode elevation = lighter surface **plus** shadow.

**Subtle texture (page plane only, never under figures):**

```css
--grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .5 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
body { background-color: var(--surface-bg); }
body::before { content:""; position:fixed; inset:0; pointer-events:none; z-index:0;
  background-image: var(--grain); opacity: var(--grain-opacity); mix-blend-mode: var(--grain-blend); }
/* light: --grain-opacity:.035; --grain-blend:multiply   dark: --grain-opacity:.05; --grain-blend:soft-light */
@media (prefers-reduced-transparency: reduce), print, (forced-colors: active) { body::before { display:none } }
```

Optional ambient gradient on the page plane (very low): light `radial-gradient(1200px 600px at 0% 0%, oklch(0.95 0.02 262 / .45), transparent 60%)`; dark `radial-gradient(1200px 600px at 0% 0%, oklch(0.30 0.03 262 / .35), transparent 60%)`. Cards stay flat (no gradient) so charts sit on a uniform surface.

Data-URI SVG is CSP-friendly (`img-src data:`); keep it in CSS, not a JS-generated canvas.

### 2.3 Text

| Token | Light | Contrast on panel / bg | Dark | Contrast on panel / bg | Use |
|---|---|---|---|---|---|
| `--text-1` | `#24211b` (0.25 0.012 85) | 15.3 / 14.4 | `#e8ebef` (0.94 0.006 255) | 13.2 / 14.3 | figures, headings, body |
| `--text-2` | `#56524b` (0.44 0.013 85) | 7.4 / 7.0 | `#b6bbc1` (0.79 0.010 255) | 8.2 / 8.9 | labels, secondary copy |
| `--text-3` | `#75716a` (0.55 0.012 85) | 4.6 / 4.3 | `#90969d` (0.67 0.012 255) | 5.3 / 5.7 | captions, axis ticks, meta (AA at ≥ 14 px on panel) |
| `--text-disabled` | `#928f88` (0.65 0.010 85) | 3.1 | `#646970` (0.52 0.012 255) | 2.9 | disabled only |
| `--text-on-accent` | `#ffffff` | — | `#10182a` | — | text on accent fill |

Dark text is off-white `#e8ebef`, not `#fff` — avoids halation on charcoal.

### 2.4 Borders & focus

| Token | Light | Dark | Use |
|---|---|---|---|
| `--border-subtle` | `#dedad2` | `#2d3135` | card hairlines, table row dividers |
| `--border` | `#cecac1` | `#393d43` | inputs, segmented controls |
| `--border-strong` | `#afaaa1` | `#51565c` | hover border, chart baseline |
| `--grid` (chart gridline) | `#e7e3db` | `#2a2e33` | chart gridlines (recessive) |
| `--focus-ring` | `#3e66b3` | `#759ee9` | 2 px ring + 2 px offset; 5.0:1 on light bg, 6.4:1 on dark bg |

Alpha alternative for borders on tinted panels: light `rgb(36 33 27 / .10)`, dark `rgb(232 235 239 / .09)`.

### 2.5 Accent (brand / interactive)

Muted indigo-blue, hue 262 — distinct from categorical blue (255) by chroma and use, and from the info colour by context (accent is interactive, info is status).

| Token | Light | Dark |
|---|---|---|
| `--accent` (fill, links, selected) | `#3e66b3` (0.52 0.13 262) — 5.3:1 on panel | `#759ee9` (0.70 0.12 262) — 5.9:1 on panel |
| `--accent-hover` | `#3057a3` (0.47 0.13 262) | `#8eb1f1` (0.76 0.10 262) |
| `--accent-subtle` (tinted bg) | `#e5efff` (0.95 0.025 262) | `#223251` (0.32 0.06 262) |
| `--accent-fg` (text on accent) | `#ffffff` | `#10182a` |

### 2.6 Semantic / status

Gain/loss hues were chosen for **deuteranopia** separation, not just "green vs red": positive leans blue-green (180), negative leans orange-red (35), and the light-mode text steps also differ in lightness.

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--pos` (text/icon) | `#007b6b` (0.52 0.10 180) — 4.9:1 panel | `#63d5be` (0.80 0.11 178) — 8.9:1 | gains, under-budget, on-track |
| `--pos-fill` (bars, chips) | `#0f9b89` (0.62 0.11 180) — 3.3:1 | `#2ebaa1` (0.71 0.12 178) — 6.5:1 | |
| `--pos-subtle` (bg) | `#def4ef` | `#14342e` | text on it ≥ 4.5:1 |
| `--neg` | `#b43818` (0.52 0.165 35) — 5.7:1 | `#ee8266` (0.72 0.14 35) — 6.0:1 | losses, over-budget, debt |
| `--neg-fill` | `#ce4d2d` (0.59 0.17 35) — 4.2:1 | `#d1583a` (0.61 0.16 35) — 3.9:1 | |
| `--neg-subtle` | `#ffe9e3` | `#43241c` | |
| `--warn` | `#9c640d` (0.55 0.115 70) — 4.7:1 | `#edbb64` (0.82 0.12 80) — 8.9:1 | stale data, near limit, estimates |
| `--warn-fill` | `#e9ab2b` (0.78 0.15 80) — fill only, pair with icon | `#dfa635` | |
| `--warn-subtle` | `#fdefd2` | `#3c2e14` | |
| `--info` | `#0f68a2` (0.50 0.12 245) — 5.7:1 | `#79b8ed` (0.76 0.10 245) — 7.4:1 | sync, tips, neutral notices |
| `--info-fill` | `#3e8cc9` | `#4b99d7` | |
| `--info-subtle` | `#e1f1ff` | `#1c3041` | |
| `--critical` | = `--neg` + filled icon | = `--neg` | errors, failed sync, security |

Measured pos↔neg separation (text steps): normal ΔE 24.9 / 24.9; protan 13.6 / 18.6; **deutan 11.3 / 11.6**; tritan 29.9 / 31.8 (light / dark). Fills: deutan 12.9 / 13.6.

Rules:
- Delta display: `▲ +2.4 %` / `▼ −1.1 %` (true minus U+2212), colour + glyph + sign. In tables an optional accounting style `(1,234.00)`.
- **CVD mode** (setting): pos → blue `#2d6fbe` (4.8:1) / dark `#69a1e8` (5.9:1), neg → orange `#b04d00` (5.1:1) / dark `#e98a4a` (6.2:1); deutan ΔE 25.7 light / 24.3 dark. Same token names, different values — components don't change.
- **"Good" is contextual**: a rising expense is bad. Delta components take `goodDirection: "up" | "down" | "neutral"`; colour derives from that, not from the sign.
- Debt/liabilities are not "negative" coloured by default — they're an identity (categorical slot or neutral). Only *changes* get pos/neg.

### 2.7 Categorical chart palette (identity)

Ten hues in a **fixed order**, each with its own light and dark step (dark steps are re-selected for the charcoal surface, not auto-inverted). Red and green are excluded so they never collide with gain/loss.

| Slot | Hue | Light hex | Light OKLCH | Dark hex | Dark OKLCH |
|---|---|---|---|---|---|
| 1 | blue | `#2d74ca` | 0.56 0.15 255 | `#4c8edf` | 0.64 0.14 255 |
| 2 | orange | `#e4762c` | 0.68 0.16 50 | `#d97230` | 0.66 0.15 50 |
| 3 | teal | `#059488` | 0.60 0.105 185 | `#079e92` | 0.63 0.11 185 |
| 4 | violet | `#6e4fc1` | 0.52 0.17 292 | `#846cd1` | 0.60 0.15 292 |
| 5 | clay | `#964a2f` | 0.50 0.11 40 | `#ad5f43` | 0.57 0.11 40 |
| 6 | sky | `#42acd2` | 0.70 0.11 225 | `#2286a7` | 0.58 0.10 225 |
| 7 | olive | `#778a2d` | 0.60 0.12 120 | `#778a2d` | 0.60 0.12 120 |
| 8 | pink | `#cd5a97` | 0.63 0.16 350 | `#d1649c` | 0.65 0.15 350 |
| 9 | gold | `#daa932` | 0.76 0.14 85 | `#b88c19` | 0.665 0.13 85 |
| 10 | sage | `#55a674` | 0.66 0.11 155 | `#318454` | 0.55 0.11 155 |
| — | "Other" / unassigned | `#95928b` | 0.66 0.01 85 | `#767b81` | 0.58 0.012 255 |

Validation (surface = `--surface-panel`; also re-checked against `--surface-bg`):

| Check | Light (`#fbf9f5`) | Dark (`#202327`) |
|---|---|---|
| Lightness band (L 0.43–0.77 light / 0.48–0.67 dark) | PASS | PASS |
| Chroma floor ≥ 0.10 | PASS | PASS |
| Worst adjacent CVD ΔE (target ≥ 8) | 9.7 (sage↔gold, protan) | 9.5 (sage↔gold, protan) |
| Worst adjacent normal-vision ΔE (floor ≥ 15) | 17.7 | 17.6 |
| Contrast ≥ 3:1 vs surface | WARN: orange 2.88, sky 2.48, gold 2.06, sage 2.82 | PASS (all ≥ 3:1) |
| All-pairs (scatter, small multiples) | first **3** slots pass (CVD ≥ 11.4) | first 3 pass (CVD ≥ 12.5) |

Consequences / rules:
- Order *is* the CVD mechanism: stacked areas, stacked bars, lines and donuts consume slots 1→n in order.
- Light-mode relief rule for slots 2/6/9/10: charts using them must have direct labels or legend + table view (every chart has a table view anyway — §3), and fills get the 2-px surface gap.
- Charts where every pair can touch (scatter, treemap neighbours, small-multiple legends): cap at 3 colours, fold the rest to "Other", or facet.
- More than 10 entities → top 9 + "Other"; never generate an 11th hue.
- **Assignment maps (persisted, user-editable):** persons take slots in household order (1 blue, 2 orange, 3 teal, 4 violet); accounts are coloured by *institution or account type* (not individual account) using the same slot order; top-level spending categories get a fixed map (e.g. Housing 1, Food 2, Transport 3, Utilities 6, Health 4, Leisure 8, Shopping 9, Travel 7, Education 10, Other 5/neutral); asset classes: Equity 1, Fixed income 3, Cash 6, Real estate 5, Crypto 4, Gold/commodities 9, Other neutral. Within a chart, if two maps collide (e.g. person vs category), the chart uses one dimension's map only.
- Text never wears the series colour — values/labels stay in `--text-1/2/3`, a swatch beside them carries identity.

### 2.8 Sequential ramp (magnitude) — blue, hue 255

| Step | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|---|
| Hex | `#e7f3ff` | `#cee3ff` | `#afd1fc` | `#8ebaf4` | `#69a1e8` | `#4988d5` | `#2d6fbe` | `#1b589e` | `#10427b` |
| OKLCH L/C | .96/.025 | .91/.045 | .85/.07 | .78/.095 | .70/.12 | .62/.135 | .54/.14 | .46/.13 | .38/.11 |

- Light theme: low → 100, high → 900. Dark theme: **reverse** the ramp (low → near-surface dark, high → bright) — use steps 900→200 so "more" is always "more contrast against the surface". For ordinal (discrete tiers) start at step 300 in light / end at 800 in dark so the first tier still clears ~2:1.
- A second simultaneous sequential context uses an orange one-hue ramp built the same way (hue 50).
- Calendar heatmap of spending = sequential (blue) for "amount"; of daily P&L = diverging.

### 2.9 Diverging ramp (polarity) — vermilion ↔ neutral ↔ teal

Aligned with gain/loss hues so a returns heatmap reads like the deltas everywhere else. 4 steps per arm + neutral mid (9-class).

| | −4 | −3 | −2 | −1 | 0 | +1 | +2 | +3 | +4 |
|---|---|---|---|---|---|---|---|---|---|
| Light | `#ba4022` | `#db684c` | `#ef9680` | `#f7c3b6` | `#eae8e3` | `#b2dbd2` | `#74c2b3` | `#29a492` | `#008471` |
| Dark | `#ea6d4e` | `#bf4f34` | `#8b3d29` | `#593026` | `#2c2e31` | `#1f453e` | `#09675a` | `#008c7a` | `#21af9b` |

Midpoint is grey (no hue). Equal step count both arms; domain symmetric around 0 (or around a meaningful reference such as inflation/target return). CVD mode swaps arms to orange ↔ blue.

### 2.10 Data-viz chrome

| Token | Light | Dark |
|---|---|---|
| `--chart-surface` | = panel `#fbf9f5` | = panel `#202327` |
| `--chart-grid` | `#e7e3db` (hairline, 1 px) | `#2a2e33` |
| `--chart-axis` / baseline | `#afaaa1` | `#51565c` |
| `--chart-tick-label` | `--text-3` | `--text-3` |
| `--chart-crosshair` | `--text-3` @ 60 % | `--text-3` @ 60 % |
| `--chart-tooltip-bg` | `--surface-overlay` + shadow-3 | `--surface-overlay` + border |
| `--chart-estimate` | series colour, dashed 4 4 | same |
| `--chart-band` (fan outer/inner) | slot colour @ 14 % / 28 % | @ 20 % / 36 % |
| `--chart-target` | `--text-2` dashed 2 3 | same |

Mark specs: 2 px lines, 1.5 px sparklines, ≥ 8 px markers only on hover/last point, bars with 4 px rounded data-end and square baseline end, 2 px surface-coloured gap between stacked segments/treemap cells, ≤ 4 direct labels per chart, no 3-D, no dual axes, no gradients inside bars (area fills may use a top-to-bottom 24 %→0 % alpha gradient of the series colour).
Texture/decal mode (setting + print + `forced-colors`): ECharts `aria.decal.show: true` with 45°/135° line decals.

### 2.11 Typography

**Primary: Inter Variable** (`@fontsource-variable/inter` 5.3.0, OFL). Why: best-in-class screen legibility at 12–14 px, true tabular figures (`tnum`), slashed zero (`zero`), alternate disambiguated 1/l/I (`cv05`/`ss02` family), `case`-sensitive forms, wide weight axis, huge Unicode coverage incl. ₹ (U+20B9). Alternatives considered: Geist (crisper but narrower glyph set, fewer numeric features), IBM Plex Sans (good, but heavier per-weight files and no variable axis in the common distribution).

**Mono: Geist Mono Variable** (`@fontsource-variable/geist-mono` 5.3.0) — or JetBrains Mono — *only* for account numbers, ISINs, transaction IDs, hashes, code. **Figures stay in Inter with `tabular-nums`**: a mono face is wider and noisier for financial columns; tabular Inter aligns perfectly and reads better.

```css
--font-sans: "Inter Variable", ui-sans-serif, system-ui, "Segoe UI", sans-serif;
--font-mono: "Geist Mono Variable", ui-monospace, "Cascadia Mono", monospace;
html { font-feature-settings: "cv11", "ss01"; }           /* single-storey a off by default; pick to taste */
.num, td.num, .axis { font-variant-numeric: tabular-nums slashed-zero; }
.hero-num { font-variant-numeric: tabular-nums; letter-spacing: -0.02em; font-weight: 600; }
```

Self-host via Fontsource (no Google Fonts request — privacy + CSP). Subset to latin + latin-ext + the ₹ glyph; preload the one woff2 used above the fold.

Type scale (density-first, 1.125–1.2 steps; px / line-height / weight):

| Token | Size | LH | Weight | Use |
|---|---|---|---|---|
| `--text-2xs` | 11 | 14 | 500 | badges, axis ticks (caps +0.04em) |
| `--text-xs` | 12 | 16 | 400/500 | captions, table meta, legend |
| `--text-sm` | 13 | 18 | 400/500 | **table body, compact UI (default)** |
| `--text-base` | 14 | 20 | 400 | body, inputs, comfortable tables |
| `--text-md` | 16 | 22 | 500 | card titles |
| `--text-lg` | 18 | 24 | 600 | section titles |
| `--text-xl` | 22 | 28 | 600 | page title |
| `--num-kpi` | 26 | 30 | 600 | KPI tile figure |
| `--num-hero` | 36 | 40 | 600 | net worth hero (clamp 28→40 px) |

### 2.12 Spacing, sizing, radii

- Base unit 4 px. Scale: 0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Card padding 16 (compact) / 20 (comfortable). Grid gutter 16 / 24. Table row 32 (compact) / 40 (comfortable). Control height 28 (sm) / 32 (md, default) / 36 (lg). Hit targets ≥ 24 × 24 (WCAG 2.2 AA), 44 on touch.
- Radii: `--radius-xs 4` (chips, bars data-end), `--radius-sm 6` (inputs, buttons), `--radius-md 10` (cards, tiles), `--radius-lg 14` (drawers, dialogs), `--radius-full` (pills, avatars). Nested radius = outer − padding.

### 2.13 Elevation / shadows

Light uses soft, warm-tinted, layered shadows; dark relies on surface lightness + a 1 px top highlight, with shadows only for overlays.

| Token | Light | Dark |
|---|---|---|
| `--shadow-1` (card) | `0 1px 0 rgb(36 33 27/.04), 0 1px 2px rgb(36 33 27/.06)` | `inset 0 1px 0 rgb(255 255 255/.04)` + border-subtle |
| `--shadow-2` (raised, sticky) | `0 2px 4px rgb(36 33 27/.05), 0 4px 12px rgb(36 33 27/.06)` | `inset 0 1px 0 rgb(255 255 255/.05), 0 4px 12px rgb(0 0 0/.30)` |
| `--shadow-3` (popover, tooltip) | `0 6px 16px rgb(36 33 27/.08), 0 12px 32px rgb(36 33 27/.08)` | `0 8px 24px rgb(0 0 0/.40), 0 0 0 1px rgb(255 255 255/.06)` |
| `--shadow-4` (dialog, drawer, palette) | `0 16px 48px rgb(36 33 27/.14)` | `0 16px 48px rgb(0 0 0/.55), 0 0 0 1px rgb(255 255 255/.07)` |

Z-index scale: base 0, sticky 10, sidebar 20, header 30, dropdown 40, drawer 50, dialog 60, palette 70, toast 80, tooltip 90.

### 2.14 Motion

- Durations: `--dur-1 100ms` (hover, press), `--dur-2 160ms` (popover, tooltip, tabs), `--dur-3 240ms` (drawer, dialog), `--dur-4 400ms` (chart transitions, number tweens).
- Easing: `--ease-out cubic-bezier(.2,.8,.2,1)` for entrances, `--ease-in-out cubic-bezier(.4,0,.2,1)` for moves, exits 20 % faster than entrances.
- Charts animate only on data change, not on every hover; no bouncing. KPI numbers may tween (≤ 400 ms) on filter change but never on first paint.
- `prefers-reduced-motion: reduce` → durations 0 except opacity fades ≤ 100 ms; ECharts `animation: false`.
- Use CSS transitions + Tailwind `tw-animate-css` / Base UI data-attributes; skip a JS animation library (Motion 14 is fine if ever needed, but not required).

### 2.15 Tailwind v4 wiring (sketch)

```css
@import "tailwindcss";
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

:root { color-scheme: light;
  --surface-bg:#f5f2ec; --surface-panel:#fbf9f5; --surface-raised:#fefcf9; --surface-overlay:#fefdfb;
  --text-1:#24211b; --text-2:#56524b; --text-3:#75716a;
  --border-subtle:#dedad2; --border:#cecac1; --accent:#3e66b3;
  --pos:#007b6b; --neg:#b43818; --warn:#9c640d; --info:#0f68a2;
  --chart-1:#2d74ca; --chart-2:#e4762c; --chart-3:#059488; --chart-4:#6e4fc1; --chart-5:#964a2f;
  --chart-6:#42acd2; --chart-7:#778a2d; --chart-8:#cd5a97; --chart-9:#daa932; --chart-10:#55a674; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark; /* dark values */ } }
:root[data-theme="dark"] { color-scheme: dark; --surface-bg:#191c20; --surface-panel:#202327; /* … */ }

@theme inline {
  --color-bg: var(--surface-bg); --color-panel: var(--surface-panel); --color-raised: var(--surface-raised);
  --color-fg: var(--text-1); --color-fg-2: var(--text-2); --color-fg-3: var(--text-3);
  --color-accent: var(--accent); --color-pos: var(--pos); --color-neg: var(--neg);
  --color-chart-1: var(--chart-1); /* … */
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, sans-serif;
}
```

shadcn/ui's token names (`--background`, `--card`, `--popover`, `--muted`, `--primary`, `--destructive`, `--chart-1…5`) should be **aliased** to these (e.g. `--card: var(--surface-panel)`), so generated components inherit the system unchanged. ECharts reads the same variables at theme-build time (`getComputedStyle(document.documentElement)`) and re-registers its theme on toggle.

---

## 3. Component inventory

Base: shadcn/ui components copied into `src/components/ui` (owned code, Base UI primitives), then finance-specific components in `src/components/fin`.

### 3.1 Primitives (from shadcn/Base UI)
Button (primary / secondary / ghost / destructive; sm/md), IconButton, Input, NumberInput (locale-aware, accepts `1.2L`, `3k`, pasted `₹12,34,567`), CurrencyInput (currency adornment), Select, Combobox (accounts/categories, multi-select with chips), Checkbox, Switch, RadioGroup, Slider (for projection assumptions), DatePicker + DateRangePicker (react-day-picker 10; presets: MTD, last month, QTD, YTD, FY (CA Jan–Dec, IN Apr–Mar), 1Y, 3Y, 5Y, Max), Tooltip, Popover, DropdownMenu, ContextMenu (table rows), Dialog, AlertDialog, **Drawer / Sheet** (right side, 480–640 px, for detail views: account, holding, transaction, rule), Tabs (underline style for page sections), **SegmentedControl** (pill group for period / currency / chart mode; ≤ 5 options), Toggle, Badge, Avatar (person initials in their slot colour), Separator, ScrollArea, Toast (sonner 2), Kbd, Breadcrumb, Accordion/Collapsible, Progress.

### 3.2 Finance components

| Component | Spec |
|---|---|
| **KPI / StatTile** | Label (text-2, xs, uppercase optional) · figure (`--num-kpi`, tabular) · `Delta` (▲/▼, value + %, period label "vs 30 d") · inline sparkline (80–120 × 28 px, 1.5 px line, last-point dot, no axes, optional min/max band) · as-of / stale badge · optional target bullet. Click → drawer/page. Variants: hero (net worth), standard, compact (row of 4–6). Never more than 6 tiles in a row. |
| **Delta** | Props: `value`, `pct`, `goodDirection`, `format`. Glyph + sign + colour; neutral grey when |Δ| < threshold. |
| **Money** | Single formatter component: currency, display currency conversion, compact (`₹1.2 Cr`, `C$1.2M`), privacy blur, tooltip with exact value + FX rate + as-of. |
| **Card** | Header (title, subtitle/as-of, actions: period segmented control, ⋯ menu with "View as table", "Export CSV/PNG", "Full screen"), body, optional footer (source, notes). Card is the unit of the dashboard grid. |
| **DataTable** | TanStack Table 9 + TanStack Virtual: sort (multi, shift-click), column filters, global filter, grouping with subtotal rows (by account, person, category, month), expandable rows, sticky header + sticky first column + sticky totals footer, column visibility/order/pinning/resizing persisted per table, row selection + bulk actions, density toggle, right-aligned tabular numbers with per-column precision, inline sparkline/bar cells, negative styling, virtualised rows for > 200 rows (transactions), keyboard navigation (roving focus), "copy cell/row", CSV/XLSX export of current view. |
| **FilterBar** | Global: person/household switch, date range + period presets, display currency (CAD/USD/INR), account multi-select, "include/exclude" (e.g. exclude home equity), compare-to (previous period / same period last year). Filters are URL search params (typed via TanStack Router) so views are shareable/bookmarkable; chips show active filters with clear-all. |
| **CommandPalette** | `Ctrl/⌘ K`: navigate pages, search accounts/holdings/transactions/categories, run actions (toggle privacy, theme, currency, refresh data, export), recent items. Built on shadcn `Command` (cmdk 1.1) or Base UI Combobox in a Dialog. |
| **PrivacyBlur** | Global toggle (`Shift+P`/palette, auto-on after idle). Monetary values get `filter: blur(6px)` + `user-select:none` and `aria-hidden` swap to "hidden"; percentages optionally stay visible. Charts: y-axis labels and tooltips blurred, shapes stay. Implemented in `Money` and the chart tooltip formatter, never per-page. Also blur on `visibilitychange` (tab switch) if enabled. |
| **Skeleton / Loading** | Shape-matching skeletons (tile figure bar, chart area silhouette, table rows) with a slow 1.6 s shimmer (off under reduced motion). Show cached (Dexie) data immediately with a "refreshing" spinner in card header rather than skeletons whenever cache exists. |
| **StaleBadge / AsOf** | "As of 12 Oct, 16:05" in text-3; turns into warn badge (clock icon + "Stale · 3 d") when beyond a per-source SLA (prices 1 d, Wealthica 2 d, manual sheets 31 d). Hover lists source + last sync + retry. |
| **EmptyState** | Icon (lucide, 32 px, text-3), one-line title, one-line explanation, one primary action (connect sheet, add account, clear filters). Separate variants: no data yet / filtered to nothing / error (with retry and detail). |
| **ErrorBoundary card** | Per-card isolation: one failed chart doesn't blank the page. |
| **Legend** | Swatch + label + value (+ %), click to isolate/toggle, hover to highlight; horizontal under chart for ≤ 6, side list with scroll for more. |
| **ChartTableToggle** | Every chart has "View as table" (accessibility + exact values). |
| **Calculators** | Form panel (react-hook-form + zod) left/top, result panel right with KPI tiles + chart; assumptions shown as editable chips. |

### 3.3 Chart catalogue (all in ECharts 6 unless noted)

| Chart | Where | Notes |
|---|---|---|
| Sparkline | KPI tiles, table cells | **Hand-rolled SVG** (polyline/path from data, ~40 lines) — cheaper than mounting ECharts 100× in a table. |
| Line / area | Net worth over time, account balances, FX | Time axis, crosshair tooltip, range presets, area gradient 24 %→0 %. Contributions vs growth as two series. Event markers (markLine/markPoint) for big transactions. |
| Stacked area | Net worth by asset class / account / person | Slot order fixed; toggle absolute ↔ 100 %; liabilities as a separate negative stack below zero in neutral/clay. |
| Treemap (primary allocation) | Allocation by class → holding | Two levels, breadcrumbs, labels with % ; colour = asset class (categorical), optional colour = return (diverging). |
| Sunburst | Allocation by person → account → class | Use sparingly; treemap is the default. |
| Donut | At most one per page, ≤ 6 slices | Centre label = total. Prefer horizontal 100 % bar. |
| Horizontal bar / 100 % bar | Category spend, allocation vs target | Sorted, direct labels, target tick. |
| Bullet chart | Budget vs actual, contribution room used, goal progress | Custom series or bar + markLine; qualitative bands in neutral steps. |
| Waterfall | Monthly cash flow: start → income → expenses by category → savings → end; net-worth change attribution (contributions / market / FX / debt paydown) | Stacked bar with transparent base; pos/neg fills; subtotal bars neutral. |
| Sankey | Income → accounts/budgets → spending categories → savings | ECharts `sankey`; nodes coloured by category map, links at 35 % alpha of source; cap ~25 nodes, fold small flows to "Other". |
| Calendar heatmap | Daily spending (sequential) / daily P&L (diverging) | ECharts `calendar` coordinate + `heatmap`; one year per row, weeks start Monday (configurable). |
| Matrix heatmap | Monthly returns (year × month), category × month spend | ECharts 6 `matrix` coordinate or cartesian heatmap; diverging ramp for returns. |
| Fan chart | Monte Carlo projection | Median line + P25–P75 and P10–P90 bands (stacked area with transparent base, band tokens), target line, real vs nominal toggle, "probability of success" KPI beside it. |
| Grouped/stacked column | Income vs expense per month, dividends per month | Max 2 groups side by side; otherwise small multiples. |
| Scatter | Risk vs return of holdings | ≤ 3 colours (all-pairs rule), size = weight. |
| Small multiples | Per-person or per-account trends | Shared y-scale unless explicitly "independent". |

Global chart behaviours: consistent tooltip component (date header, rows sorted by value, swatch + label + `Money`), crosshair for time series, keyboard focusable with `aria` description generated (ECharts `aria.enabled`), resize via `ResizeObserver`, theme from tokens, `renderer: 'canvas'` for big charts / `'svg'` for small and for print.

### 3.4 Print styles

- `@media print`: force light tokens, remove grain/gradients/shadows, hide sidebar/filter bar/actions, show a print header (household, filters, as-of, page x/y via `@page` margin boxes where supported), `break-inside: avoid` on cards, tables repeat `thead`, links show no URL.
- Charts: switch ECharts to SVG renderer before print (`beforeprint` event) for crisp vectors; enable decal textures.
- Privacy blur state is respected in print.
- PDF export = the same print stylesheet via `window.print()` → "Save as PDF" (zero dependencies, best fidelity). Only add a PDF library if unattended/scheduled PDF generation becomes a requirement.

---

## 4. Stack recommendation

Versions checked against the npm registry on 2026-10-13 (`npm view <pkg> version`). Pin exact versions, commit the lockfile, enable Dependabot/Renovate with a 7-day minimum release age.

| Concern | Pick | Version | Why / notes |
|---|---|---|---|
| Build | **Vite** | 8.3.4 | Rolldown-based, fast, static output for Cloudflare Pages. `@vitejs/plugin-react` 6.1.2. |
| UI runtime | **React** | 19.3.0 | Current stable; Actions, `use`, compiler-friendly. |
| Language | **TypeScript** | 7.0.2 | Go-native `tsc` (~10× faster checks), stable since mid-2026. Caveat: 7.0 lacks the stable programmatic API (promised for 7.1) — if a tool (e.g. typescript-eslint) needs it, keep `typescript@6` as a dev alias for that tool only, or lint with **oxlint** 1.88. |
| Routing | **TanStack Router** | 1.170.44 (+ `@tanstack/router-plugin` 1.168.45) | Fully typed path **and search params** (filters live in the URL, validated with zod via `@tanstack/zod-adapter`), loaders integrate with TanStack Query, file-based routes with code-splitting. React Router 8.4 is excellent but its strength (framework/SSR mode) isn't needed for a static SPA, and its search-param typing is weaker. |
| Server/remote state | **TanStack Query** | 5.104.2 | Caching, background refresh, stale-time per source, retries, persisting to IndexedDB via a Dexie-backed persister. |
| Client state | **Zustand** | 5.0.15 | Tiny; for UI prefs (theme, density, privacy, display currency, colour maps). Persist via Dexie, not localStorage, for anything sensitive. |
| Styling | **Tailwind CSS** | 4.3.3 (+ `@tailwindcss/vite` 4.3.3) | CSS-first config, `@theme inline` maps to our CSS variables, OKLCH-native. Helpers: `clsx` 2.1.1, `tailwind-merge` 3.7.0, `class-variance-authority` 0.7.1, `tw-animate-css` 1.4.0. |
| Components | **shadcn/ui on Base UI** | CLI `shadcn` 4.21.4, `@base-ui/react` 1.9.0 | shadcn switched its default to Base UI (July 2026); Base UI is stable, actively developed by the Radix/Floating UI/MUI team; Radix remains supported if a needed component is missing (`shadcn init -b radix`). Code is copied in → we own and audit it. |
| Charts (primary, only) | **Apache ECharts** | 6.1.0 | One engine covers *every* chart in §3.3 incl. sankey, treemap, sunburst, calendar heatmap, matrix, custom series (fan, bullet), large datasets (canvas), SVG renderer for print, built-in ARIA + **decal patterns** (CVD/print texture), runtime theming/dark mode. Apache-2.0, foundation-governed. Import from `echarts/core` with only the used charts/components (tree-shaken) and write a ~60-line `<EChart>` wrapper instead of `echarts-for-react`. |
| Sparklines | hand-rolled SVG | — | No dependency. |
| Charts — rejected | Recharts 3.10.1 | | Pleasant React API and shadcn "charts" use it, but no calendar heatmap, weak sankey/treemap/sunburst, SVG-only perf with dense series → would force a second library anyway. |
| | visx 4.0.0 | | Maximum control, but you build every chart (axes, tooltips, legends) — too much code for one owner. |
| | Nivo 0.99 | | Broad catalogue, but last publish May 2025 — maintenance risk. |
| | Observable Plot 0.6.17 | | Great for exploration, not interactive dashboards. Optional dev-only notebook use. |
| Tables | **TanStack Table** + **TanStack Virtual** | 9.3.1 / 3.14.19 | Headless: sorting, grouping, aggregation, pinning, column sizing, fully styled by us; virtual rows for transaction lists. (Check the v8→v9 migration notes when copying shadcn's data-table example.) |
| Forms | **react-hook-form** + **zod** | 7.90.0 / 4.6.7 (+ `@hookform/resolvers` 5.9.1) | zod schemas double as the validation for imported sheet rows and URL search params — one schema language. |
| Dates | **date-fns** + `@date-fns/tz` | 4.4.0 / 1.5.0 | Tree-shakable, immutable, fiscal-year helpers. **Temporal**: native in Chrome 144+/Firefox 139+, Safari still pending → don't depend on it yet; keep date logic behind a small `dates.ts` module so it can switch to Temporal later (polyfill `temporal-polyfill` 1.0.6 if needed). Store dates as ISO `YYYY-MM-DD` strings; money as integer minor units or decimal strings. |
| Numbers / currency | **`Intl.NumberFormat`** (built-in) | — | `new Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'})` → `₹12,34,567.00` (lakh grouping). Compact INR: write a tiny formatter for `L` / `Cr` (`₹1.25 Cr`, `₹4.8 L`) rather than relying on `notation:'compact'` output, which varies by engine. CAD/USD use `en-CA` with `currencyDisplay:'narrowSymbol'` plus explicit `C$`/`US$` disambiguation when mixed. Cache formatter instances. Use `formatToParts` for styling the currency symbol smaller. |
| Icons | **lucide-react** | 1.56.0 | Consistent 1.5–2 px stroke, tree-shakable, ISC. Use 16 px in UI, 14 in tables. |
| Toasts | sonner | 2.0.8 | Matches shadcn. |
| Date picker | react-day-picker | 10.0.2 | shadcn Calendar base. |
| Command palette | shadcn `Command` (cmdk 1.1.1) | 1.1.1 | Small, stable; or Base UI Combobox to avoid the dep. |
| CSV import | papaparse | 5.7.0 | Streaming, worker mode. |
| XLSX export | **write-excel-file** | 4.1.1 | Write-only, small, maintained, no parsing attack surface. If XLSX *import* is needed: **SheetJS CE from cdn.sheetjs.com (≥ 0.20.2)**, never `xlsx@0.18.5` from npm (unmaintained, CVE-2023-30533, CVE-2024-22363). ExcelJS 4.4.0 last published Dec 2024 → avoid. |
| PDF export | Browser print (§3.4) | — | Zero deps. If programmatic PDFs become necessary: `@react-pdf/renderer` 4.9.0 (lazy-loaded). |
| Chart image export | ECharts `getDataURL` / SVG renderer | — | Built in. |
| Local storage | **Dexie** | 4.4.6 (+ `dexie-react-hooks` 4.4.0 optional) | Typed IndexedDB, versioned schema migrations, bulk ops, live queries. Store only encrypted blobs for sensitive data (see crypto). |
| Crypto | **WebCrypto (`crypto.subtle`)** | built-in | AES-GCM 256 for cache-at-rest, PBKDF2-SHA-256 (≥ 600 k iterations) or Argon2id via WASM if a passphrase unlock is adopted; non-extractable `CryptoKey`s kept in memory / IndexedDB. No third-party crypto library. |
| PWA (optional) | vite-plugin-pwa | 2.0.0 | Only if offline install is wanted; careful with caching authenticated responses. |
| Testing | Vitest 5.0.4 + Playwright 1.64.0 | | Unit (formatters, finance math) + visual regression of both themes. |
| Fonts | `@fontsource-variable/inter`, `@fontsource-variable/geist-mono` | 5.3.0 / 5.3.0 | Self-hosted. |

Deliberately **not** added: a CSS-in-JS lib, Redux, Moment, lodash (use native), echarts-for-react, a JS animation library, Google Fonts CDN, Recharts alongside ECharts.

Security/CSP notes for this stack: ECharts, Tailwind and Base UI need no `eval` (`script-src 'self'` works); ECharts and floating UI set inline styles through the CSSOM (allowed under `style-src 'self'`), but shadcn/sonner can inject `<style>` tags — test with the final CSP and add a hash or `'unsafe-inline'` for styles only if necessary. Lazy-load ECharts per route to keep the first bundle small.

Approximate runtime dependency count: ~20 direct packages, all actively published within the last ~6 months except `class-variance-authority` (stable/finished) and `cmdk` (optional).

---

## 5. Layout blueprint

### 5.1 App shell

```
┌──────────────┬────────────────────────────────────────────────────────────┐
│  Sidebar     │ Top bar: [☰] Page title · Breadcrumb   [⌘K search] [● sync] │
│  (bg-deep)   │          [Person ▾] [Period: MTD|QTD|YTD|1Y|Max|⋯] [CAD▾]   │
│              │          [Compare ▾] [👁 privacy] [◐ theme] [avatar]         │
│  Logo        ├────────────────────────────────────────────────────────────┤
│  Overview    │ Active filter chips · As-of 12 Oct 16:05 · Stale: 1 source  │
│  Net worth   ├────────────────────────────────────────────────────────────┤
│  Accounts    │                                                            │
│  Holdings    │   Dashboard grid (cards on --surface-panel, page on        │
│  Allocation  │   --surface-bg + grain)                                    │
│  Cash flow   │                                                            │
│  Budgets     │                                         ┌───────────────┐  │
│  Debt        │                                         │ Detail drawer │  │
│  Room (TFSA…)│                                         │ (overlay,     │  │
│  Goals       │                                         │  480–640 px)  │  │
│  Projections │                                         └───────────────┘  │
│  Calculators │                                                            │
│  India       │                                                            │
│  ──────      │                                                            │
│  Settings    │                                                            │
└──────────────┴────────────────────────────────────────────────────────────┘
```

- Sidebar: 240 px expanded / 56 px icon rail (toggle `[`), grouped (Wealth · Cash flow · Planning · Tools), sticky; on mobile becomes a sheet.
- Top bar: 56 px, sticky, `--surface-bg` with 85 % opacity + backdrop blur 8 px and hairline bottom border when scrolled. The **global filter bar** sits in it (single row ≥ 1280 px; wraps into a second 44 px row below that; collapses into a "Filters" sheet on mobile).
- Page content max width 1600 px (centred, 24 px gutters); tables and full-width charts may opt into fluid width.
- Detail views open in a right drawer (keeps context); "Open as page" for deep links. Drawers are routes (search param `?drawer=account:123`) so back button closes them.

### 5.2 Breakpoints (Tailwind v4 defaults, with intent)

| Name | Min width | Layout |
|---|---|---|
| base | 0 | Phone: no sidebar (bottom nav of 4–5 primaries + "More"), 1-column cards, KPI tiles 2-up, tables become card lists or horizontally scroll with sticky first column, charts simplified (fewer ticks, legend below). Read-mostly. |
| `sm` | 640 | 2-up KPI, 1-col cards. |
| `md` | 768 | Tablet portrait: icon-rail sidebar, 2-col card grid, filters in a sheet. |
| `lg` | 1024 | Expanded sidebar optional, 2–3 col grid, filter bar two rows. |
| `xl` | 1280 | **Primary target** (laptop): expanded sidebar, 12-col grid, filter bar one row. |
| `2xl` | 1536 | Wide: 12-col with max-width 1600, optional right "insights" rail. |

Use **container queries** (`@container`) inside cards so a card adapts to its own width (e.g. KPI tile hides sparkline < 220 px; chart legend moves below < 480 px) independent of the page breakpoint.

### 5.3 Dashboard grid

- 12-column CSS grid, gap 16 (compact) / 24 (comfortable). Card spans: KPI tile 3 (4 per row) or 2 (6 per row); standard chart 6; wide chart 8 + side list 4; full-width 12 (tables, net-worth timeline).
- Row heights: KPI 112–128 px; chart cards 320 (standard) / 400 (hero) px; tables fill remaining viewport with internal virtual scroll.
- **Overview page order** (F-pattern; most important top-left):
  1. Hero row: Net worth (span 4–6, hero figure + 1Y sparkline + Δ) · Investable assets · Liabilities · Monthly savings rate · Cash runway.
  2. Net worth over time (span 8, stacked area by asset class) + Allocation treemap (span 4).
  3. Cash flow this month waterfall (span 6) + Spending by category bars vs budget (span 6).
  4. Alerts & to-dos (stale sources, budget overruns, contribution room deadlines) (span 4) + Upcoming bills/dividends (span 4) + Goal progress bullets (span 4).
  5. Recent transactions table (span 12, 10 rows, link to Cash flow).
- Layout is fixed and opinionated in v1 (no drag-and-drop); allow per-card show/hide and reorder later via a stored layout (Zustand + Dexie). If drag-and-drop is ever added, prefer `@dnd-kit` over grid-layout libraries.

---

## 6. Open decisions for the owner

1. Single-storey "a" and slashed zero on by default? (`cv11`, `zero`) — taste call; recommended: slashed zero in tables only.
2. Default density: compact (13 px tables, 32 px rows) recommended for desktop.
3. Gain/loss default: teal/vermilion (recommended) vs blue/orange CVD mode by default.
4. Fiscal year view default per country (CA calendar year vs IN Apr–Mar) when viewing INR accounts.

---

## Sources

- npm registry, `npm view <package> version` / `time.modified`, queried 2026-10-13 (all versions in §4).
- shadcn/ui switch to Base UI default: [OpenReplay — shadcn/ui Radix → Base UI switch](https://blog.openreplay.com/shadcn-ui-radix-base-ui-switch/), [PkgPulse — shadcn vs Base UI vs Radix 2026](https://www.pkgpulse.com/guides/shadcn-ui-vs-base-ui-vs-radix-components-2026), [shadcnblocks — Base UI support](https://www.shadcnblocks.com/changelog/new-feature-base-ui-support).
- Apache ECharts 6: [ECharts 6 new features (official handbook)](https://echarts.apache.org/handbook/en/basics/release-note/v6-feature), [ECharts changelog](https://echarts.apache.org/changelog.html).
- Chart library comparisons: [LogRocket — top React chart libraries](https://blog.logrocket.com/top-5-react-chart-libraries/), [Querio — React chart libraries 2026](https://querio.ai/articles/best-react-chart-libraries-data-visualization), [TanStack — chart library comparison](https://tanstack.com/charts/v0/docs/comparison.md).
- Routing: [TanStack Router comparison (official)](https://tanstack.com/router/v1/docs/framework/react/comparison), [Better Stack — TanStack Router vs React Router](https://betterstack.com/community/comparisons/tanstack-router-vs-react-router/), [PkgPulse — TanStack Router vs React Router 2026](https://www.pkgpulse.com/guides/tanstack-router-vs-react-router-v7-2026/raw.md).
- TypeScript 7 native compiler: [InfoQ — TypeScript 7 released](https://infoq.com/news/2026/08/typescript-7-released/), [DevClass — first stable Go release](https://www.devclass.com/development/2026/07/10/speedier-type-checks-in-typescript-70-as-first-stable-go-release-ships/5269206).
- SheetJS advisories: [CVE-2024-22363 (SheetJS)](https://cdn.sheetjs.com/advisories/CVE-2024-22363), [GitLab advisory CVE-2023-30533](https://advisories.gitlab.com/pkg/npm/xlsx/CVE-2023-30533/), [npm xlsx stale version issue](https://git.sheetjs.com/sheetjs/sheetjs/issues/3111).
- Temporal support: [W3Schools — Temporal.Duration browser support](https://www.w3schools.com/jsrEF/jsref_obj_temporal_duration.asp), [Temporal shipped in Chrome 144](https://mspk.substack.com/p/javascript-finally-fixed-dates-and).
- Colour validation method: Machado, Oliveira & Fernandes (2009) CVD simulation; OKLab ΔE; WCAG 2.2 contrast — computed locally with a palette validator (thresholds: CVD ΔE ≥ 8 target, normal-vision ΔE ≥ 15, contrast ≥ 3:1 for marks, 4.5:1 for text).
