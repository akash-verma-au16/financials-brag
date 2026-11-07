import { Fragment, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Microscope } from "lucide-react";
import { DataGate } from "@/components/DataGate";
import { Money, Pct, Stat } from "@/components/money";
import { Badge, Card, cx } from "@/components/ui";
import { ASSET_CLASS_LABEL, REGION_LABEL, holdings, type Holding } from "@/data/holdings";
import type { AssetClass, Dataset, Region } from "@/data/model";
import { useSettings } from "@/data/settings";
import { useProfiles } from "@/data/market";
import { formatNumber } from "@/lib/format";
import { useUi } from "@/lib/ui-store";

export function HoldingsPage() {
  return <DataGate>{(ds) => <Holdings ds={ds} />}</DataGate>;
}

function Holdings({ ds }: { ds: Dataset }) {
  const person = useUi((s) => s.person);
  const hs = holdings(ds, person);
  const links = useSettings((s) => s.marketLinks);
  const linkedNames = useProfiles(Object.values(links));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const total = hs.reduce((s, h) => s + h.marketValue, 0);
  const withCost = hs.filter((h) => h.bookValue !== null);
  const cost = withCost.reduce((s, h) => s + h.bookValue!, 0);
  const gain = withCost.reduce((s, h) => s + h.gain!, 0);

  if (!hs.length) return <Card title="Holdings">No positions found. Add your Wealthica Positions export on the Data page.</Card>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Market value" value={<Money value={total} />} sub={`${hs.length} holdings`} />
        <Stat
          label="Unrealised gain"
          value={<Money value={gain} signed tone />}
          sub={cost > 0 ? <><Pct value={gain / cost} tone /> on <Money value={cost} /> cost</> : undefined}
          hint="Only holdings with a book value in Wealthica"
        />
        <Stat label="Largest holding" value={<Pct value={hs[0]!.weight} />} sub={hs[0]!.instrument.symbol ?? hs[0]!.instrument.name} />
        <Stat
          label="Top 5 concentration"
          value={<Pct value={hs.slice(0, 5).reduce((s, h) => s + h.weight, 0)} />}
          sub="share of portfolio in 5 largest"
        />
      </div>

      <Card
        title="All holdings"
        actions={
          <>
            <span className="hidden text-[12px] text-fg-3 sm:inline">Click a name for market data and news · a classification to correct it</span>
            <Link to="/analysis" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
              <Microscope className="size-4" aria-hidden /> Analyse
            </Link>
          </>
        }
      >
        <div className="-mx-4 -my-4 overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-[13px]">
            <thead className="text-left text-[11px] uppercase tracking-wide text-fg-3">
              <tr>
                <th className="w-8" />
                <th className="py-2 pr-3 font-medium">Holding</th>
                <th className="px-3 py-2 font-medium">Classification</th>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 text-right font-medium">Quantity</th>
                <th className="px-3 py-2 text-right font-medium">Book value</th>
                <th className="px-3 py-2 text-right font-medium">Market value</th>
                <th className="px-3 py-2 text-right font-medium">Gain</th>
                <th className="px-4 py-2 text-right font-medium">Weight</th>
              </tr>
            </thead>
            <tbody>
              {hs.map((h) => {
                const k = h.instrument.key;
                const isOpen = open.has(k);
                return (
                  <Fragment key={k}>
                    <tr className="border-t border-line-subtle hover:bg-hover">
                      <td className="pl-3">
                        {h.lots.length > 1 && (
                          <button
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? "Hide" : "Show"} accounts holding ${h.instrument.name}`}
                            className="text-fg-3 hover:text-fg"
                            onClick={() => setOpen((s) => {
                              const n = new Set(s);
                              if (n.has(k)) n.delete(k);
                              else n.add(k);
                              return n;
                            })}
                          >
                            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </button>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <Link to="/holdings/$key" params={{ key: k }} className="font-medium hover:text-accent hover:underline">
                          {h.instrument.symbol ?? h.instrument.name}
                        </Link>
                        <div className="max-w-80 truncate text-[12px] text-fg-3" title={h.instrument.name}>
                          {h.instrument.symbol ? h.instrument.name : `${h.lots.length} account${h.lots.length > 1 ? "s" : ""}`}
                          {h.instrument.symbol && h.lots.length > 1 && ` · ${h.lots.length} accounts`}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Classification h={h} />
                      </td>
                      <td className="px-3 py-2">
                        <DataSource h={h} link={links[k] ?? null} name={links[k] && linkedNames.status === "ready" ? (linkedNames.data.get(links[k]!)?.name ?? null) : null} />
                      </td>
                      <td className="num px-3 py-2 text-right text-fg-2">{h.quantity !== null && h.instrument.vehicle !== "cash" ? formatNumber(h.quantity) : "—"}</td>
                      <td className="px-3 py-2 text-right text-fg-2">{h.bookValue !== null ? <Money value={h.bookValue} /> : "—"}</td>
                      <td className="px-3 py-2 text-right font-medium"><Money value={h.marketValue} /></td>
                      <td className="px-3 py-2 text-right">
                        {h.gain !== null ? (
                          <>
                            <Money value={h.gain} signed tone />
                            <div className="text-[11px]"><Pct value={h.gainPct!} tone /></div>
                          </>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right"><Pct value={h.weight} /></td>
                    </tr>
                    {isOpen &&
                      h.lots.map((l) => (
                        <tr key={l.accountKey} className="bg-bg-deep/50 text-[12px] text-fg-2">
                          <td />
                          <td className="py-1.5 pr-3 pl-3" colSpan={2}>{l.accountName}</td>
                          <td className="num px-3 py-1.5 text-right">{l.quantity !== null ? formatNumber(l.quantity) : "—"}</td>
                          <td className="px-3 py-1.5 text-right">{l.bookValue !== null ? <Money value={l.bookValue} /> : "—"}</td>
                          <td className="px-3 py-1.5 text-right"><Money value={l.marketValue} /></td>
                          <td className="px-3 py-1.5 text-right">
                            {l.bookValue ? <Money value={l.marketValue - l.bookValue} signed tone /> : "—"}
                          </td>
                          <td className="px-4 py-1.5 text-right">{h.marketValue ? <Pct value={l.marketValue / h.marketValue} /> : null}</td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const CLASS_TONE: Record<AssetClass, "accent" | "info" | "pos" | "warn" | "neutral"> = {
  equity: "accent", "fixed-income": "info", balanced: "pos", "real-estate": "warn", cash: "neutral", other: "neutral",
};

function Classification({ h }: { h: Holding }) {
  const [editing, setEditing] = useState(false);
  const override = useSettings((s) => s.instrumentOverrides[h.instrument.key]);
  const setOverride = useSettings((s) => s.setInstrumentOverride);
  const i = h.instrument;

  if (!editing)
    return (
      <button className="flex flex-wrap items-center gap-1 text-left" onClick={() => setEditing(true)} title="Change classification">
        <Badge tone={CLASS_TONE[i.assetClass]}>{ASSET_CLASS_LABEL[i.assetClass]}</Badge>
        {i.region !== "n/a" && <Badge>{REGION_LABEL[i.region]}</Badge>}
        {override && <span className="text-[11px] text-fg-3">edited</span>}
      </button>
    );

  const select = "h-7 rounded border border-line bg-raised px-1.5 text-[12px]";
  return (
    <div className="flex flex-wrap items-center gap-1">
      <select
        aria-label="Asset class"
        className={select}
        value={i.assetClass}
        onChange={(e) => setOverride(i.key, { ...override, assetClass: e.target.value as AssetClass })}
      >
        {Object.entries(ASSET_CLASS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <select
        aria-label="Region"
        className={select}
        value={i.region}
        onChange={(e) => setOverride(i.key, { ...override, region: e.target.value as Region })}
      >
        {Object.entries(REGION_LABEL).map(([v, l]) => <option key={v} value={v}>{v === "n/a" ? "None" : l}</option>)}
      </select>
      <button className={cx("text-[12px] font-medium text-accent hover:underline")} onClick={() => setEditing(false)}>Done</button>
      {override && (
        <button className="text-[12px] text-fg-3 hover:text-fg" onClick={() => { setOverride(i.key, null); setEditing(false); }}>
          Reset
        </button>
      )}
    </div>
  );
}

/** Where the holding's market data comes from: its own ticker, a linked fund, or nothing yet. */
function DataSource({ h, link, name }: { h: Holding; link: string | null; name: string | null }) {
  if (h.instrument.vehicle === "cash") return <span className="text-[12px] text-fg-3">—</span>;
  if (link)
    return (
      <span title={`Linked to ${name ?? link}: what it holds applies to this holding; its price and fee don't.`}>
        <Badge tone="info">Linked</Badge> <span className="inline-block max-w-48 truncate align-bottom text-[12px] text-fg-3">{name ?? link}</span>
      </span>
    );
  if (h.instrument.symbol) return <span className="text-[12px] text-fg-3">Own ticker</span>;
  return (
    <Link to="/holdings/$key" params={{ key: h.instrument.key }} title="No market data: open it to link a fund or fact sheet">
      <Badge tone="warn">Not linked</Badge>
    </Link>
  );
}
