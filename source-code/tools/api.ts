import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join, resolve, sep } from "node:path";
import { consolidateLedgers, isLedgerFolder, isLedgerMaster, type LedgerFileResult } from "./ledger.ts";
import { marketRoute } from "./market.ts";
import { parseStatementsDir } from "./statements.ts";

/**
 * The app's private-file API, served from your machine (tools/server.ts) and by `npm run dev`.
 * Every request must carry the Google access token of an allowed account: it's checked with
 * Google (audience = this app's OAuth client, email on the allowlist, verified) before any file
 * is read or written. Paths are allowlisted; nothing outside them is reachable.
 *
 *   GET  /api/file?path=…   a repo file (limits YAML, settings, history, a statement)
 *   GET  /api/statements    every statement folder, parsed (cached until a file changes); exports
 *                           dropped into a yearly-ledger folder are merged into its masters first
 *   POST /api/files         { files: [{ path, base64 }], message } → written (and committed to git);
 *                           a CSV saved into a yearly-ledger folder is merged and removed → `merged`
 *   GET  /api/whoami        the signed-in email
 *   GET  /api/market/…      public market data (tools/market.ts)
 */

export interface ApiOptions {
  root: string;
  allowedEmails: string[];
  clientId: string;
  /**
   * Commit saved files to the local git repo (always-on server). Your statements and settings get
   * committed too: keep that repo private and never push it anywhere public (see SETUP.md).
   */
  autoCommit?: boolean;
  /** Serve /api/market/* without a sign-in (dev server only: lets demo mode show market data). */
  openMarket?: boolean;
}

export const STATEMENTS_DIR = "statements";
const READABLE = ["contribution-limits.yaml", "config/settings.json", "data/history.csv"];
const MAX_BODY = 60 * 1024 * 1024;

export function isReadable(path: string): boolean {
  if (!safe(path)) return false;
  return READABLE.includes(path) || (path.startsWith(`${STATEMENTS_DIR}/`) && /\.(csv|pdf)$/i.test(path));
}

/** Paths the app may write: settings, history, and statement files (+ account.yaml) under statements/. */
export function isWritable(path: string): boolean {
  if (!safe(path)) return false;
  if (path === "config/settings.json" || path === "data/history.csv") return true;
  return path.startsWith(`${STATEMENTS_DIR}/`) && /^[\w./ -]+$/.test(path) && /(\.csv|\.pdf|\/account\.yaml)$/i.test(path);
}

const isLedger = (root: string, folder: string) => isLedgerFolder(resolve(root, STATEMENTS_DIR, folder));

const safe = (p: string) => !!p && !p.includes("..") && !p.includes("\\") && !p.startsWith("/") && !/^[a-z]:/i.test(p);

// ── Google token check ──────────────────────────────────────────────────────

const verified = new Map<string, { email: string; until: number }>();

async function emailFor(req: IncomingMessage, opts: ApiOptions): Promise<string | null> {
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
  if (!token) return null;
  const id = createHash("sha256").update(token).digest("hex");
  const hit = verified.get(id);
  if (hit && hit.until > Date.now()) return hit.email;
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
  if (!res.ok) return null;
  const info = (await res.json()) as { aud?: string; azp?: string; email?: string; email_verified?: string | boolean; expires_in?: string };
  const email = info.email?.toLowerCase();
  const verifiedEmail = info.email_verified === true || info.email_verified === "true";
  if (!email || !verifiedEmail) return null;
  if (opts.clientId && info.aud !== opts.clientId && info.azp !== opts.clientId) return null;
  if (!opts.allowedEmails.includes(email)) return null;
  verified.set(id, { email, until: Date.now() + Math.min(Number(info.expires_in ?? 0), 3600) * 1000 });
  return email;
}

// ── Statements cache ────────────────────────────────────────────────────────

let cache: { sig: string; json: string } | null = null;

async function signature(dir: string): Promise<string> {
  const parts: string[] = [];
  const walk = async (d: string) => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else {
        const s = await stat(p);
        parts.push(`${p}|${s.size}|${s.mtimeMs}`);
      }
    }
  };
  await walk(dir);
  return createHash("sha256").update(parts.sort().join("\n")).digest("hex");
}

async function statementsJson(root: string, autoCommit?: boolean): Promise<string> {
  const dir = resolve(root, STATEMENTS_DIR);
  await mergeExports(root, autoCommit);
  const sig = await signature(dir);
  if (cache?.sig !== sig) cache = { sig, json: JSON.stringify(await parseStatementsDir(dir)) };
  return cache.json;
}

// ── Git ─────────────────────────────────────────────────────────────────────

function git(root: string, args: string[]): Promise<void> {
  return new Promise((ok, fail) => execFile("git", ["-C", root, ...args], (e) => (e ? fail(e) : ok())));
}

/** `all`: stage deletions too (paths are folders whose files may have been removed). */
async function commit(root: string, paths: string[], message: string, all = false) {
  try {
    await git(root, ["add", ...(all ? ["-A"] : []), "--", ...paths]);
    await git(root, ["commit", "-q", "-m", message, "--", ...paths]);
  } catch {
    /* nothing changed, or git unavailable: the files are saved either way */
  }
}

