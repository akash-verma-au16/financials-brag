# Financials: brag + source code

## 👉 Want your own copy? Start here

1. **Fork this repo** to your GitHub (button at the top right), or clone it:
   `git clone https://github.com/akash-verma-au16/financials-brag.git`
2. **Open it with Claude** (Claude Code, or any AI coding assistant) and say:

   > **Help me set this up.**

   Claude will find [`source-code/CLAUDE.md`](source-code/CLAUDE.md). It checks what's missing,
   then walks you through the steps only you can do (Google sign-in, connecting your accounts,
   optional statements and hosting) one at a time.
3. Prefer doing it by hand? Read [`source-code/SETUP.md`](source-code/SETUP.md).

Before you connect anything, you can try it with fictional data: `cd source-code && npm ci && npm run dev`,
then choose "Explore with demo data" on the sign-in screen. Or open the
[live demo](https://akash-verma-au16.github.io/financials-brag/app/).

> **No one's real data is in this repo.** The app was shared with all of its author's personal data
> removed (no statements, balances, accounts, sheets or keys). Example values are fictional.
> Your own data stays on your machine and in your own Google Sheets. It's git-ignored, so it can't be
> pushed by accident. Keep it that way, and keep your fork's data out of any public repo.

---

## What's in this repo

| Folder | What it is | Do you need it? |
| --- | --- | --- |
| [`source-code/`](source-code/) | **The app.** A self-hosted personal finance dashboard: net worth, holdings, spending, cash flow, TFSA/RRSP/FHSA room, projections. React + TypeScript + Vite, with a small Node server. Reads your accounts from Google Sheets (via Wealthica) and your statements from local files. | **Yes. This is what you set up.** Work inside this folder. |
| [`site/`](site/) | The public web page published to GitHub Pages (`gh-pages` branch). `site/app/` is the demo build of the app (fictional data, no sign-in). | No. It's just the showcase. |
| [`brag-output/`](brag-output/) | The launch video and how it was made. | No. It's just the showcase. |

### `source-code/` at a glance
- [`CLAUDE.md`](source-code/CLAUDE.md): instructions for your AI assistant (setup order, ground rules, troubleshooting)
- [`SETUP.md`](source-code/SETUP.md): the full human setup guide, including what was removed and what you supply
- [`README.md`](source-code/README.md): what the app does
- `src/` the app · `tools/` server, statement parsers, market data · `docs/` hosting, demo and research notes
- Templates for your own files: `.env.example`, `config/settings.example.json`,
  `contribution-limits.example.yaml`, `docs/examples/statements/`

### What you'll need (your assistant will walk you through it)
- Node.js 24+ and git
- A Google Cloud project with an OAuth client (free), for sign-in and reading your sheets
- A Wealthica account syncing to Google Sheets (or sheets you maintain yourself)
- Optional: bank/card statements (CSV or PDF), CRA contribution room, Tailscale for access from your phone

---

## The showcase

A launch video and a playable demo, hosted on GitHub Pages from the `gh-pages` branch:

- https://akash-verma-au16.github.io/financials-brag/ : the video (made with [/brag](https://github.com/latent-spaces/brag))
- https://akash-verma-au16.github.io/financials-brag/app/ : the app itself, demo build (no sign-in, runs in the browser)

Everything in the showcase comes from the app's demo mode: every name and number is fictional.

- `brag-output/brag.mp4`: the video (poster: `brag.jpg`)
- `brag-output/share-copy.txt`: copy you can post as-is
- `brag-output/brag-plan.md`: angle and storyboard
- `brag-output/work/`: composition (`composition.html`), soundtrack generator (`music.mjs`), demo screenshots
- `site/`: the page published to `gh-pages`; `site/app/` is the app's demo build (`npm run build:demo` in `source-code/`)
