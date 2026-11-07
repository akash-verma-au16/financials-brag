import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Keeps the Financials server running: starts tools/server-main.ts, logs its output to
 * data/private/server.log (git-ignored), and starts it again a few seconds after it stops for
 * any reason. This is what the "Financials" scheduled task runs at boot.
 *
 *   node tools/server.ts        (npm run serve)
 */

const root = resolve(import.meta.dirname, "..");
const logDir = resolve(root, "data/private");
const logFile = resolve(logDir, "server.log");
mkdirSync(logDir, { recursive: true });
const log = (line: string) => {
  const text = `${new Date().toISOString()} ${line.trimEnd()}\n`;
  process.stdout.write(text);
  try {
    appendFileSync(logFile, text);
  } catch {
    /* keep running even if the log can't be written */
  }
};

let quickFailures = 0;

function start() {
  const started = Date.now();
  const child = spawn(process.execPath, [resolve(import.meta.dirname, "server-main.ts")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d: Buffer) => log(d.toString()));
  child.stderr.on("data", (d: Buffer) => log(`ERROR ${d.toString()}`));
  child.on("exit", (code, signal) => {
    // Back off if it keeps failing straight away (e.g. a broken build), up to a minute.
    quickFailures = Date.now() - started < 10_000 ? quickFailures + 1 : 0;
    const wait = Math.min(60_000, 3_000 * 2 ** Math.min(quickFailures, 5));
    log(`server stopped (${signal ?? `exit ${code}`}); restarting in ${wait / 1000}s`);
    setTimeout(start, wait);
  });
}

log("supervisor starting");
start();
