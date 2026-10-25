"use client";
import { ChevronDown, MessagesSquare, ShieldAlert, Table2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useDecisionStore, type Tab } from "@/lib/decisionStore";
import { fmtMoney } from "@/lib/format";
import { everGivenCheck, type Outcome } from "@/lib/models/decision";
import { MIN_ORIGIN, forecast, indexOf, isoOf, simulateForecast } from "@/lib/models/forecast";
import type { ModelData } from "@/lib/models/types";
import { Badge } from "../ui/Badge";
import { Segmented } from "../ui/Segmented";
import { Tip } from "../ui/Tip";
import { area, fmtDate, lin, line, niceMax, useSize, YTicks } from "./charts";

const QUESTION = "How can shipping companies minimise costs when major maritime routes are disrupted?";
const TABS: { id: Tab; label: string }[] = [
  { id: "forecast", label: "Forecast" },
  { id: "simulate", label: "Simulate" },
  { id: "decide", label: "Decide" },
];
const TONE: Record<Outcome["key"], string> = { best: "var(--color-green)", middle: "var(--color-ink)", worst: "var(--color-red)" };
const TEXT: Record<Outcome["key"], string> = { best: "text-green", middle: "text-ink", worst: "text-red" };

export default function DecisionStrip({ md }: { md: ModelData }) {
  const tab = useDecisionStore((s) => s.tab);
  const setTab = useDecisionStore((s) => s.setTab);
  const r = useDecisionStore((s) => s.result);
  return (
    <section aria-label="Decision engine" className="flex h-full min-h-0 flex-col border-t border-line bg-panel">
      <AnswerLine />
      <div role="tablist" aria-label="Decision engine steps" className="flex h-9 shrink-0 items-end gap-1 border-b border-line px-5">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`-mb-px h-9 border-b-2 px-3 text-[13px] transition-colors duration-150 ${tab === t.id ? "border-cyan text-ink" : "border-transparent text-mute hover:text-ink"}`}>
            {t.label}
          </button>
        ))}
        {r && <span className="num mb-2.5 ml-auto text-[10px] text-faint">{r.mc.samples.toLocaleString()} Monte Carlo draws · {r.totalMs.toFixed(0)} ms</span>}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 px-5 py-4">
        {tab === "forecast" && <ForecastTab md={md} />}
        {tab === "simulate" && <SimulateTab md={md} />}
        {tab === "decide" && <DecideTab />}
      </div>
    </section>
  );
}

function AnswerLine() {
  const r = useDecisionStore((s) => s.result);
  const setAnalyst = useDecisionStore((s) => s.setAnalyst);
  let body: React.ReactNode;
  if (!r) body = <span className="text-mute">Drop a blockage on a chokepoint such as Suez, Panama or Malacca to get a plan for every ship.</span>;
  else {
    const S = r.mc.strategies, best = S[r.mc.bestRule];
    const what = `${r.target.cpName}, ${r.target.expectedDays}-day ${r.target.severity >= 0.99 ? "closure" : `${Math.round(r.target.severity * 100)}% restriction`}`;
    body = r.mc.counts.noAlternative === r.fleet.length ? (
      <span>{what}: no sea route avoids it, so all <b className="num font-medium text-cyan">{r.fleet.length}</b> ships wait. Expected cost <b className="num font-medium">{fmtMoney(S.mc.mean)}</b>.</span>
    ) : (
      <span>
        {what}: hold <b className="num font-medium text-cyan">{r.mc.counts.wait}</b> ships, reroute <b className="num font-medium text-amber">{r.mc.counts.reroute}</b>.
        {" "}Average <b className="num font-medium">{fmtMoney(S.mc.mean)}</b> vs {fmtMoney(best.mean)} if all {r.mc.bestRule === "wait" ? "wait" : "reroute"}
        {r.mc.savingVsBestRule > 0 && <>, saving <b className="num font-medium text-green">{fmtMoney(r.mc.savingVsBestRule)} ({r.mc.savingPct.toFixed(0)}%)</b></>}.
      </span>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-6 border-b border-line px-5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-faint">{QUESTION}</p>
        <p className="mt-1 text-[14px] leading-snug text-ink">{body}</p>
      </div>
      <button data-tour="analyst" onClick={() => setAnalyst(true)} className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-sm border border-cyan/60 px-3 text-[12px] text-ink hover:bg-raised">
        <MessagesSquare size={14} strokeWidth={1.5} /> Ask the analyst
      </button>
    </div>
  );
}

function Pane({ title, badge, chart, side }: { title: string; badge: React.ReactNode; chart: React.ReactNode; side: React.ReactNode }) {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_288px]">
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="mb-2 flex items-center gap-2"><h3 className="text-[13px] text-ink">{title}</h3>{badge}</div>
        {chart}
      </div>
      <div className="min-w-0 space-y-3">{side}</div>
    </div>
  );
}

