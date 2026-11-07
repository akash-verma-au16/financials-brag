import { useState, type ReactNode } from "react";
import { Money, Pct } from "@/components/money";
import { ProjectionChart } from "@/components/ProjectionChart";
import { Card, Notice, Segmented, cx } from "@/components/ui";
import { FREQ, monthsToPayoff, mortgage, paymentForMonths, projectGrowth, toReal, type PaymentFrequency } from "@/data/finance-math";

type Tab = "mortgage" | "growth" | "debt" | "inflation";

export function CalculatorsPage() {
  const [tab, setTab] = useState<Tab>("mortgage");
  return (
    <div className="space-y-5">
      <Segmented
        label="Calculator"
        value={tab}
        onChange={setTab}
        options={[
          { value: "mortgage", label: "Mortgage" },
          { value: "growth", label: "Compound growth" },
          { value: "debt", label: "Debt payoff" },
          { value: "inflation", label: "Inflation" },
        ]}
      />
      {tab === "mortgage" && <MortgageCalc />}
      {tab === "growth" && <GrowthCalc />}
      {tab === "debt" && <DebtCalc />}
      {tab === "inflation" && <InflationCalc />}
    </div>
  );
}

// ── Inputs ────────────────────────────────────────────────────────────────────

const inputCls = "h-8 w-full rounded-md border border-line bg-raised px-2 text-[13px] num hover:border-line-strong";

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-fg-3">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-fg-3">{hint}</span>}
    </label>
  );
}

function Num({ value, onChange, prefix, suffix, step = 1 }: { value: number; onChange: (v: number) => void; prefix?: string; suffix?: string; step?: number }) {
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute left-2 top-1.5 text-fg-3">{prefix}</span>}
      <input type="number" step={step} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(Number(e.target.value))} className={cx(inputCls, prefix && "pl-5", suffix && "pr-7")} />
      {suffix && <span className="pointer-events-none absolute right-2 top-1.5 text-fg-3">{suffix}</span>}
    </div>
  );
}

function Result({ label, value, sub, strong }: { label: string; value: ReactNode; sub?: ReactNode; strong?: boolean }) {
  return (
    <div>
      <div className="text-[12px] text-fg-3">{label}</div>
      <div className={cx("font-semibold", strong ? "text-[22px] leading-7" : "text-[16px]")}>{value}</div>
      {sub && <div className="text-[12px] text-fg-3">{sub}</div>}
    </div>
  );
}

const yrs = (y: number) => {
  const whole = Math.floor(y);
  const months = Math.round((y - whole) * 12);
  return months === 12 ? `${whole + 1} yrs` : months ? `${whole} yrs ${months} mo` : `${whole} yrs`;
};

// ── Mortgage ──────────────────────────────────────────────────────────────────