/** Merges exports sitting in yearly-ledger folders (all, or one folder) and commits the result. */
async function mergeExports(root: string, autoCommit?: boolean): Promise<LedgerFileResult[]> {
  const results = await consolidateLedgers(resolve(root, STATEMENTS_DIR));
  const done = results.filter((r) => r.changed.length);
  if (autoCommit && done.length) {
    const added = done.reduce((n, r) => n + r.years.reduce((m, y) => m + y.added, 0), 0);
    const folders = [...new Set(done.map((r) => `${STATEMENTS_DIR}/${r.folder}`))];
    await commit(root, folders, `Merge ${done.length} export${done.length > 1 ? "s" : ""} into yearly CSVs (+${added} transactions)`, true);
  }
  return results;
}

// ── Handler ─────────────────────────────────────────────────────────────────

function body(req: IncomingMessage): Promise<Buffer> {
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        fail(new Error("Too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks)));
    req.on("error", fail);
  });
}

/** Connect-style middleware for /api/*; calls next() for anything else. */
export function apiHandler(opts: ApiOptions) {
  const root = resolve(opts.root);
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (!url.pathname.startsWith("/api/")) return next();
    const send = (status: number, payload: string | Buffer | object, type = "application/json") => {
      res.statusCode = status;
      res.setHeader("Content-Type", type);
      res.setHeader("Cache-Control", "no-store");
      res.end(typeof payload === "string" || Buffer.isBuffer(payload) ? payload : JSON.stringify(payload));
    };
    try {
      if (opts.openMarket && (await marketRoute(root, url, send))) return;
      const email = await emailFor(req, opts);
      if (!email) return send(401, { error: "Sign in with an allowed Google account." });

      if (url.pathname === "/api/whoami" && req.method === "GET") return send(200, { email });

      if (url.pathname === "/api/file" && req.method === "GET") {
        const path = url.searchParams.get("path") ?? "";
        if (!isReadable(path)) return send(403, { error: "Not allowed" });
        const file = resolve(root, path);
        if (!file.startsWith(root + sep)) return send(403, { error: "Not allowed" });
        const data = await readFile(file).catch(() => null);
        if (!data) return send(404, { error: "Not found" });
        return send(200, data, file.endsWith(".pdf") ? "application/pdf" : "text/plain; charset=utf-8");
      }

      if (req.method === "GET" && (await marketRoute(root, url, send))) return;

      if (url.pathname === "/api/statements" && req.method === "GET") return send(200, await statementsJson(root, opts.autoCommit));

      if (url.pathname === "/api/files" && req.method === "POST") {
        const { files, message } = JSON.parse((await body(req)).toString("utf8")) as { files?: { path?: unknown; base64?: unknown }[]; message?: unknown };
        if (!Array.isArray(files) || !files.length) return send(400, { error: "files required" });
        for (const f of files)
          if (typeof f.path !== "string" || typeof f.base64 !== "string" || !isWritable(f.path)) return send(403, { error: `Not allowed: ${String(f.path)}` });
        const list = files as { path: string; base64: string }[];
        // CSVs saved into a yearly-ledger folder are exports: merged below, so they never linger.
        // One named like a master (2026.csv) is renamed first so it can't overwrite that master.
        const ledgerFolders = new Set<string>();
        for (const [i, f] of list.entries()) {
          const m = /^statements\/([^/]+)\/([^/]+\.csv)$/i.exec(f.path);
          if (!m || !(await isLedger(root, m[1]!))) continue;
          ledgerFolders.add(m[1]!);
          if (isLedgerMaster(m[2]!)) f.path = `${STATEMENTS_DIR}/${m[1]}/upload-${Date.now()}-${i}.csv`;
        }
        for (const f of list) {
          const file = resolve(root, f.path);
          if (!file.startsWith(root + sep)) return send(403, { error: "Not allowed" });
          await mkdir(dirname(file), { recursive: true });
          await writeFile(file, Buffer.from(f.base64, "base64"));
        }
        const merged: LedgerFileResult[] = [];
        for (const folder of ledgerFolders) merged.push(...(await consolidateLedgers(resolve(root, STATEMENTS_DIR), folder)));
        const gone = new Set(merged.flatMap((r) => r.changed.filter((p) => !/\/\d{4}\.csv$/.test(p))));
        const paths = list.map((f) => f.path).filter((p) => !gone.has(p));
        const msg = typeof message === "string" && message ? message.slice(0, 200) : "Save from the app";
        if (opts.autoCommit) {
          if (paths.length) await commit(root, paths, msg);
          if (ledgerFolders.size) await commit(root, [...ledgerFolders].map((f) => `${STATEMENTS_DIR}/${f}`), msg, true);
        }
        return send(200, { paths, merged });
      }

      send(404, { error: "Unknown endpoint" });
    } catch (e) {
      send(500, { error: (e as Error).message });
    }
  };
}

/** Reads KEY=value lines from .env.local / .env (no expansion, no quotes needed). */
export async function readEnvFile(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of [".env", ".env.local"]) {
    const text = await readFile(join(root, name), "utf8").catch(() => "");
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

export const emailList = (s: string | undefined) => (s ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