const Quiet = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className="text-[12px] text-mute underline decoration-line-2 underline-offset-4 hover:text-ink">{children}</button>
);

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="grid h-full place-items-center text-[13px] text-faint">{children}</div>;
}

// ------------------------------------------------------------------ Forecast
const DRAWN = 60;
function ForecastTab({ md }: { md: ModelData }) {
  const result = useDecisionStore((s) => s.result);
  const originSetting = useDecisionStore((s) => s.settings.originIdx);
  const set = useDecisionStore((s) => s.set);
  const openPanel = useDecisionStore((s) => s.openPanel);
  const [seed, setSeed] = useState(1);
  const last = md.traffic.days - 1;
  const origin = originSetting ?? last;
  const cpId = result?.target.cpId ?? "suez";
  const local = useMemo(() => (result ? null : forecast(md, cpId, origin)), [result, md, cpId, origin]);
  const fc = result?.forecast ?? local!;
  const sim = useMemo(() => simulateForecast(md, fc, 1000, seed), [md, fc, seed]);
  const cpName = result?.target.cpName ?? "Suez Canal";
  const y = md.traffic.series[cpId].total;
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const H0 = 21, i0 = fc.originIdx - H0, i1 = fc.originIdx + 7;
  const hist = Array.from({ length: H0 + 1 }, (_, k) => [i0 + k, y[i0 + k]] as const);
  const actual = fc.days.filter((d) => d.actual !== null);
  const drawn = sim.paths.slice(0, DRAWN);
  const ymax = niceMax(Math.max(...hist.map((p) => p[1]), ...drawn.flat(), ...actual.map((d) => d.actual!)) * 1.05);
  const L = 30, R = 8, T = 6, B = 18;
  const X = lin(i0, i1, L, w - R), Y = lin(0, ymax, h - B, T);
  const start: [number, number] = [X(fc.originIdx), Y(y[fc.originIdx])];
  const pathOf = (vals: number[]) => line([start, ...vals.map((v, k) => [X(fc.days[k].idx), Y(v)] as [number, number])]);
  const ev = md.evaluation.test[cpId];
  const egIdx = indexOf(md.traffic.start, "2021-03-22");
  const inBand = actual.filter((d, k) => d.actual! >= sim.p10[k] && d.actual! <= sim.p90[k]).length;
  return (
    <Pane title={`Normal daily traffic through ${cpName}`} badge={<Badge kind="FORECAST" title="XGBoost on OBSERVED IMF PortWatch transits" />}
      chart={
        <div ref={ref} className="relative min-h-0 flex-1">
          <svg width={w} height={h} className="absolute inset-0" role="img" aria-label={`Observed transits and ${DRAWN} simulated weeks for ${cpName}`}>
            <YTicks y={Y} max={ymax} x0={L} x1={w - R} n={2} />
            <rect x={X(fc.originIdx)} width={w - R - X(fc.originIdx)} y={T} height={h - B - T} fill="var(--color-cyan)" opacity={0.03} />
            <path d={line(hist.map(([i, v]) => [X(i), Y(v)]))} fill="none" stroke="var(--color-mute)" strokeWidth={1.3} />
            {drawn.map((p, i) => <path key={`${seed}-${i}`} d={pathOf(p)} fill="none" stroke="var(--color-cyan)" strokeWidth={1} opacity={0.16} />)}
            <path d={pathOf(sim.p10)} fill="none" stroke="var(--color-cyan)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
            <path d={pathOf(sim.p90)} fill="none" stroke="var(--color-cyan)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
            <path d={pathOf(fc.days.map((d) => d.mean))} fill="none" stroke="var(--color-cyan)" strokeWidth={2.2} />
            {actual.map((d) => <circle key={d.idx} cx={X(d.idx)} cy={Y(d.actual!)} r={3} fill="var(--color-ink)" stroke="var(--color-panel)" strokeWidth={1} />)}
            <text x={L} y={h - 3} fontSize={10} className="num" fill="var(--color-faint)">{fmtDate(isoOf(md.traffic.start, i0))}</text>
            <text x={X(fc.originIdx)} y={h - 3} fontSize={10} textAnchor="middle" className="num" fill="var(--color-mute)">{fmtDate(fc.originDate, true)}</text>
            <text x={w - R} y={h - 3} fontSize={10} textAnchor="end" className="num" fill="var(--color-faint)">+7 days</text>
          </svg>
          <div className="pointer-events-none absolute right-2 top-1 flex gap-3 text-[10px] text-faint">
            <span><i className="mr-1 inline-block h-[2px] w-3 bg-cyan align-middle" />XGBoost mean</span>
            <span><i className="mr-1 inline-block h-[1px] w-3 bg-cyan/40 align-middle" />{DRAWN} of {sim.n.toLocaleString()} simulated weeks</span>
            <span><i className="mr-1 inline-block w-3 border-t border-dashed border-cyan/70 align-middle" />10th–90th percentile</span>
            {actual.length > 0 && <span><i className="mr-1 inline-block h-[6px] w-[6px] rounded-full bg-ink align-middle" />what happened</span>}
          </div>
        </div>
      }
      side={<>
        <div>
          <div className="num text-[26px] leading-none text-cyan">{fc.weekMean.toFixed(0)}<span className="ml-1 text-[13px] text-mute">ships a day</span></div>
          <p className="mt-1.5 text-[12px] text-mute">expected over the next 7 days</p>
        </div>
        <p className="text-[12px] leading-relaxed text-mute">
          In {sim.n.toLocaleString()} simulated weeks, <span className="num text-ink">{sim.week.p10}–{sim.week.p90}</span> ships arrive in 8 out of 10.
          {actual.length > 0 && <> Actual days inside the range: <span className="num text-ink">{inBand} of {actual.length}</span>.</>}
          {actual.length > 0 && inBand / actual.length < 0.3 && <span className="text-amber"> No normal week looks like this: it was a disruption, which the Simulate tab models.</span>}
          {" "}<Quiet onClick={() => setSeed(seed + 1)}>Draw again</Quiet>
        </p>
        {ev && <p className="text-[12px] leading-relaxed text-mute">Off by {ev.xgboost.mae.toFixed(1)} ships a day on unseen data, vs {ev.naive.mae.toFixed(1)} for “same as yesterday”. <Quiet onClick={() => openPanel("model")}>Model info</Quiet></p>}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[12px]">
            <label htmlFor="asof" className="text-mute">Forecast from</label>
            <span className={`num ${fc.originIdx < last ? "text-amber" : "text-ink"}`}>{fmtDate(fc.originDate, true)}</span>
          </div>
          <input id="asof" type="range" className="rng" min={MIN_ORIGIN + 14} max={last} value={fc.originIdx}
            style={{ ["--p" as string]: `${((fc.originIdx - MIN_ORIGIN - 14) / (last - MIN_ORIGIN - 14)) * 100}%` }}
            onChange={(e) => set({ originIdx: Number(e.target.value) === last ? null : Number(e.target.value) })} />
          <div className="flex gap-3">
            <Quiet onClick={() => set({ originIdx: null })}>Latest data</Quiet>
            <Quiet onClick={() => set({ originIdx: egIdx })}>Day before Ever Given</Quiet>
          </div>
        </div>
      </>}
    />
  );
}

