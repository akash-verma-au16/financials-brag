import { copyFile, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { devSave } from "./tools/dev-save.ts";

// Strict Content-Security-Policy, injected into production builds only
// (Vite's dev server needs inline scripts and websockets for hot reload).
// Cloudflare Pages will also send these as real HTTP headers via public/_headers.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "connect-src 'self' https://sheets.googleapis.com https://www.googleapis.com/oauth2/ https://accounts.google.com/gsi/",
  "frame-src https://accounts.google.com/gsi/",
  "img-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function cspMeta(): Plugin {
  return {
    name: "csp-meta",
    apply: "build",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
    ],
  };
}

/**
 * Public demo build (`npm run build:demo` → dist-demo/): bundles the market-data snapshot from
 * demo/market/ and adds 404.html so deep links work on GitHub Pages.
 */
function demoAssets(): Plugin {
  let outDir = "";
  return {
    name: "demo-assets",
    apply: "build",
    configResolved: (c) => void (outDir = c.build.outDir),
    async generateBundle() {
      for (const f of (await readdir("demo/market").catch(() => [])).filter((n) => n.endsWith(".json")))
        this.emitFile({ type: "asset", fileName: `demo-market/${f}`, source: await readFile(join("demo/market", f)) });
    },
    closeBundle: () => copyFile(join(outDir, "index.html"), join(outDir, "404.html")),
  };
}

export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the site under /<repo>/<path>/: set VITE_BASE for those builds.
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), tailwindcss(), cspMeta(), devSave(), ...(mode === "demo" ? [demoAssets()] : [])],
  // The demo build must carry nothing of this setup: .env.local is loaded in every mode, so its
  // Google client ID and allowed emails are blanked here.
  define:
    mode === "demo"
      ? { "import.meta.env.VITE_DEMO_ONLY": '"1"', "import.meta.env.VITE_GOOGLE_CLIENT_ID": '""', "import.meta.env.VITE_ALLOWED_EMAILS": '""' }
      : {},
  resolve: { alias: { "@": "/src" } },
  // 5173 (Vite's default) can fall inside a Windows Hyper-V/WSL reserved port range, so use 3000.
  // strictPort: the Google OAuth origin must match exactly, so never fall back to another port
  // (add http://localhost:3000 as an authorised JavaScript origin, see SETUP.md).
  server: { port: 3000, strictPort: true },
  build: { sourcemap: false, outDir: mode === "demo" ? "dist-demo" : "dist" },
}));
