/**
 * Saves a file into the repo through the dev server (tools/dev-save.ts).
 * Only available under `npm run dev`; production builds strip the callers via DEV checks.
 */

export const canSaveToRepo = import.meta.env.DEV;

export async function saveToRepo(name: string, content: string): Promise<string> {
  const res = await fetch("/__dev/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content }),
  });
  const body = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!res.ok || !body.path) throw new Error(body.error ?? `Save failed (${res.status})`);
  return body.path;
}
