import { useEffect, useMemo } from "react";
import { useSearch } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { DataGate } from "@/components/DataGate";
import { Money, Pct, chartColor } from "@/components/money";
import { ProjectionChart } from "@/components/ProjectionChart";
import { Button, Card, Segmented, cx } from "@/components/ui";
import { accountTypeLabel, shortInstitution } from "@/data/build";
import type { Account, Dataset } from "@/data/model";
import {
  PRESETS, RETIREMENT_TYPES, defaultGroups, runProjections, sumProjections, useProjections, type GroupProjection, type Preset, type ProjGroup, type Rates,
} from "@/data/projections";
import { scopeAccounts } from "@/data/select";
import { useSettings } from "@/data/settings";
import { formatMoney } from "@/lib/format";
import { useUi } from "@/lib/ui-store";

export function ProjectionsPage() {
  return <DataGate>{(ds) => <Projections ds={ds} />}</DataGate>;
}

// ── Small inputs ──────────────────────────────────────────────────────────────

const inputCls = "h-8 w-full rounded-md border border-line bg-raised px-2 text-[13px] num hover:border-line-strong";

function PctInput({ value, onChange, label, step = 0.25 }: { value: number; onChange: (v: number) => void; label: string; step?: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-fg-3">{label}</span>
      <div className="relative">
        <input type="number" step={step} value={Number((value * 100).toFixed(2))} onChange={(e) => onChange(Number(e.target.value) / 100)} className={cx(inputCls, "pr-6")} aria-label={label} />
        <span className="pointer-events-none absolute right-2 top-1.5 text-fg-3">%</span>
      </div>
    </label>
  );
}

