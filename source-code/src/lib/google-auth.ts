import { useSyncExternalStore } from "react";

/**
 * Google sign-in via the official Google Identity Services (GIS) token model.
 *
 * Scopes:
 * - openid email: who signed in, checked against VITE_ALLOWED_EMAILS.
 * - spreadsheets.readonly (required): read the Wealthica exports and your keys sheet.
 * Nothing is written to Google: the app's own files live in your private repo.
 *
 * Session: the access token (≤ 1 hour) is kept in sessionStorage so a refresh doesn't sign
 * you out; it's gone when the tab closes. New tabs of the app get the session from an open
 * tab over a BroadcastChannel (same origin only). Signing out anywhere signs out everywhere.
 */

// Both come from .env.local: your own OAuth client ID and allowed emails (see SETUP.md).
export const GOOGLE_CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;
const ALLOWED_EMAILS = String(import.meta.env.VITE_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const READ_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const SCOPES = `openid email ${READ_SCOPE}`;
const GIS_SRC = "https://accounts.google.com/gsi/client";
const SESSION_KEY = "g-session";

interface Session {
  token: string;
  expiresAt: number;
  email: string;
}

export type AuthState =
  | { status: "signed-out"; error?: string; lastEmail?: string }
  | { status: "pending" }
  | ({ status: "signed-in" } & Session);

let state: AuthState = { status: "signed-out" };
const listeners = new Set<() => void>();
let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let gisLoading: Promise<void> | null = null;

function setState(next: AuthState) {
  state = next;
  listeners.forEach((l) => l());
}

// ── Session persistence & cross-tab sharing ────────────────────────────────

const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("financials-auth") : null;
type Msg = { type: "request" } | { type: "session"; session: Session } | { type: "signout" };

const valid = (s: Session | null | undefined): s is Session => !!s && typeof s.token === "string" && s.expiresAt > Date.now();

function saveSession(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable: session lasts for this page only */
  }
}

function loadSession(): Session | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
    return valid(s) ? s : null;
  } catch {
    return null;
  }
}

function adopt(s: Session) {
  saveSession(s);
  setState({ status: "signed-in", ...s });
}

const restored = loadSession();
if (restored) setState({ status: "signed-in", ...restored });
else if (channel) {
  // Ask other open tabs for their session; give up quickly.
  setState({ status: "pending" });
  channel.postMessage({ type: "request" } satisfies Msg);
  setTimeout(() => state.status === "pending" && setState({ status: "signed-out" }), 400);
}

channel?.addEventListener("message", (e: MessageEvent<Msg>) => {
  const msg = e.data;
  if (msg.type === "request" && state.status === "signed-in" && valid(state)) {
    const { token, expiresAt, email } = state;
    channel.postMessage({ type: "session", session: { token, expiresAt, email } } satisfies Msg);
  } else if (msg.type === "session" && valid(msg.session) && state.status !== "signed-in") {
    adopt(msg.session);
  } else if (msg.type === "signout" && state.status === "signed-in") {
    saveSession(null);
    setState({ status: "signed-out" });
  }
});

// ── Sign-in ─────────────────────────────────────────────────────────────────

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoading = null;
      reject(new Error("Could not load Google sign-in. Check your connection or content blockers."));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

async function fetchEmail(token: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${token}` }, referrerPolicy: "no-referrer" });
  if (!res.ok) throw new Error("Couldn't confirm which Google account signed in.");
  const body = (await res.json()) as { email?: string; email_verified?: boolean };
  if (!body.email || body.email_verified === false) throw new Error("Your Google account's email isn't verified.");
  return body.email.toLowerCase();
}

async function getTokenClient(): Promise<google.accounts.oauth2.TokenClient> {
  if (!GOOGLE_CLIENT_ID) throw new Error("VITE_GOOGLE_CLIENT_ID is not configured.");
  await loadGis();
  tokenClient ??= google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: (res) => {
      if (res.error || !res.access_token) {
        setState({ status: "signed-out", error: res.error_description || res.error || "Sign-in failed." });
        return;
      }
      if (!google.accounts.oauth2.hasGrantedAllScopes(res, READ_SCOPE)) {
        setState({ status: "signed-out", error: "Read access to Google Sheets was not granted." });
        return;
      }
      const token = res.access_token;
      fetchEmail(token)
        .then((email) => {
          if (ALLOWED_EMAILS.length && !ALLOWED_EMAILS.includes(email)) {
            google.accounts.oauth2.revoke(token, () => {});
            setState({ status: "signed-out", error: `${email} isn't allowed to use this app.` });
            return;
          }
          const session: Session = {
            token,
            expiresAt: Date.now() + (Number(res.expires_in) - 60) * 1000,
            email,
          };
          adopt(session);
          channel?.postMessage({ type: "session", session } satisfies Msg);
        })
        .catch((e: Error) => setState({ status: "signed-out", error: e.message }));
    },
    error_callback: (err) => {
      setState({ status: "signed-out", error: err.type === "popup_closed" ? undefined : err.message });
    },
  });
  return tokenClient;
}

export async function signIn() {
  const hint = state.status === "signed-out" ? state.lastEmail : undefined;
  setState({ status: "pending" });
  try {
    // With a hint and prior consent, Google returns without showing the consent screen again.
    (await getTokenClient()).requestAccessToken(hint ? { login_hint: hint, prompt: "" } : {});
  } catch (e) {
    setState({ status: "signed-out", error: (e as Error).message });
  }
}

export function signOut() {
  if (state.status === "signed-in") window.google?.accounts?.oauth2?.revoke(state.token, () => {});
  saveSession(null);
  channel?.postMessage({ type: "signout" } satisfies Msg);
  setState({ status: "signed-out" });
}

/** Called by the API layer when Google rejects the token (expired / revoked). */
export function expireSession(message = "Your session expired. Sign in again to continue.") {
  const lastEmail = state.status === "signed-in" ? state.email : undefined;
  saveSession(null);
  setState({ status: "signed-out", error: message, lastEmail });
}

export function getAccessToken(): string | null {
  if (state.status !== "signed-in") return null;
  if (Date.now() >= state.expiresAt) {
    expireSession();
    return null;
  }
  return state.token;
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