// ------------------------------------------------------------------ Simulate
function SimulateTab({ md }: { md: ModelData }) {
  const r = useDecisionStore((s) => s.result);
  const eg = useDecisionStore((s) => s.everGiven);
  const setEg = useDecisionStore((s) => s.setEverGiven);
  const check = useMemo(() => everGivenCheck(md), [md]);
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const L = 34, R = 8, T = 6, B = 18;
  if (eg) {
    const n = check.sim.length;
    const ymax = niceMax(Math.max(...check.sim.map((d) => Math.max(d.observed, d.simulated))) * 1.1);
    const X = lin(0, n - 1, L, w - R), Y = lin(0, ymax, h - B, T);
    return (
      <Pane title="Check: Ever Given closure, March 2021" badge={<Badge kind="OBSERVED" />}
        chart={
          <div ref={ref} className="relative min-h-0 flex-1">
            <svg width={w} height={h} className="absolute inset-0" role="img" aria-label="Observed vs simulated daily transits, Ever Given">
              <YTicks y={Y} max={ymax} x0={L} x1={w - R} n={2} />
              <rect x={X(md.queue.closedFromDay)} width={X(md.queue.reopenDay) - X(md.queue.closedFromDay)} y={T} height={h - B - T} fill="var(--color-red)" opacity={0.09} />
              <path d={line(check.sim.map((d, i) => [X(i), Y(d.simulated)]))} fill="none" stroke="var(--color-amber)" strokeWidth={2} />
              {check.sim.map((d, i) => <circle key={i} cx={X(i)} cy={Y(d.observed)} r={2.5} fill="var(--color-ink)" />)}
              <text x={L} y={h - 3} fontSize={10} className="num" fill="var(--color-faint)">{fmtDate(check.sim[0].date, true)}</text>
              <text x={w - R} y={h - 3} fontSize={10} textAnchor="end" className="num" fill="var(--color-faint)">{fmtDate(check.sim[n - 1].date)}</text>
            </svg>
          </div>
        }
        side={<>
          <p className="text-[12px] leading-relaxed text-mute">Dots are real daily transits; the line is our queue model. It is off by {check.rmse.toFixed(1)} ships a day, versus {md.queue.rmseNoSurge.toFixed(1)} without the catch-up surge.</p>
          <div><div className="num text-[22px] leading-none text-amber">{md.queue.kappa.toFixed(2)}×</div><p className="mt-1.5 text-[12px] text-mute">normal speed while clearing a backlog, fitted on this event and used for every chokepoint</p></div>
          <Quiet onClick={() => setEg(false)}>Back to the scenario</Quiet>
        </>}
      />
    );
  }
  if (!r) return <Empty>Close a chokepoint to simulate its queue.</Empty>;
  const D = r.outcomes[0].timeline.length;
  const qmax = niceMax(Math.max(1, ...r.outcomes.flatMap((o) => o.timeline.map((d) => d.queue))) * 1.05);
  const X = lin(0, D, L, w - R), Y = lin(0, qmax, h - B, T);
  return (
    <Pane title={`Ships queuing at ${r.target.cpName}`} badge={<Badge kind="SIMULATED" />}
      chart={
        <div ref={ref} className="relative min-h-0 flex-1">
          <svg width={w} height={h} className="absolute inset-0" role="img" aria-label="Queue length over time for best, middle and worst case reopening">
            <YTicks y={Y} max={qmax} x0={L} x1={w - R} n={2} />
            {r.outcomes.map((o) => (
              <g key={o.key}>
                <path d={line([[X(0), Y(0)], ...o.timeline.map((d) => [X(d.day + 1), Y(d.queue)] as [number, number])])} fill="none" stroke={TONE[o.key]} strokeWidth={o.key === "middle" ? 2 : 1.4} opacity={o.key === "middle" ? 1 : 0.85} />
                <line x1={X(o.days)} x2={X(o.days)} y1={h - B} y2={h - B + 5} stroke={TONE[o.key]} strokeWidth={1.5} />
              </g>
            ))}
            <text x={L} y={h - 3} fontSize={10} className="num" fill="var(--color-faint)">now</text>
            <text x={w - R} y={h - 3} fontSize={10} textAnchor="end" className="num" fill="var(--color-faint)">{D} days</text>
          </svg>
        </div>
      }
      side={<>
        <table className="w-full text-[12px]">
          <thead><tr className="text-left text-[11px] text-faint"><th className="pb-1.5 font-normal" /><th className="pb-1.5 text-right font-normal">Reopens</th><th className="pb-1.5 text-right font-normal">Peak queue</th><th className="pb-1.5 text-right font-normal">Cleared</th></tr></thead>
          <tbody>{r.outcomes.map((o) => (
            <tr key={o.key}>
              <td className={`py-1 ${TEXT[o.key]}`}>{o.label}</td>
              <td className="num py-1 text-right text-ink">day {o.days.toFixed(0)}</td>
              <td className="num py-1 text-right text-ink">{Math.round(o.peakQueue)}</td>
              <td className="num py-1 text-right text-ink">{o.clearDay === null ? `> ${D}` : `day ${o.clearDay}`}</td>
            </tr>))}
          </tbody>
        </table>
        <p className="text-[12px] leading-relaxed text-mute">{r.fleet.length} ships are due in the next 3 weeks. Once open, the backlog clears at about {r.mc.ratesPerDay.open.toFixed(0)} ships a day.</p>
        <Quiet onClick={() => setEg(true)}>Check the model against Ever Given</Quiet>
      </>}
    />
  );
}

