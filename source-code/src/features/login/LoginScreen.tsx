import { ShieldCheck } from "lucide-react";
import { GOOGLE_CLIENT_ID, signIn, useAuth } from "@/lib/google-auth";
import { useUi } from "@/lib/ui-store";
import { Button, Notice } from "@/components/ui";
import { SetupPage } from "@/features/setup/SetupPage";

/** Full-screen entry point. Nothing else in the app renders until you sign in (or choose demo data). */
export function LoginScreen() {
  const auth = useAuth();
  const setDemo = useUi((s) => s.setDemo);

  if (!GOOGLE_CLIENT_ID)
    return (
      <div className="min-h-dvh px-4 py-10">
        <SetupPage />
      </div>
    );

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-[14px] border border-line-subtle bg-panel p-7 shadow-pop">
        <div className="mb-6 flex items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-8" />
          <h1 className="text-[20px] font-semibold tracking-tight">Financials</h1>
        </div>
        <p className="mb-5 text-fg-2">Sign in with your Google account to open your dashboard.</p>

        {auth.status === "signed-out" && auth.error && (
          <div className="mb-4">
            <Notice tone="neg">{auth.error}</Notice>
          </div>
        )}

        <Button variant="primary" className="h-10 w-full text-[14px]" onClick={signIn} disabled={auth.status === "pending"}>
          {auth.status === "pending" ? "Waiting for Google…" : "Sign in with Google"}
        </Button>

        <div className="mt-6 flex items-start gap-2 text-[12px] text-fg-3">
          <ShieldCheck className="mt-px size-4 shrink-0 text-pos" aria-hidden />
          <p>
            Only approved accounts can sign in. Your data is read straight from Google in this browser, and the session
            ends when you close the tab.
          </p>
        </div>

        <button className="mt-5 text-[12px] font-medium text-accent hover:underline" onClick={() => setDemo(true)}>
          Explore with demo data instead
        </button>
      </div>
    </main>
  );
}
