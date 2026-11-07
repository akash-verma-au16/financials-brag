# Public demo

You can publish a copy of the app that anyone can open and click through, on fictional data only,
e.g. on GitHub Pages at `https://<your-github-user>.github.io/<demo-repo>/app/`. Keep it in a
separate public repo (`<your-github-user>/<demo-repo>`); never push your private repo there.

## What makes it safe

- `npm run build:demo` sets `VITE_DEMO_ONLY=1` (src/lib/demo-only.ts): the app is always in demo
  mode (src/data/demo.ts — generated accounts like "Maple Bank"), shows no sign-in, and every
  private-file call (statements, settings, history, uploads) stops with "not available in the
  public demo" before any request is made.
- `.env.local` is loaded by Vite in every mode, so vite.config.ts blanks `VITE_GOOGLE_CLIENT_ID`
  and `VITE_ALLOWED_EMAILS` in the demo build.
- Market data (fund look-through, prices, fees, macro) comes from a snapshot bundled with the build
  (`demo/market/`), recorded for the demo's own tickers only. News and search aren't included.
- Settings changed in the demo stay in that visitor's browser.

## Building and publishing your own demo

```bash
# 1. Only when the demo's tickers or market pages change: re-record the market snapshot.
#    Start `npm run dev`, browse the demo pages, put the /api/market/... request paths in
#    demo/market-urls.txt (one per line), then:
node tools/demo-market.ts

# 2. Build for the Pages path. On Git Bash, MSYS_NO_PATHCONV stops it rewriting the path.
MSYS_NO_PATHCONV=1 VITE_BASE=/<demo-repo>/app/ npm run build:demo

# 3. Check the build carries nothing private (should print nothing):
grep -rl -i -e "<your client id>" -e "<your email>" -e "ts.net" dist-demo

# 4. Copy dist-demo/ into <demo-repo>/site/app/ and dist-demo/index.html to site/404.html
#    (Pages only uses a 404.html at the site root; it's what makes deep links like
#    /app/holdings/XEQT.TO work), commit there, and update gh-pages:
#    git subtree split --prefix site -b gh-pages && git push -f origin gh-pages
```
