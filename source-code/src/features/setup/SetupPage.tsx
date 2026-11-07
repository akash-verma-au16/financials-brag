import { Card } from "@/components/ui";

/** Shown until VITE_GOOGLE_CLIENT_ID is configured. */
export function SetupPage() {
  const origin = window.location.origin;
  return (
    <div className="mx-auto max-w-2xl">
      <Card title="Connect Google Sheets">
        <p className="mb-4 text-fg-2">
          The app needs a Google OAuth client ID before it can sign you in. One-time setup:
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-fg">
          <li>
            In <span className="font-medium">console.cloud.google.com</span>, create a project and enable the{" "}
            <span className="font-medium">Google Sheets API</span>.
          </li>
          <li>
            <span className="font-medium">Google Auth Platform → Get started</span>: audience <em>External</em>, add your
            Gmail under <em>Test users</em>.
          </li>
          <li>
            <span className="font-medium">Clients → Create client</span> → Web application. Authorized JavaScript origin:{" "}
            <code className="rounded bg-selected px-1 font-mono text-[12px]">{origin}</code>
          </li>
          <li>
            Put the client ID in <code className="rounded bg-selected px-1 font-mono text-[12px]">.env.local</code> as{" "}
            <code className="rounded bg-selected px-1 font-mono text-[12px]">VITE_GOOGLE_CLIENT_ID=…</code> and restart{" "}
            <code className="rounded bg-selected px-1 font-mono text-[12px]">npm run dev</code>.
          </li>
        </ol>
      </Card>
    </div>
  );
}