function NumInput({ value, onChange, label, prefix, placeholder, step = 100 }: { value: number | undefined; onChange: (v: number | undefined) => void; label: string; prefix?: string; placeholder?: string; step?: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-fg-3">{label}</span>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-2 top-1.5 text-fg-3">{prefix}</span>}
        <input
          type="number"
          step={step}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          className={cx(inputCls, prefix && "pl-5")}
          aria-label={label}
        />
      </div>
    </label>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const GROUP_COLOR: Record<string, string> = { tfsa: "var(--chart-1)", retirement: "var(--chart-4)", fhsa: "var(--chart-3)" };
const colorOf = (g: ProjGroup, i: number) => GROUP_COLOR[g.id] ?? chartColor(i + 4);

function Projections({ ds }: { ds: Dataset }) {
  const st = useProjections();
  const birthYear = useSettings((s) => s.birthYear);
  const setBirthYear = useSettings((s) => s.setBirthYear);
  const person = useUi((s) => s.person);
  const { focus } = useSearch({ from: "/projections" });
  const accounts = scopeAccounts(ds, person);
  const valueMap = useMemo(() => new Map(accounts.map((a) => [a.key, a.value])), [accounts]);
  const investable = ds.accounts.filter((a) => a.bucket === "investments" || a.bucket === "retirement");

  // First visit: create the TFSA / RRSP + pensions / FHSA groups from your accounts.
  useEffect(() => {
    if (!st.groups.length) st.set({ groups: defaultGroups(ds.accounts) });
  }, [st.groups.length, ds.accounts]);

  // Deep link: /projections?focus=tfsa shows just that group.
  useEffect(() => {
    if (focus && st.groups.some((g) => g.id === focus)) st.set({ visible: [focus] });
    else if (focus === "registered") st.set({ visible: ["tfsa", "retirement", "fhsa"] });
  }, [focus, st.groups.length]);

  // Lifetime contributions so far (for caps like the FHSA's $40,000).
  const contributedSoFar = (g: ProjGroup) =>
    ds.transactions
      .filter((t) => g.accountKeys.includes(t.accountKey) && (t.kind === "contribution" || (t.kind === "transfer" && t.amount > 0)))
      .reduce((s, t) => s + t.amount, 0);

  const projections = runProjections(st.groups, (k) => valueMap.get(k) ?? 0, st, contributedSoFar);
  const byId = new Map(projections.map((p) => [p.id, p]));
  let shownGroups = st.groups.filter((g) => st.visible.includes(g.id));
  // FHSA rolled into retirement: show one combined line instead of two.
  let lines: (GroupProjection & { color: string })[] = shownGroups.map((g, i) => ({ ...byId.get(g.id)!, color: colorOf(g, i) }));
  if (st.fhsaIntoRetirement && st.visible.includes("retirement") && st.visible.includes("fhsa")) {
    const combined = sumProjections([byId.get("retirement")!, byId.get("fhsa")!], "retirement", "RRSP + pensions + FHSA");
    lines = lines.filter((l) => l.id !== "fhsa").map((l) => (l.id === "retirement" ? { ...combined, color: l.color } : l));
    shownGroups = shownGroups.filter((g) => g.id !== "fhsa");
  }
  const total = lines.length > 1 ? sumProjections(lines, "total", "Combined") : lines[0];
  const startYear = new Date().getFullYear();
  const ageAt = birthYear ? (i: number) => startYear + i - birthYear : undefined;

  const setRates = (r: Partial<Rates>) => st.set({ rates: { ...st.rates, ...r }, preset: "custom" });
  const toggleVisible = (id: string) => st.set({ visible: st.visible.includes(id) ? st.visible.filter((v) => v !== id) : [...st.visible, id] });

  return (
    <div className="space-y-5">
      <Card title="Assumptions">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className="mb-1 block text-[12px] text-fg-3">Return scenario</span>
              <Segmented<Preset>
                label="Return scenario"
                value={st.preset}
                onChange={(p) => (p === "custom" ? st.set({ preset: p }) : st.set({ preset: p, rates: PRESETS[p].rates }))}
                options={[...Object.entries(PRESETS).map(([k, v]) => ({ value: k as Preset, label: v.label, title: v.hint })), { value: "custom" as Preset, label: "Custom" }]}
              />
            </div>
            <div className="grid w-full grid-cols-3 gap-3 sm:w-auto sm:grid-cols-[repeat(3,7rem)]">
              <PctInput label="Low" value={st.rates.low} onChange={(v) => setRates({ low: v })} />
              <PctInput label="Expected" value={st.rates.mid} onChange={(v) => setRates({ mid: v })} />
              <PctInput label="High" value={st.rates.high} onChange={(v) => setRates({ high: v })} />
            </div>
            <div className="w-28"><PctInput label="Inflation" value={st.inflation} onChange={(v) => st.set({ inflation: v })} /></div>
            <div className="w-28">
              <NumInput label="Birth year (for age)" value={birthYear ?? undefined} onChange={(v) => setBirthYear(v ?? null)} step={1} placeholder="optional" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <label className="flex min-w-72 flex-1 items-center gap-3">
              <span className="whitespace-nowrap text-[12px] text-fg-3">Years</span>
              <input type="range" min={1} max={50} value={st.years} onChange={(e) => st.set({ years: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" aria-label="Years to project" />
              <span className="num w-20 text-right font-semibold">{st.years} yrs → {startYear + st.years}</span>
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={st.real} onChange={(e) => st.set({ real: e.target.checked })} className="accent-[var(--accent)]" />
              Show in today’s dollars (inflation-adjusted)
            </label>
            <label className="flex items-center gap-2 text-[13px]" title="FHSA money not used for a home can be transferred to an RRSP tax-free">
              <input type="checkbox" checked={st.fhsaIntoRetirement} onChange={(e) => st.set({ fhsaIntoRetirement: e.target.checked })} className="accent-[var(--accent)]" />
              Roll FHSA into RRSP (one retirement line)
            </label>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-fg-3">Show:</span>
        {st.groups.map((g, i) => {
          const on = st.visible.includes(g.id);
          return (
            <button
              key={g.id}
              onClick={() => toggleVisible(g.id)}
              onDoubleClick={() => st.set({ visible: [g.id] })}
              aria-pressed={on}
              title="Click to toggle, double-click to show only this"
              className={cx("flex h-8 items-center gap-2 rounded-full border px-3 text-[12px]", on ? "border-accent bg-accent-subtle" : "border-line text-fg-3 line-through")}
            >
              <span className="size-2.5 rounded-full" style={{ background: colorOf(g, i) }} /> {g.name}
            </button>
          );
        })}
        <Button variant="ghost" onClick={() => st.set({ visible: st.groups.map((g) => g.id) })}>All</Button>
      </div>

      <Card title={total ? `${total.name}: ${st.real ? "today’s dollars" : "future dollars"}` : "Projection"}>
        {lines.length ? (
          <>
            <ProjectionChart
              startYear={startYear}
              lines={lines.length > 1 ? lines.map((l) => ({ key: l.id, label: l.name, values: l.mid, color: l.color })) : []}
              total={total ? { key: "total", label: lines.length > 1 ? "Combined (expected)" : `${total.name} (expected)`, values: total.mid, color: lines.length > 1 ? "var(--text-1)" : lines[0]!.color } : undefined}
              band={total ? { low: total.low, high: total.high } : undefined}
              ageAt={ageAt}
            />
            {total && <Summary p={total} years={st.years} />}
          </>
        ) : (
          <p className="text-fg-3">Pick a group above to project.</p>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        {st.groups.map((g, i) => (
          <GroupCard key={g.id} g={g} color={colorOf(g, i)} accounts={investable} valueOf={(k) => valueMap.get(k) ?? 0} p={byId.get(g.id)!} years={st.years} soFar={contributedSoFar(g)} />
        ))}
        <button
          onClick={() =>
            st.addGroup({ id: `g${Date.now().toString(36)}`, name: "Custom group", kind: "custom", accountKeys: [], annualContribution: 0, contributionGrowth: 0, rates: null })
          }
          className="flex min-h-40 items-center justify-center gap-2 rounded-[10px] border border-dashed border-line text-fg-3 hover:border-line-strong hover:text-fg"
        >
          <Plus className="size-4" /> Add a custom group
        </button>
      </div>

      {lines.length > 0 && <ProjectionTable lines={lines} total={lines.length > 1 ? total : undefined} interval={st.interval} setInterval={(v) => st.set({ interval: v })} ageAt={ageAt} startYear={startYear} />}
    </div>
  );
}

function Summary({ p, years }: { p: GroupProjection; years: number }) {
  const end = p.mid.length - 1;
  const contributed = p.contributed[end] ?? 0;
  return (
    <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line-subtle pt-4 sm:grid-cols-3 lg:grid-cols-6">
      {[
        ["Today", <Money key="t" value={p.start} />],
        [`In ${years} years (expected)`, <Money key="m" value={p.mid[end]!} />],
        ["Low case", <Money key="l" value={p.low[end]!} />],
        ["High case", <Money key="h" value={p.high[end]!} />],
        ["You contribute", <Money key="c" value={contributed} />],
        ["Growth (expected)", <Money key="g" value={p.mid[end]! - p.start - contributed} />],
      ].map(([label, v]) => (
        <div key={label as string}>
          <dt className="text-[12px] text-fg-3">{label}</dt>
          <dd className="text-[16px] font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function GroupCard({ g, color, accounts, valueOf, p, years, soFar }: {
  g: ProjGroup; color: string; accounts: Account[]; valueOf: (k: string) => number; p: GroupProjection; years: number; soFar: number;
}) {
  const st = useProjections();
  const up = (patch: Partial<ProjGroup>) => st.updateGroup(g.id, patch);
  const toggle = (k: string) => up({ accountKeys: g.accountKeys.includes(k) ? g.accountKeys.filter((x) => x !== k) : [...g.accountKeys, k] });
  const rates = g.rates ?? st.rates;
  const relevant = [...accounts].sort((a, b) => Number(b.type === g.kind || (g.kind === "retirement" && RETIREMENT_TYPES.has(b.type))) - Number(a.type === g.kind || (g.kind === "retirement" && RETIREMENT_TYPES.has(a.type))));

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-full" style={{ background: color }} />
          <input value={g.name} onChange={(e) => up({ name: e.target.value })} aria-label="Group name" className="w-44 rounded border border-transparent bg-transparent px-1 font-semibold hover:border-line" />
        </span>
      }
      actions={g.kind === "custom" && <Button variant="ghost" aria-label={`Delete ${g.name}`} onClick={() => st.removeGroup(g.id)}><Trash2 className="size-4" /></Button>}
    >
      <div className="space-y-4">
        <div>
          <div className="mb-1 text-[12px] text-fg-3">Accounts in this group</div>
          <ul className="max-h-48 space-y-0.5 overflow-y-auto">
            {relevant.map((a) => {
              const vesting = a.type === "dpsp" || a.type === "epsp";
              return (
                <li key={a.key}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[13px] hover:bg-hover">
                    <input type="checkbox" checked={g.accountKeys.includes(a.key)} onChange={() => toggle(a.key)} className="accent-[var(--accent)]" />
                    <span className="min-w-0 flex-1 truncate">
                      {a.name} <span className="text-fg-3">· {accountTypeLabel(a.type)} · {shortInstitution(a.institution)}</span>
                      {vesting && <span className="ml-1 text-[11px] text-warn" title="Employer contributions may not be yours until vested">vesting?</span>}
                    </span>
                    <Money value={valueOf(a.key)} className="text-[12px] text-fg-2" />
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <NumInput label="Contribution / year" prefix="$" value={g.annualContribution} onChange={(v) => up({ annualContribution: v ?? 0 })} />
          <PctInput label="Increase it each year" value={g.contributionGrowth} onChange={(v) => up({ contributionGrowth: v })} step={0.5} />
          <NumInput label="Stop contributing after (years)" value={g.contributeYears} onChange={(v) => up({ contributeYears: v })} step={1} placeholder="never" />
          <NumInput label="Lifetime contribution cap" prefix="$" value={g.contributionCap} onChange={(v) => up({ contributionCap: v })} placeholder="none" step={1000} />
        </div>
        {g.contributionCap !== undefined && (
          <p className="-mt-2 text-[12px] text-fg-3">{formatMoney(soFar)} contributed so far counts toward the cap.</p>
        )}

        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={g.rates !== null} onChange={(e) => up({ rates: e.target.checked ? { ...st.rates } : null })} className="accent-[var(--accent)]" />
          Own return assumptions for this group
        </label>
        {g.rates && (
          <div className="grid grid-cols-3 gap-3">
            <PctInput label="Low" value={rates.low} onChange={(v) => up({ rates: { ...rates, low: v } })} />
            <PctInput label="Expected" value={rates.mid} onChange={(v) => up({ rates: { ...rates, mid: v } })} />
            <PctInput label="High" value={rates.high} onChange={(v) => up({ rates: { ...rates, high: v } })} />
          </div>
        )}

        <div className="flex items-baseline justify-between border-t border-line-subtle pt-3 text-[13px]">
          <span className="text-fg-2">Today <Money value={p.start} /></span>
          <span>
            in {years} yrs <Money value={p.mid.at(-1)!} className="font-semibold" />
            <span className="ml-1 text-[11px] text-fg-3">(<Money value={p.low.at(-1)!} /> – <Money value={p.high.at(-1)!} />)</span>
          </span>
        </div>
      </div>
    </Card>
  );
}

function ProjectionTable({ lines, total, interval, setInterval, ageAt, startYear }: {
  lines: (GroupProjection & { color: string })[]; total?: GroupProjection; interval: 1 | 5 | 10; setInterval: (v: 1 | 5 | 10) => void; ageAt?: (i: number) => number; startYear: number;
}) {
  const n = lines[0]!.mid.length;
  const idx = Array.from({ length: n }, (_, i) => i).filter((i) => i % interval === 0 || i === n - 1);
  const t = total ?? lines[0]!;
  return (
    <Card title="Year by year" actions={<Segmented label="Interval" value={String(interval)} onChange={(v) => setInterval(Number(v) as 1 | 5 | 10)} options={[{ value: "1", label: "Every year" }, { value: "5", label: "5 years" }, { value: "10", label: "10 years" }]} />}>
      <div className="-mx-4 -my-4 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead className="text-left text-[11px] uppercase tracking-wide text-fg-3">
            <tr>
              <th className="px-4 py-2 font-medium">Year</th>
              {lines.length > 1 && lines.map((l) => <th key={l.id} className="px-3 py-2 text-right font-medium">{l.name}</th>)}
              <th className="px-3 py-2 text-right font-medium">Low</th>
              <th className="px-3 py-2 text-right font-medium">{total ? "Combined" : "Expected"}</th>
              <th className="px-3 py-2 text-right font-medium">High</th>
              <th className="px-3 py-2 text-right font-medium">Contributed</th>
              <th className="px-4 py-2 text-right font-medium">Growth</th>
            </tr>
          </thead>
          <tbody>
            {idx.map((i) => (
              <tr key={i} className="border-t border-line-subtle hover:bg-hover">
                <td className="num px-4 py-1.5">
                  {startYear + i}
                  {ageAt && <span className="text-fg-3"> · age {ageAt(i)}</span>}
                </td>
                {lines.length > 1 && lines.map((l) => <td key={l.id} className="px-3 py-1.5 text-right"><Money value={l.mid[i]!} /></td>)}
                <td className="px-3 py-1.5 text-right text-fg-2"><Money value={t.low[i]!} /></td>
                <td className="px-3 py-1.5 text-right font-semibold"><Money value={t.mid[i]!} /></td>
                <td className="px-3 py-1.5 text-right text-fg-2"><Money value={t.high[i]!} /></td>
                <td className="px-3 py-1.5 text-right text-fg-2"><Money value={t.contributed[i]!} /></td>
                <td className="px-4 py-1.5 text-right">
                  <Money value={t.mid[i]! - t.start - t.contributed[i]!} />
                  {t.start + t.contributed[i]! > 0 && <span className="ml-1 text-[11px] text-fg-3"><Pct value={(t.mid[i]! - t.start - t.contributed[i]!) / (t.start + t.contributed[i]!)} /></span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
