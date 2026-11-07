/**
 * The public demo build (`npm run build:demo`): always on demo data, no sign-in, no server.
 * Market data comes from a snapshot bundled with the build (demo/market/, see tools/demo-market.ts).
 */
export const DEMO_ONLY = import.meta.env.VITE_DEMO_ONLY === "1";

/** Why a server-only action is unavailable in the public demo. */
export const DEMO_ONLY_MESSAGE = "Not available in the public demo: it runs in your browser on fictional data, with nothing saved.";
