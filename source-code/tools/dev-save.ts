import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { apiHandler, emailList, readEnvFile } from "./api.ts";

/**
 * Dev-server-only endpoint that lets the app save files into the repo, e.g. the Data
 * Inspector's structure export, so it can be read from disk instead of pasted into chat.
 *
 * Guard rails:
 * - `apply: "serve"`: it does not exist in production builds or on the deployed site.
 * - Only same-origin requests from the app page are accepted (blocks other sites' requests).
 * - Writes only into SAVE_DIR (git-ignored), with a sanitised file name, .md/.json only.
 */

export const SAVE_ROUTE = "/__dev/save";
const SAVE_DIR = "data/private/inspector";
const MAX_BYTES = 2 * 1024 * 1024;

export function devSave(): Plugin {
  let root = process.cwd();
  return {
    name: "dev-save",
    apply: "serve",
    configResolved(config) {
      root = config.root;
    },
    async configureServer(server) {
      const env = await readEnvFile(root);
      server.middlewares.use(SAVE_ROUTE, (req, res) => {
        const reply = (status: number, body: object) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };

        if (req.method !== "POST") return reply(405, { error: "POST only" });
        const host = req.headers.host;
        const origin = req.headers.origin;
        if (!host || !origin || new URL(origin).host !== host) return reply(403, { error: "Cross-origin request refused" });
        if (!req.headers["content-type"]?.startsWith("application/json")) return reply(415, { error: "JSON only" });

        const chunks: Buffer[] = [];
        let size = 0;
        req.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) req.destroy();
          else chunks.push(c);
        });
        req.on("end", async () => {
          try {
            const { name, content } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { name?: unknown; content?: unknown };
            if (typeof name !== "string" || typeof content !== "string") return reply(400, { error: "name and content required" });
            const ext = name.endsWith(".json") ? ".json" : ".md";
            const base = name.replace(/\.(md|json)$/i, "").replace(/[^a-zA-Z0-9 _-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80);
            if (!base) return reply(400, { error: "Invalid file name" });

            const dir = resolve(root, SAVE_DIR);
            await mkdir(dir, { recursive: true });
            const file = resolve(dir, base + ext);
            await writeFile(file, content, "utf8");
            reply(200, { path: `${SAVE_DIR}/${base}${ext}` });
          } catch (e) {
            reply(500, { error: (e as Error).message });
          }
        });
      });

      // The same authenticated private-file API the always-on server uses (tools/api.ts).
      server.middlewares.use(apiHandler({ root, allowedEmails: emailList(env.VITE_ALLOWED_EMAILS), clientId: env.VITE_GOOGLE_CLIENT_ID ?? "", openMarket: true }));
    },
  };
}
