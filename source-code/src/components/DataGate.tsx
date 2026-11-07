import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { signIn, useAuth } from "@/lib/google-auth";
import { useDataset } from "@/data/useDataset";
import type { Dataset } from "@/data/model";
import { Button, Card, Notice } from "./ui";

export function SignInCard() {
  const auth = useAuth();
  return (
    <div className="mx-auto max-w-xl">
      <Card title="Sign in to read your sheets">
        <div className="space-y-4">
          <p className="text-fg-2">
            The app reads your Google Sheets directly from this browser with read-only access. Nothing is sent anywhere
            else, and nothing is stored on a server.
          </p>
          {auth.status === "signed-out" && auth.error && <Notice tone="neg">{auth.error}</Notice>}
          <Button variant="primary" onClick={signIn} disabled={auth.status === "pending"}>
            {auth.status === "pending" ? "Waiting for Google…" : "Sign in with Google"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** Handles sign-in, empty, loading and error states; renders children once data is ready. */
export function DataGate({ children }: { children: (data: Dataset) => ReactNode }) {
  const state = useDataset();
  switch (state.status) {
    case "signed-out":
      return <SignInCard />;
    case "no-sources":
      return (
        <div className="mx-auto max-w-xl">
          <Card title="Connect your Wealthica sheets">
            <p className="mb-4 text-fg-2">
              Add your Wealthica Balances, Positions and Transactions exports on the Data page. The app recognises each
              one automatically.
            </p>
            <Link to="/data" className="font-medium text-accent hover:underline">
              Go to Data →
            </Link>
          </Card>
        </div>
      );
    case "loading":
      return <p className="text-fg-3">Reading your sheets…</p>;
    case "error":
      return (
        <Notice tone="neg">
          {state.error}{" "}
          <button className="font-medium underline" onClick={state.reload}>
            Retry
          </button>
        </Notice>
      );
    case "ready":
      return <>{children(state.data)}</>;
  }
}
