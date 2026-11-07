import { useState, type ReactNode } from "react";
import { ExternalLink, Link2, Search } from "lucide-react";
import { Pct } from "@/components/money";
import { Button, Notice, cx } from "@/components/ui";
import { useSymbolSearch, type Loaded, type NewsItem } from "@/data/market";
import { useSettings } from "@/data/settings";
import { formatDate } from "@/lib/format";
import { useUi } from "@/lib/ui-store";

/** Small pieces shared by the holding and analysis pages. */

const nf = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat("en-CA", opts);
const compact = nf({ notation: "compact", maximumFractionDigits: 2 });

/** A market price in its listing currency (public data: shown in privacy mode too). */
export function formatPrice(v: number | null | undefined, currency: string | null | undefined) {
  if (v == null) return "—";
  try {
    return nf({ style: "currency", currency: currency ?? "CAD", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  } catch {
    return v.toFixed(2);
  }
}
export const formatBig = (v: number | null | undefined, currency?: string | null) => (v == null ? "—" : `${currency && currency !== "CAD" ? `${currency} ` : "$"}${compact.format(v)}`);
export const fmtPct = (v: number | null | undefined, digits = 1) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);
export const fmtNum = (v: number | null | undefined, digits = 2) => (v == null ? "—" : v.toFixed(digits));

/** Renders a market-data request's loading and error states. */
export function MarketGate<T>({ state, children, what = "market data" }: { state: Loaded<T>; children: (data: T) => ReactNode; what?: string }) {
  const demo = useUi((s) => s.demo);
  if (state.status === "loading") return <p className="py-6 text-center text-[13px] text-fg-3">Loading {what}…</p>;
  if (state.status === "error")
    return (
      <Notice tone="warn">
        Couldn’t load {what}: {state.error}
        {demo && " Market data needs sign-in on the hosted app (demo mode only gets it under npm run dev)."}
      </Notice>
    );
  return <>{children(state.data)}</>;
}

/** Label/value pairs in a responsive grid. */
export function Facts({ items }: { items: [label: string, value: ReactNode, hint?: string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:grid-cols-4">
      {items.map(([l, v, hint]) => (
        <div key={l} title={hint}>
          <dt className="text-[12px] text-fg-3">{l}</dt>
          <dd className="num text-[14px] font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Rows with a share bar (for weights, not money). */
export function ShareList({ rows, max }: { rows: { key: string; label: ReactNode; share: number; color?: string; right?: ReactNode }[]; max?: number }) {
  const top = max ?? Math.max(...rows.map((r) => r.share), 0.0001);
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-0.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 text-fg-2">{r.right ?? <Pct value={r.share} />}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-selected">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (r.share / top) * 100)}%`, background: r.color ?? "var(--accent)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Where a value sits between a low and a high (52-week range, analyst targets). */
export function RangeBar({ low, high, value, marks = [], format }: { low: number; high: number; value: number; marks?: { v: number; label: string }[]; format: (v: number) => string }) {
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - low) / (high - low || 1)) * 100))}%`;
  return (
    <div className="pt-5">
      <div className="relative h-2 rounded-full bg-selected">
        {marks.map((m) => (
          <div key={m.label} className="absolute -top-5 -translate-x-1/2 text-[11px] text-fg-3" style={{ left: pos(m.v) }}>
            {m.label}
            <div className="mx-auto mt-0.5 h-3 w-px bg-line-strong" />
          </div>
        ))}
        <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-accent" style={{ left: pos(value) }} title={format(value)} />
      </div>
      <div className="mt-1.5 flex justify-between text-[12px] text-fg-3">
        <span className="num">{format(low)}</span>
        <span className="num">{format(high)}</span>
      </div>
    </div>
  );
}

export function NewsList({ items }: { items: NewsItem[] }) {
  if (!items.length) return <p className="text-[13px] text-fg-3">No recent headlines found.</p>;
  return (
    <ul className="divide-y divide-line-subtle">
      {items.map((n) => (
        <li key={n.link} className="py-2">
          <a href={n.link} target="_blank" rel="noopener noreferrer" className="group flex items-start justify-between gap-3">
            <span className="text-[13px] font-medium group-hover:text-accent group-hover:underline">{n.title}</span>
            <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-fg-3" aria-hidden />
          </a>
          <div className="text-[12px] text-fg-3">
            {n.publisher ?? "News"} · {formatDate(n.at)}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Links a holding (typically a pension or mutual fund without a ticker) to a market symbol. */
export function SymbolLinker({ instrumentKey, name, current }: { instrumentKey: string; name: string; current: string | null }) {
  const link = useSettings((s) => s.marketLinks[instrumentKey]);
  const setLink = useSettings((s) => s.setMarketLink);
  const [open, setOpen] = useState(!current);
  const [q, setQ] = useState(name.replace(/\b(FUND|CLASS|SERIES|[A-Z]\d?)\b/gi, " ").replace(/\s+/g, " ").trim().slice(0, 40));
  const [typed, setTyped] = useState(q);
  const results = useSymbolSearch(q);

  if (!open)
    return (
      <button className="inline-flex items-center gap-1 text-[12px] text-fg-3 hover:text-fg" onClick={() => setOpen(true)}>
        <Link2 className="size-3.5" aria-hidden /> {link ? `Linked to ${link} · change` : "Use a different symbol for market data"}
      </button>
    );

  return (
    <div className="space-y-2 rounded-md border border-line-subtle bg-bg-deep/50 p-3">
      <p className="text-[13px]">
        {current ? "Pick the symbol to use for market data." : "No ticker for this holding. Link it to the fund's market code, or a similar ETF as a stand-in, to get prices, holdings and analysis."}{" "}
        For a Sun Life group plan fund, paste the link to its fact sheet (from the fund's page on mysunlife.ca).
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          // A Sun Life / Morningstar fact sheet link (…/FXYZ123ABC.html) links straight to that fund.
          const sunLife = /morningstar\.com\/Sun(?:%20| )Life\/.*?\/([A-Z0-9]{10})\.html/i.exec(typed.trim());
          if (sunLife) {
            setLink(instrumentKey, `SLF:${sunLife[1]!.toUpperCase()}`);
            setOpen(false);
            return;
          }
          setQ(typed);
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-3" aria-hidden />
          <input
            className="h-8 w-full rounded-md border border-line bg-raised pl-7 pr-2 text-[13px]"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Fund name, ticker, or Sun Life fact sheet link"
            aria-label="Search symbols"
          />
        </div>
        <Button type="submit">Search</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </form>
      {results.status === "ready" && (
        <ul className="max-h-60 divide-y divide-line-subtle overflow-y-auto text-[13px]">
          {results.data.results.map((r) => (
            <li key={r.symbol}>
              <button
                className={cx("flex w-full items-center justify-between gap-3 px-1 py-1.5 text-left hover:bg-hover", link === r.symbol && "bg-selected")}
                onClick={() => {
                  setLink(instrumentKey, r.symbol);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{r.symbol}</span> <span className="text-fg-2">{r.name}</span>
                </span>
                <span className="shrink-0 text-[11px] text-fg-3">
                  {r.type} {r.exchange && `· ${r.exchange}`}
                </span>
              </button>
            </li>
          ))}
          {!results.data.results.length && <li className="py-2 text-fg-3">Nothing found. Try fewer words.</li>}
        </ul>
      )}
      {results.status === "error" && <p className="text-[12px] text-neg">{results.error}</p>}
      {link && (
        <button className="text-[12px] text-fg-3 hover:text-fg" onClick={() => setLink(instrumentKey, null)}>
          Remove link ({link})
        </button>
      )}
    </div>
  );
}
