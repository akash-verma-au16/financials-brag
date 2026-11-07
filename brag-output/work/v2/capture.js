// Drives the public demo build frame by frame (fictional data only) and screenshots each frame.
// Run through Playwright's run_code with `filename`; RUN picks which scenes this call renders.
async (page) => {
  const RUN = [12, 13, 14, 3];
  const BASE = "http://localhost:18795/financials-brag/app";
  const OUT = "C:/Users/akash/Desktop/financials-brag/brag-output/work/v2/frames/";
  const BEAT = 0.625, FPS = 30;
  const frameAt = (beat) => Math.round(beat * BEAT * FPS);

  // [route, beats, chapter, line, scroll keys [sec, y | "heading text"], action]
  const SCENES = [
    null, // 0 = intro, rendered from composition.html
    ["/", 12, "Overview", "Net worth, cash flow and investments on one page.", [[0.6, 0], [6.6, 1180]]],
    ["/networth", 10, "Net worth", "Where it stands, how it moved, what it’s made of.", [[0.6, 0], [3.0, "What it’s made of"], [5.6, "What changed"]]],
    ["/spending", 14, "Spending", "Every month, every category, every merchant.", [[0, 0], [2.6, 0], [4.8, "Where it went"], [8.2, "Merchants"]], { click: "Last 3", at: 1.4 }],
    ["/spending/cards", 8, "Credit cards", "Each card on its own, recurring charges found for you.", [[0.4, 0], [4.6, "Recurring payments"]]],
    ["/spending/bank", 8, "Bank accounts", "e-Transfers, bills and big payments, month by month.", [[0.4, 0], [4.6, "e-Transfers, bills and big payments"]]],
    ["/cashflow", 10, "Cash flow", "An income statement for the household.", [[0.5, 0], [3.2, "Spending by category"], [5.8, "Transactions"]]],
    ["/holdings", 6, "Holdings", "Everything you hold, across every account.", [[0, 0]], { click: 'a[href*="/holdings/XEQT.TO"]', at: 3.3, css: true }],
    ["/holdings/XEQT.TO", 12, "Inside every fund", "One ETF, looked through down to the companies.", [[0.5, 0], [2.8, "What it costs you"], [5.0, "What you really own"], [7.2, "Where every dollar goes"]]],
    ["/analysis", 14, "Portfolio analysis", "Sectors, countries, fee tiers and overlap, across it all.", [[0.5, 0], [2.6, "Where every dollar goes"], [4.8, "How today’s mix would have done"], [7.0, "What it costs you"], [8.4, "What it costs you"]]],
    ["/allocation", 6, "Allocation", "By asset class, region, account and tax treatment.", [[0.4, 0], [3.4, "By account type"]]],
    ["/income", 8, "Investment income", "Every dividend and distribution, by month and by holding.", [[0.4, 0], [4.4, "By holding"]]],
    ["/room", 6, "Contribution room", "TFSA, RRSP and FHSA, counted from your own transactions.", [[0, 0]]],
    ["/projections", 10, "Projections", "Twenty-five years out, low case to high case.", [[0, 0], [2.4, 0], [5.2, "Combined: future dollars"]], { click: "Aggressive", at: 1.3 }],
    ["/calculators", 8, "Calculators", "Mortgages and what-ifs on rate and payment schedule.", [[0.4, 0], [4.4, "Balance and interest over time"]]],
  ];
  let startBeat = 9;
  const starts = SCENES.map((s) => { if (!s) return 0; const b = startBeat; startBeat += s[1]; return b; });

  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const clamp = (x) => Math.min(1, Math.max(0, x));

  const ctx = await page.context().browser().newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 });
  const p = await ctx.newPage();
  const done = [];
  for (const i of RUN) {
    const [route, beats, chapter, line, keys, action] = SCENES[i];
    await p.goto(BASE + route);
    await p.waitForTimeout(route.startsWith("/holdings/") || route === "/analysis" ? 6500 : 3500);
    // Overlay: caption, cursor, ripple, fade. Sits above the app; scrollbars hidden.
    await p.evaluate(({ chapter, line }) => {
      const css = document.createElement("style");
      css.textContent = `html{scrollbar-width:none}::-webkit-scrollbar{display:none}
        #bx-cap{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9999;padding:14px 26px;border-radius:16px;background:rgba(34,31,25,.9);color:#f3f1ec;font:600 26px/1.25 Inter,system-ui,sans-serif;letter-spacing:-.02em;box-shadow:0 16px 40px rgba(30,25,15,.28);white-space:nowrap;text-align:center}
        #bx-cap small{display:block;font:600 14px/1.4 Inter,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#9fb6e6;margin-bottom:2px}
        #bx-fade{position:fixed;inset:0;z-index:10000;background:#e9e4db;pointer-events:none}
        #bx-cur{position:fixed;left:0;top:0;width:30px;height:30px;z-index:9998;pointer-events:none;filter:drop-shadow(0 3px 4px rgba(0,0,0,.3));display:none}
        #bx-rip{position:fixed;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;border:3px solid #3a60aa;z-index:9997;pointer-events:none;display:none}`;
      document.head.appendChild(css);
      const cap = document.createElement("div");
      cap.id = "bx-cap";
      cap.innerHTML = `<small>${chapter}</small>${line}`;
      const fade = document.createElement("div");
      fade.id = "bx-fade";
      const cur = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      cur.id = "bx-cur";
      cur.setAttribute("viewBox", "0 0 24 24");
      cur.innerHTML = '<path d="M4 2l15 11-6.5 1.2 3.8 7.3-2.6 1.3-3.8-7.3L5 20z" fill="#221f19" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>';
      const rip = document.createElement("div");
      rip.id = "bx-rip";
      document.body.append(cap, fade, cur, rip);
    }, { chapter, line });

    // Resolve heading keys to scroll positions (heading ~90px below the sticky header).
    const ys = [];
    for (const [, y] of keys) {
      if (typeof y === "number") ys.push(y);
      else ys.push(await p.evaluate((text) => {
        const h = [...document.querySelectorAll("main h2, main h3")].find((e) => e.textContent.trim().startsWith(text));
        const max = document.documentElement.scrollHeight - innerHeight;
        return h ? Math.min(max, Math.max(0, h.getBoundingClientRect().top + scrollY - 90)) : 0;
      }, y));
    }
    const scrollAt = (t) => {
      if (t <= keys[0][0]) return ys[0];
      for (let k = 1; k < keys.length; k++) if (t <= keys[k][0]) return ys[k - 1] + (ys[k] - ys[k - 1]) * ease((t - keys[k - 1][0]) / (keys[k][0] - keys[k - 1][0]));
      return ys[ys.length - 1];
    };

    // Cursor path for a click: in from the lower right, lands on the target at `at`.
    let target = null;
    if (action) {
      const loc = action.css ? p.locator(action.click).first() : p.getByText(action.click, { exact: true }).first();
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await p.evaluate(() => scrollTo(0, 0));
      const box = await loc.boundingBox();
      if (box) target = { x: box.x + Math.min(box.width / 2, 60), y: box.y + box.height / 2, loc };
    }

    const len = beats * BEAT;
    const f0 = frameAt(starts[i]), f1 = frameAt(starts[i] + beats);
    let clicked = false;
    for (let f = f0; f < f1; f++) {
      const t = (f - f0) / FPS;
      if (target && !clicked && t >= action.at) {
        await target.loc.click();
        clicked = true;
        await p.waitForTimeout(action.css ? 6500 : 700);
        if (action.css) await p.evaluate(() => { const e = document.getElementById("bx-cur"); if (e) e.style.display = "none"; });
      }
      const y = scrollAt(t);
      const fadeIn = clamp(t / 0.3), fadeOut = clamp((len - t) / 0.25);
      const capK = clamp((t - 0.35) / 0.45);
      let cur = null, rip = null;
      if (target && !(action.css && clicked)) {
        const k = ease(clamp((t - (action.at - 1.1)) / 1.0));
        cur = { x: 1300 + (target.x - 1300) * k, y: 760 + (target.y - 760) * k, o: clamp((t - (action.at - 1.2)) / 0.25) * clamp((action.at + 1.2 - t) / 0.4) };
        const rt = t - action.at;
        if (rt >= 0 && rt < 0.5) rip = { x: target.x, y: target.y, k: rt / 0.5 };
      }
      await p.evaluate(({ y, fade, capK, cur, rip }) => {
        scrollTo(0, y);
        document.getElementById("bx-fade").style.opacity = String(1 - fade);
        const cap = document.getElementById("bx-cap");
        cap.style.opacity = String(capK * fade);
        cap.style.transform = `translateX(-50%) translateY(${(1 - capK) * 14}px)`;
        const c = document.getElementById("bx-cur");
        if (cur) { c.style.display = "block"; c.style.opacity = String(cur.o * fade); c.style.transform = `translate(${cur.x - 6}px, ${cur.y - 3}px)`; } else c.style.display = "none";
        const r = document.getElementById("bx-rip");
        if (rip) { r.style.display = "block"; r.style.left = rip.x + "px"; r.style.top = rip.y + "px"; r.style.opacity = String(1 - rip.k); r.style.transform = `scale(${0.3 + 1.1 * rip.k})`; } else r.style.display = "none";
      }, { y, fade: fadeIn * fadeOut, capK, cur, rip });
      await p.screenshot({ path: OUT + "f" + String(f).padStart(4, "0") + ".jpg", type: "jpeg", quality: 90 });
    }
    done.push(`${i}:${route} frames ${f0}-${f1 - 1}`);
  }
  await ctx.close();
  return { done, totalBeats: startBeat + 9 };
}
