import type { LedgerFileResult, StatementBundle } from "@/data/statement-types";
import { DEMO_ONLY, DEMO_ONLY_MESSAGE } from "./demo-only";
import { getAccessToken } from "./google-auth";

/**
 * Private repo files (statements, limits, settings, history) come from the server on your
 * machine — tools/server.ts when always-on, the dev server under `npm run dev` — through
 * /api (tools/api.ts), which checks your Google sign-in on every request.
 */

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  if (DEMO_ONLY) throw new Error(DEMO_ONLY_MESSAGE);
  const token = getAccessToken();
  if (!token) throw new Error("Not signed in.");
  return fetch(path, { ...init, cache: "no-store", headers: { ...init.headers, Authorization: `Bearer ${token}` } });
}

async function errorOf(res: Response) {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? `Request failed (${res.status})`);
}

export async function getPrivateText(path: string): Promise<string | null> {
  const res = await api(`/api/file?path=${encodeURIComponent(path)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw await errorOf(res);
  return res.text();
}

export async function getStatements(): Promise<StatementBundle | null> {
  const res = await api("/api/statements");
  if (!res.ok) throw await errorOf(res);
  return (await res.json()) as StatementBundle;
}

export interface SaveFile {
  path: string;
  /** Text content (UTF-8)… */
  text?: string;
  /** …or binary content, base64. */
  base64?: string;
}

const toBase64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export interface SaveResult {
  /** Files now in the repo. */
  paths: string[];
  /** CSV exports saved into a yearly-ledger folder: merged into its <year>.csv files and removed. */
  merged: LedgerFileResult[];
}

/** Saves files into the repo folders in one go (the always-on server also commits them to git). */
export async function saveFiles(files: SaveFile[], message: string): Promise<SaveResult> {
  const res = await api("/api/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, files: files.map((f) => ({ path: f.path, base64: f.base64 ?? toBase64(f.text ?? "") })) }),
  });
  if (!res.ok) throw await errorOf(res);
  const out = (await res.json()) as Partial<SaveResult>;
  return { paths: out.paths ?? [], merged: out.merged ?? [] };
}