function MortgageCalc() {
  const [price, setPrice] = useState(700000);
  const [downPct, setDownPct] = useState(20);
  const [rate, setRate] = useState(4.5);
  const [amort, setAmort] = useState(25);
  const [term, setTerm] = useState(5);
  const [freq, setFreq] = useState<PaymentFrequency>("monthly");
  const [prepay, setPrepay] = useState(0);
  const [extra, setExtra] = useState(0);
  const [variable, setVariable] = useState(false);

  const base = { price, down: (price * downPct) / 100, amortizationYears: amort, termYears: term, compounding: variable ? ("monthly" as const) : ("semi-annual" as const) };
  const m = mortgage({ ...base, rate: rate / 100, frequency: freq, annualPrepayment: prepay, extraPerPayment: extra });
  const startYear = new Date().getFullYear();

  return (
    <div className="space-y-5">
      <Card title="Mortgage">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Field label="Home price"><Num value={price} onChange={setPrice} prefix="$" step={10000} /></Field>
          <Field label="Down payment" hint={`$${Math.round((price * downPct) / 100).toLocaleString("en-CA")}`}><Num value={downPct} onChange={setDownPct} suffix="%" step={1} /></Field>
          <Field label="Interest rate"><Num value={rate} onChange={setRate} suffix="%" step={0.05} /></Field>
          <Field label="Amortization"><Num value={amort} onChange={setAmort} suffix="yrs" /></Field>
          <Field label="Term"><Num value={term} onChange={setTerm} suffix="yrs" /></Field>
          <Field label="Payments">
            <select value={freq} onChange={(e) => setFreq(e.target.value as PaymentFrequency)} className={inputCls}>
              {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Yearly prepayment"><Num value={prepay} onChange={setPrepay} prefix="$" step={1000} /></Field>
          <Field label="Extra per payment"><Num value={extra} onChange={setExtra} prefix="$" step={50} /></Field>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={variable} onChange={(e) => setVariable(e.target.checked)} className="accent-[var(--accent)]" />
          Variable rate (compounds monthly; fixed-rate mortgages in Canada compound semi-annually)
        </label>
      </Card>

      {m.error ? (
        <Notice tone="warn">{m.error}</Notice>
      ) : (
        <>
          <Card title="Results">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4 xl:grid-cols-7">
              <Result strong label={`${FREQ[freq].label} payment`} value={<Money value={m.payment + extra} style="cents" />} />
              <Result label="Mortgage amount" value={<Money value={m.loan} />} sub={m.insurance ? <>incl. <Money value={m.insurance} /> CMHC</> : "no CMHC insurance"} />
              <Result label="Paid off in" value={yrs(m.payoffYears)} sub={m.payoffYears < amort ? `${yrs(amort - m.payoffYears)} early` : undefined} />
              <Result label="Total interest" value={<Money value={m.totalInterest} />} />
              <Result label={`Balance after ${term}-yr term`} value={<Money value={m.balanceAtTerm} />} />
              <Result label="Interest during term" value={<Money value={m.interestOverTerm} />} />
              <Result label="Total cost" value={<Money value={m.loan + m.totalInterest + (price * downPct) / 100} />} sub="down + principal + interest" />
            </div>
          </Card>

          <Card title="Balance and interest over time">
            <ProjectionChart
              startYear={startYear}
              lines={[{ key: "interest", label: "Interest paid (cumulative)", values: m.schedule.map((s) => s.cumulativeInterest), color: "var(--neg)" }]}
              total={{ key: "balance", label: "Balance owing", values: m.schedule.map((s) => s.balance), color: "var(--accent)" }}
            />
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card title="If the rate were different">
              <CompareTable
                head={["Rate", "Payment", "Total interest", "Paid off in"]}
                rows={[-1.5, -1, -0.5, 0, 0.5, 1, 1.5].map((d) => {
                  const r = mortgage({ ...base, rate: (rate + d) / 100, frequency: freq, annualPrepayment: prepay, extraPerPayment: extra });
                  return { key: String(d), current: d === 0, cells: [`${(rate + d).toFixed(2)}%`, <Money key="p" value={r.payment + extra} style="cents" />, <Money key="i" value={r.totalInterest} />, yrs(r.payoffYears)] };
                })}
              />
            </Card>
            <Card title="If you paid more often">
              <CompareTable
                head={["Frequency", "Payment", "Total interest", "Paid off in"]}
                rows={(Object.keys(FREQ) as PaymentFrequency[]).map((f) => {
                  const r = mortgage({ ...base, rate: rate / 100, frequency: f, annualPrepayment: prepay, extraPerPayment: extra });
                  return { key: f, current: f === freq, cells: [FREQ[f].label, <Money key="p" value={r.payment + extra} style="cents" />, <Money key="i" value={r.totalInterest} />, yrs(r.payoffYears)] };
                })}
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function CompareTable({ head, rows }: { head: string[]; rows: { key: string; current?: boolean; cells: ReactNode[] }[] }) {
  return (
    <div className="-mx-4 -my-4 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead className="text-left text-[11px] uppercase tracking-wide text-fg-3">
          <tr>{head.map((h, i) => <th key={h} className={cx("px-3 py-2 font-medium first:pl-4 last:pr-4", i > 0 && "text-right")}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={cx("border-t border-line-subtle", r.current && "bg-accent-subtle font-semibold")}>
              {r.cells.map((c, i) => <td key={i} className={cx("px-3 py-1.5 first:pl-4 last:pr-4", i > 0 && "text-right")}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Compound growth ───────────────────────────────────────────────────────────

function GrowthCalc() {
  const [start, setStart] = useState(10000);
  const [monthly, setMonthly] = useState(500);
  const [increase, setIncrease] = useState(2);
  const [rate, setRate] = useState(6);
  const [years, setYears] = useState(25);
  const [inflation, setInflation] = useState(2.5);
  const run = (r: number) => projectGrowth({ start, annualContribution: monthly * 12, contributionGrowth: increase / 100, rate: r / 100, years });
  const g = run(rate);
  const end = g.at(-1)!;
  const startYear = new Date().getFullYear();

  return (
    <div className="space-y-5">
      <Card title="Compound growth">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Field label="Starting amount"><Num value={start} onChange={setStart} prefix="$" step={1000} /></Field>
          <Field label="Monthly contribution"><Num value={monthly} onChange={setMonthly} prefix="$" step={50} /></Field>
          <Field label="Increase contributions yearly"><Num value={increase} onChange={setIncrease} suffix="%" step={0.5} /></Field>
          <Field label="Annual return"><Num value={rate} onChange={setRate} suffix="%" step={0.25} /></Field>
          <Field label="Years"><Num value={years} onChange={(v) => setYears(Math.min(Math.max(Math.round(v), 1), 60))} /></Field>
          <Field label="Inflation"><Num value={inflation} onChange={setInflation} suffix="%" step={0.25} /></Field>
        </div>
      </Card>
      <Card title="Results">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-5">
          <Result strong label={`In ${years} years`} value={<Money value={end.value} />} />
          <Result label="In today’s dollars" value={<Money value={toReal(end.value, inflation / 100, years)} />} />
          <Result label="You put in" value={<Money value={start + end.contributed} />} />
          <Result label="Growth" value={<Money value={end.growth} />} sub={start + end.contributed > 0 ? <><Pct value={end.growth / (start + end.contributed)} /> on what you put in</> : undefined} />
          <Result label="Doubling time" value={rate > 0 ? `${(Math.log(2) / Math.log(1 + rate / 100)).toFixed(1)} yrs` : "—"} sub="for money already invested" />
        </div>
        <div className="mt-5">
          <ProjectionChart
            startYear={startYear}
            lines={[{ key: "c", label: "Money put in", values: g.map((y) => start + y.contributed), color: "var(--chart-2)" }]}
            total={{ key: "v", label: "Value", values: g.map((y) => y.value), color: "var(--accent)" }}
          />
        </div>
      </Card>
      <Card title="What if the return were different?">
        <CompareTable
          head={["Annual return", "Value", "Today’s dollars", "Growth"]}
          rows={[3, 4, 5, 6, 7, 8, 9, 10].map((r) => {
            const e = run(r).at(-1)!;
            return { key: String(r), current: r === rate, cells: [`${r}%`, <Money key="v" value={e.value} />, <Money key="r" value={toReal(e.value, inflation / 100, years)} />, <Money key="g" value={e.growth} />] };
          })}
        />
      </Card>
    </div>
  );
}

// ── Debt payoff ───────────────────────────────────────────────────────────────

function DebtCalc() {
  const [balance, setBalance] = useState(5000);
  const [apr, setApr] = useState(20.99);
  const [payment, setPayment] = useState(250);
  const [target, setTarget] = useState(12);
  const r = monthsToPayoff(balance, apr / 100, payment);
  const needed = paymentForMonths(balance, apr / 100, target);

  return (
    <div className="space-y-5">
      <Card title="Debt payoff">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Balance"><Num value={balance} onChange={setBalance} prefix="$" step={100} /></Field>
          <Field label="Interest rate (APR)"><Num value={apr} onChange={setApr} suffix="%" step={0.25} /></Field>
          <Field label="Monthly payment"><Num value={payment} onChange={setPayment} prefix="$" step={25} /></Field>
          <Field label="Or: pay off within"><Num value={target} onChange={(v) => setTarget(Math.max(1, Math.round(v)))} suffix="mo" /></Field>
        </div>
      </Card>
      <Card title="Results">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          <Result strong label="Paid off in" value={r ? `${Math.floor(r.months / 12)} yrs ${r.months % 12} mo` : "Never"} sub={r ? undefined : "the payment doesn’t cover the interest"} />
          <Result label="Interest you’ll pay" value={r ? <Money value={r.interest} /> : "—"} />
          <Result label={`To clear it in ${target} months`} value={<Money value={needed} style="cents" />} sub="per month" />
          <Result label="Interest that way" value={<Money value={needed * target - balance} />} />
        </div>
      </Card>
      <Card title="Paying more each month">
        <CompareTable
          head={["Monthly payment", "Paid off in", "Interest"]}
          rows={[1, 1.25, 1.5, 2, 3].map((f) => {
            const p = Math.round(payment * f);
            const x = monthsToPayoff(balance, apr / 100, p);
            return { key: String(f), current: f === 1, cells: [<Money key="p" value={p} />, x ? `${x.months} months` : "Never", x ? <Money key="i" value={x.interest} /> : "—"] };
          })}
        />
      </Card>
    </div>
  );
}

// ── Inflation ─────────────────────────────────────────────────────────────────

function InflationCalc() {
  const [amount, setAmount] = useState(1000);
  const [rate, setRate] = useState(2.5);
  const [years, setYears] = useState(20);
  const f = (y: number) => Math.pow(1 + rate / 100, y);
  return (
    <div className="space-y-5">
      <Card title="Inflation">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Field label="Amount today"><Num value={amount} onChange={setAmount} prefix="$" step={100} /></Field>
          <Field label="Inflation rate"><Num value={rate} onChange={setRate} suffix="%" step={0.25} /></Field>
          <Field label="Years"><Num value={years} onChange={(v) => setYears(Math.max(1, Math.round(v)))} /></Field>
        </div>
      </Card>
      <Card title="Results">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
          <Result strong label={`Costs in ${years} years`} value={<Money value={amount * f(years)} />} sub="the same things, future prices" />
          <Result label={`${new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(amount)} in ${years} years is worth today`} value={<Money value={amount / f(years)} />} />
          <Result label="Purchasing power lost" value={<Pct value={1 - 1 / f(years)} />} />
        </div>
      </Card>
      <Card title="Year by year">
        <CompareTable
          head={["Year", "Future cost", "Worth today"]}
          rows={Array.from({ length: Math.floor(years / 5) + 1 }, (_, i) => i * 5).concat(years % 5 ? [years] : []).map((y) => ({
            key: String(y),
            cells: [String(new Date().getFullYear() + y), <Money key="c" value={amount * f(y)} />, <Money key="w" value={amount / f(y)} />],
          }))}
        />
      </Card>
    </div>
  );
}