// ------------------------------------------------------------------ Decide
function DecideTab() {
  const r = useDecisionStore((s) => s.result);
  const st = useDecisionStore((s) => s.settings);
  const set = useDecisionStore((s) => s.set);
  const openPanel = useDecisionStore((s) => s.openPanel);
  const [more, setMore] = useState(false);
  if (!r) return <Empty>No closed chokepoint, so there is no decision to make.</Empty>;
  const S = r.mc.strategies;
  const rows = [
    { id: "mc", label: "Recommended plan", s: S.mc, color: "bg-green" },
    { id: "wait", label: "Everyone waits", s: S.wait, color: "bg-cyan" },
    { id: "reroute", label: "Everyone reroutes", s: S.reroute, color: "bg-amber" },
  ];
  const max = niceMax(Math.max(...rows.map((x) => x.s.p90)));
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <Pane title="What the fleet pays" badge={<Badge kind="MODELLED" />}
      chart={
        <div className="flex min-h-0 flex-1 flex-col justify-between gap-4">
          <div className="grid grid-cols-3 gap-6">
            {r.outcomes.map((o) => (
              <div key={o.key}>
                <div className={`text-[12px] ${TEXT[o.key]}`}>{o.label}</div>
                <div className="text-[11px] text-faint">reopens after {o.days.toFixed(0)} days</div>
                <div className="num mt-1.5 text-[22px] leading-none text-ink">{fmtMoney(o.planCost)}</div>
                <div className="num mt-1 text-[11px] text-mute">{fmtMoney(o.waitCost)} if everyone waits</div>
              </div>
            ))}
          </div>
          <div>
            <ul className="space-y-2">
              {rows.map((x) => (
                <li key={x.id} className="grid grid-cols-[124px_minmax(0,1fr)_64px] items-center gap-3">
                  <span className={`text-[12px] ${x.id === "mc" ? "text-ink" : "text-mute"}`}>{x.label}</span>
                  <span className="relative h-[10px] rounded-[2px] bg-line/40">
                    <span className={`absolute inset-y-[3px] rounded-[2px] ${x.color} opacity-35`} style={{ left: pct(x.s.p10), width: `max(2px, ${pct(x.s.p90 - x.s.p10)})` }} />
                    <span className={`absolute inset-y-0 w-[3px] -translate-x-1/2 rounded-[1px] ${x.color}`} style={{ left: pct(x.s.p50) }} />
                  </span>
                  <span className={`num text-right text-[12px] ${x.id === "mc" ? "text-ink" : "text-mute"}`}>{fmtMoney(x.s.p50)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-faint">Bars run from best to worst case; the tick and figure are the middle. Long closures pull the plan’s average ({fmtMoney(S.mc.mean)}) above its middle.</p>
          </div>
        </div>
      }
      side={<>
        <div>
          <div className="mb-1.5 flex justify-between text-[12px]"><span className="text-cyan">{r.mc.counts.wait} wait</span><span className="text-amber">{r.mc.counts.reroute} reroute</span></div>
          <div className="flex h-[6px] overflow-hidden rounded-[2px] bg-amber/60" role="img" aria-label={`${r.mc.counts.wait} wait, ${r.mc.counts.reroute} reroute`}>
            <span className="h-full bg-cyan/70 transition-[width] duration-300" style={{ width: `${(r.mc.counts.wait / Math.max(1, r.fleet.length)) * 100}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[12px] text-mute">Plan for</div>
          <Segmented label="Risk preference" value={st.risk} onChange={(v) => set({ risk: v })}
            options={[{ value: "expected", label: "Lowest average" }, { value: "balanced", label: "Balanced" }, { value: "cvar", label: "Worst case" }]} />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[12px]"><label htmlFor="unc" className="text-mute">Reopening date uncertainty</label><span className="num text-ink">±{Math.round(st.uncertainty * 100)}%</span></div>
          <input id="unc" type="range" className="rng" min={0.1} max={1.5} step={0.05} value={st.uncertainty}
            style={{ ["--p" as string]: `${((st.uncertainty - 0.1) / 1.4) * 100}%` }} onChange={(e) => set({ uncertainty: Number(e.target.value) })} />
        </div>
        <div>
          <button onClick={() => setMore(!more)} aria-expanded={more} className="flex items-center gap-1 text-[12px] text-mute hover:text-ink">
            Fuel {st.fuelMultiplier}× · {st.urgency} urgency <ChevronDown size={13} strokeWidth={1.5} className={more ? "rotate-180" : ""} />
          </button>
          {more && (
            <div className="mt-1.5 flex gap-2">
              <select aria-label="Fuel price" value={st.fuelMultiplier} onChange={(e) => set({ fuelMultiplier: Number(e.target.value) })} className="h-[24px] rounded-sm border border-line bg-panel px-1 text-[12px] text-ink">
                {[0.7, 1, 1.3, 1.6, 2].map((x) => <option key={x} value={x}>fuel {x}×</option>)}
              </select>
              <select aria-label="Cargo urgency" value={st.urgency} onChange={(e) => set({ urgency: e.target.value as typeof st.urgency })} className="h-[24px] rounded-sm border border-line bg-panel px-1 text-[12px] text-ink">
                <option value="low">low urgency</option><option value="medium">medium urgency</option><option value="high">high urgency</option>
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <Tip width={260} content="Replay the plan if the closure lasts half, one, two or three times as long as expected.">
            <button onClick={() => openPanel("stress")} className="flex h-[28px] items-center gap-1.5 rounded-sm border border-red/60 px-2.5 text-[12px] text-ink hover:bg-raised">
              <ShieldAlert size={14} strokeWidth={1.5} className="text-red" /> What if we’re wrong?
            </button>
          </Tip>
          <button onClick={() => openPanel("fleet")} className="flex h-[28px] items-center gap-1.5 rounded-sm border border-line-2 px-2.5 text-[12px] text-ink hover:bg-raised">
            <Table2 size={14} strokeWidth={1.5} /> Ship by ship
          </button>
        </div>
      </>}
    />
  );
}
