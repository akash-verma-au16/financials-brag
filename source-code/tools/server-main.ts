import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { apiHandler, emailList, readEnvFile } from "./api.ts";

/**
 * The always-on server: serves the built app (dist/) and the private-file API (tools/api.ts)
 * from your machine. It listens on 127.0.0.1 only; Tailscale Funnel/Serve publishes it as
 * https://<machine>.<tailnet>.ts.net. Started at boot by the scheduled task from
 * tools/install-service.ps1. Needs VITE_ALLOWED_EMAILS and VITE_GOOGLE_CLIENT_ID in .env.local (see SETUP.md).
 *
 *   node tools/server.ts          (PORT, default 18787 — outside Windows' reservable 1024–15000 range)
 */

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const env = { ...(await readEnvFile(root)), ...process.env } as Record<string, string | undefined>;
const port = Number(env.PORT ?? 18787);
const allowedEmails = emailList(env.VITE_ALLOWED_EMAILS);
if (!allowedEmails.length) throw new Error("Set VITE_ALLOWED_EMAILS in .env.local: nobody could sign in otherwise.");

const api = apiHandler({ root, allowedEmails, clientId: env.VITE_GOOGLE_CLIENT_ID ?? "", autoCommit: true });

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000",
  // GIS sign-in popups need to talk back to this page.
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
};

const server = createServer((req, res) => {
  for (const [k, v] of Object.entries(HEADERS)) res.setHeader(k, v);
  void api(req, res, async () => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      return res.end();
    }
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    let file = resolve(dist, `.${path}`);
    if (file !== dist && !file.startsWith(dist + sep)) {
      res.statusCode = 403;
      return res.end();
    }
    const isFile = await stat(file).then((s) => s.isFile()).catch(() => false);
    // App routes (/spending, /upload…) all load index.html.
    if (!isFile) file = resolve(dist, "index.html");
    try {
      const data = await readFile(file);
      res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
      res.setHeader("Cache-Control", file.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache");
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      res.statusCode = 503;
      res.end("The app isn't built yet: run npm run build.");
    }
  });
});

server.listen(port, "127.0.0.1", () => console.log(`Financials on http://127.0.0.1:${port} (allowed: ${allowedEmails.length} account(s))`));
