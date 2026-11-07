import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { DataGate } from "@/components/DataGate";
import { Money } from "@/components/money";
import { Card, Notice, Segmented, cx } from "@/components/ui";
import { LIMITS_FILE, useLimits, type Limits } from "@/data/limits";
import type { Dataset } from "@/data/model";
import { ROOM_LABEL, computeRoom, type RoomResult } from "@/data/room";
import { useSettings } from "@/data/settings";
import { formatDate, formatMoney } from "@/lib/format";
import { useUi } from "@/lib/ui-store";

export function RoomPage() {
  return <DataGate>{(ds) => <Room ds={ds} />}</DataGate>;
}

function Room({ ds }: { ds: Dataset }) {
  const people = useSettings((s) => s.people);
  const uiPerson = useUi((s) => s.person);
  const limitsState = useLimits();
  const limits: Limits | null = limitsState.status === "ready" ? limitsState.limits : null;
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [picked, setPicked] = useState<string | null>(null);
  const personId = picked ?? (uiPerson !== "all" ? uiPerson : people[0]!.id);
  // The YAML holds the default owner's figures (first person in Settings).
  const isPrimary = personId === people[0]?.id;
  const yearLimits = isPrimary ? (limits?.years[year] ?? {}) : {};

  const exclusionList = useSettings((s) => s.roomExclusions);
  const exclusions = useMemo(() => new Set(exclusionList), [exclusionList]);
  const results = computeRoom(ds, personId, { year, ...yearLimits }, exclusions);
  const nextYear = isPrimary ? limits?.years[year + 1] : undefined;

  const yearOptions = [...new Set([thisYear - 1, thisYear, ...Object.keys(limits?.years ?? {}).map(Number)])]
    .filter((y) => y <= thisYear + 1)
    .sort((a, b) => a - b);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {people.length > 1 && (
          <Segmented label="Person" value={personId} onChange={setPicked} options={people.map((p) => ({ value: p.id, label: p.name }))} />
        )}
        <Segmented label="Tax year" value={String(year)} onChange={(v) => setYear(Number(v))} options={yearOptions.map((y) => ({ value: String(y), label: String(y) }))} />
      </div>

      {limitsState.status === "missing" && (
        <Notice tone="warn">{LIMITS_FILE} wasn’t found. Contributions are still totalled below; limits show as unknown.</Notice>
      )}
      {limitsState.status === "error" && <Notice tone="neg">Couldn’t read {LIMITS_FILE}: {limitsState.error}</Notice>}
      {!isPrimary && (
        <Notice tone="info">
          {LIMITS_FILE} holds limits for {people[0]?.name} only. Contributions for this person are totalled, but limits are unknown.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {results.map((r) => (
          <RoomCard key={r.kind} r={r} description={limits?.descriptions[r.kind]} nextYearRoom={nextYear?.[r.kind]} year={year} />
        ))}
      </div>

      <p className="text-[12px] text-fg-3">
        Limits come from <code className="font-mono">{LIMITS_FILE}</code> in the repo; update it once a year from CRA My
        Account. Contributions are counted from your transactions, including transfers from your chequing account.
        Always confirm with CRA before contributing near a limit.
      </p>
      <ContributionList results={results} />
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: React.ReactNode; strong?: boolean; tone?: "neg" | "pos" }) {
  return (
    <>
      <dt className={cx(strong ? "font-semibold" : "text-fg-2", tone === "neg" && "text-neg")}>{label}</dt>
      <dd className={cx("text-right", strong && "font-semibold", tone === "neg" && "text-neg", tone === "pos" && "text-pos")}>{value}</dd>
    </>
  );
}

function RoomCard({ r, description, nextYearRoom, year }: { r: RoomResult; description?: string; nextYearRoom?: number; year: number }) {
  const privacy = useUi((s) => s.privacy);
  const known = r.room !== null;
  const used = known && r.room! > 0 ? Math.min(r.contributed / r.room!, 1) : 0;
  const over = r.remaining !== null && r.remaining < 0;
  const monthsLeft = year === new Date().getFullYear() ? Math.max(1, 12 - new Date().getMonth()) : 12;

  return (
    <Card title={ROOM_LABEL[r.kind]} actions={<span className="text-[12px] text-fg-3">{formatDate(r.window[0])} – {formatDate(r.window[1])}</span>}>
      {description && <p className="mb-3 text-[12px] text-fg-3">{description}</p>}
      {r.accounts.length === 0 && <p className="mb-3 text-fg-3">No {ROOM_LABEL[r.kind]} accounts for this person.</p>}

      {known ? (
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-selected">
          <div className={cx("h-full rounded-full", over ? "bg-neg" : "bg-accent")} style={{ width: `${used * 100}%` }} />
        </div>
      ) : (
        <div className="mb-3 rounded-md border border-dashed border-line px-3 py-2 text-[12px] text-fg-3">
          Limit unknown for {year}. Add it to {LIMITS_FILE} to see what’s left.
        </div>
      )}

      <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-[13px]">
        <Row label={r.kind === "rrsp" ? "Deduction limit" : "Starting room"} value={known ? <Money value={r.room!} style="cents" /> : "Unknown"} />
        <Row label="Contributed" value={<Money value={r.contributed} style="cents" />} />
        {r.withdrawn > 0 && <Row label={r.kind === "tfsa" ? "Withdrawn (back next Jan 1)" : "Withdrawn"} value={<Money value={r.withdrawn} style="cents" />} />}
        {known && (
          <Row
            label={over ? "Over-contributed" : "Available to contribute"}
            value={<Money value={Math.abs(r.remaining!)} style="cents" />}
            strong
            tone={over ? "neg" : "pos"}
          />
        )}
      </dl>

      {known && over && (
        <p className="mt-2 text-[12px] text-neg">
          {r.kind === "rrsp"
            ? "CRA allows a $2,000 lifetime buffer; above that the excess is taxed 1% a month."
            : `Excess ${ROOM_LABEL[r.kind]} contributions are taxed 1% a month until withdrawn.`}
        </p>
      )}
      {known && !over && r.remaining! > 0 && r.kind !== "rrsp" && (
        <p className="mt-2 text-[12px] text-fg-3">
          ≈ {privacy ? "•••••" : formatMoney(r.remaining! / monthsLeft)} a month to use it by Dec 31.
        </p>
      )}
      <Link
        to="/projections"
        search={{ focus: r.kind === "rrsp" ? "retirement" : r.kind }}
        className="mt-3 inline-block text-[12px] font-medium text-accent hover:underline"
      >
        Project this {r.kind === "rrsp" ? "RRSP + pensions" : ROOM_LABEL[r.kind]} bucket →
      </Link>
      {r.kind === "tfsa" && known && (
        <p className="mt-1 text-[12px] text-fg-3">
          Next Jan 1: {nextYearRoom !== undefined ? <Money value={nextYearRoom} /> : <>unused room <Money value={Math.max(r.remaining!, 0)} /> + withdrawals <Money value={r.withdrawn} /> + next year’s annual limit</>}.
        </p>
      )}
    </Card>
  );
}

function ContributionList({ results }: { results: RoomResult[] }) {
  const toggle = useSettings((s) => s.toggleRoomExclusion);
  const rows = results.flatMap((r) => r.txns.map((x) => ({ ...x, kind: r.kind }))).sort((a, b) => b.txn.date.localeCompare(a.txn.date));
  if (!rows.length) return <Card title="Contributions and withdrawals">None found in this tax year.</Card>;
  return (
    <Card title="Contributions and withdrawals" actions={<span className="text-[12px] text-fg-3">untick a row to leave it out</span>}>
      <div className="-mx-4 -my-4 overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-[13px]">
          <thead className="text-left text-[11px] uppercase tracking-wide text-fg-3">
            <tr>
              <th className="px-4 py-2 font-medium">Counts</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Note</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const auto = x.note?.startsWith("Moved between");
              return (
                <tr key={x.txn.id} className={cx("border-t border-line-subtle", !x.counted && "text-fg-3")}>
                  <td className="px-4 py-1.5">
                    <input
                      type="checkbox"
                      checked={x.counted}
                      disabled={auto}
                      onChange={() => toggle(x.txn.id)}
                      aria-label={`Count ${formatDate(x.txn.date)} toward room`}
                      className="accent-[var(--accent)]"
                    />
                  </td>
                  <td className="num whitespace-nowrap px-3 py-1.5">{formatDate(x.txn.date)}</td>
                  <td className="px-3 py-1.5">{x.account.name} <span className="text-fg-3">· {ROOM_LABEL[x.kind]}</span></td>
                  <td className="px-3 py-1.5 text-[12px]">{x.note ?? (x.direction === "out" ? "Withdrawal" : "")}</td>
                  <td className="px-4 py-1.5 text-right"><Money value={x.txn.amount} style="cents" tone /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
