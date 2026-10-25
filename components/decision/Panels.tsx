"use client";
import { Download, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDecisionStore } from "@/lib/decisionStore";
import { fmtMoney as fmtUsd } from "@/lib/format";
import { DECISION_FORMULAS, VESSEL_SPECS } from "@/lib/models/assumptions";
import { backtest, indexOf } from "@/lib/models/forecast";
import type { ModelData } from "@/lib/models/types";
import { runtime } from "@/lib/runtime";
import { Badge } from "../ui/Badge";
import { Segmented } from "../ui/Segmented";
import { area, fmtDate, lin, line, niceMax, useSize, YTicks } from "./charts";

export default function Panels({ md }: { md: ModelData }) {
  const panel = useDecisionStore((s) => s.panel);
  const close = () => useDecisionStore.getState().openPanel(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  if (!panel) return null;
  const title = { model: "Traffic forecaster · model info", stress: "What if we’re wrong? · stress test", fleet: "Vessel plan" }[panel];
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-bg/70 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div role="dialog" aria-label={title} className="flex max-h-[88vh] w-full max-w-[1040px] flex-col rounded-sm border border-line-2 bg-panel">
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
          <h2 className="text-[13px] font-medium text-ink">{title}</h2>
          <button onClick={close} aria-label="Close" className="ml-auto grid h-7 w-7 place-items-center rounded-sm text-mute hover:bg-raised hover:text-ink"><X size={15} strokeWidth={1.5} /></button>
        </header>
        <div className="scroll-thin min-h-0 overflow-y-auto p-4">
          {panel === "model" && <ModelCard md={md} />}
          {panel === "stress" && <StressPanel />}
          {panel === "fleet" && <FleetPanel />}
        </div>
      </div>
    </div>
  );
}

const th = "px-2 py-1 text-left text-[10px] font-medium text-faint";
const td = "num px-2 py-[3px] text-[12px]";

// ------------------------------------------------------------------ model info
function ModelCard({ md }: { md: ModelData }) {
  const ev = md.evaluation, m = ev.model;
  const result = useDecisionStore((s) => s.result);
  const cpId = result?.target.cpId ?? "suez";
  const names: Record<string, string> = { suez: "Suez Canal", bab: "Bab el-Mandeb", hormuz: "Strait of Hormuz", malacca: "Strait of Malacca", panama: "Panama Canal", cape: "Cape of Good Hope", gibraltar: "Strait of Gibraltar", bosporus: "Bosporus", dover: "Dover Strait" };
  const t0 = performance.now();
  const bt = useMemo(() => backtest(md, cpId, indexOf(md.traffic.start, "2026-01-27"), md.traffic.days - 1, 1), [md, cpId]);
  const btMs = performance.now() - t0;
  const keys = ["xgboost", "ma28", "ma7", "seasonal_naive", "naive"] as const;
  const label: Record<(typeof keys)[number], string> = { xgboost: "XGBoost", ma28: "28-day mean", ma7: "7-day mean", seasonal_naive: "Same day last week", naive: "Yesterday" };
  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <div className="space-y-3 text-[12px]">
        <p className="leading-relaxed text-mute">One XGBoost model forecasts daily transits 1–7 days ahead at any chokepoint. Horizon is a feature; levels are divided by the 28-day mean so one model fits canals of every size.</p>
        <dl className="grid grid-cols-[110px_1fr] gap-y-1">
          {[
            ["Model", `${m.family}`], ["Trees", `${m.trees} (depth ${m.maxDepth}, η ${m.learningRate}, early-stopped)`], ["Features", `${m.features}: lags 0–13, 20, 27, same weekday −7/−14, 3/7-day means, trend, volatility, min, Poisson z-score of level shift, weekday, horizon`],
            ["Training rows", `${m.trainRows.toLocaleString()} across ${m.chokepointsPooled} chokepoints`], ["Train", `${m.train[0]} → ${m.train[1]}`], ["Validation", `${m.validation[0]} → ${m.validation[1]} (early stopping, interval calibration)`],
            ["Test (held out)", `${m.test[0]} → ${m.test[1]}`], ["Data", `${m.data}, OBSERVED`], ["Intervals", "split-conformal on |y − ŷ| / √ŷ, per chokepoint × horizon"],
            ["In-browser", `TypeScript tree walker, parity with Python XGBoost < 0.0001 ships/day; ${bt.length} backtest forecasts in ${btMs.toFixed(0)} ms`],
          ].flatMap(([k, v]) => [<dt key={`k${k}`} className="text-faint">{k}</dt>, <dd key={`v${k}`} className="text-ink">{v}</dd>])}
        </dl>
        <div>
          <h3 className="lbl mb-1.5">Feature importance (gain)</h3>
          <ul className="space-y-[3px]">
            {ev.importance.slice(0, 8).map((f) => (
              <li key={f.feature} className="grid grid-cols-[100px_1fr_36px] items-center gap-2">
                <span className="num truncate text-[11px] text-mute">{f.feature}</span>
                <span className="h-[7px] rounded-[1px] bg-line/60"><span className="block h-full rounded-[1px] bg-cyan/70" style={{ width: `${(f.share / ev.importance[0].share) * 100}%` }} /></span>
                <span className="num text-right text-[11px] text-mute">{(f.share * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="min-w-0 space-y-4">
        <div>
          <h3 className="lbl mb-1">Held-out test error, mean absolute error (ships/day)</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-line"><th className={th}>Chokepoint</th>{keys.map((k) => <th key={k} className={`${th} text-right`}>{label[k]}</th>)}<th className={`${th} text-right`}>Noise floor</th><th className={`${th} text-right`}>80% / 95% coverage</th></tr></thead>
              <tbody>
                {Object.entries(ev.test).map(([id, e]) => {
                  const best = Math.min(...keys.map((k) => e[k].mae));
                  return (
                    <tr key={id} className={`border-b border-line/60 ${id === cpId ? "bg-raised" : ""}`}>
                      <td className="px-2 py-[3px] text-[12px] text-ink">{names[id] ?? id}</td>
                      {keys.map((k) => <td key={k} className={`${td} text-right ${e[k].mae <= best + 1e-9 ? "text-green" : "text-mute"}`}>{e[k].mae.toFixed(2)}</td>)}
                      <td className={`${td} text-right text-faint`}>{e.poisson_floor_mae.toFixed(2)}</td>
                      <td className={`${td} text-right text-mute`}>{Math.round(e.coverage80 * 100)}% / {Math.round(e.coverage95 * 100)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-mute">Green = best in row. Daily transits behave like Poisson counts around their level (Suez dispersion index {ev.dispersionIndexSuez.toFixed(2)}): the model sits on that noise floor, so what remains is irreducible arrival randomness, which the simulator and Monte Carlo carry forward instead of pretending to predict.</p>
        </div>
        <Backtest data={bt} />
        <div>
          <h3 className="lbl mb-1">Known weakness: abrupt regime shifts</h3>
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-line"><th className={th}>Window</th>{(["xgboost", "ma28", "ma7", "naive"] as const).map((k) => <th key={k} className={`${th} text-right`}>{label[k]}</th>)}</tr></thead>
            <tbody>{ev.shifts.map((s) => (
              <tr key={s.label} className="border-b border-line/60">
                <td className="px-2 py-[3px] text-[12px] text-ink">{s.label} <span className="text-faint">{s.from} → {s.to}</span></td>
                {(["xgboost", "ma28", "ma7", "naive"] as const).map((k) => <td key={k} className={`${td} text-right text-mute`}>{s[k].mae.toFixed(2)}</td>)}
              </tr>))}
            </tbody>
          </table>
          <p className="mt-1.5 text-[11px] leading-relaxed text-mute">When traffic collapses overnight the model beats the 28-day mean but trails “use yesterday”: it forecasts normal traffic, and disruptions are what the simulator is for.</p>
        </div>
      </div>
    </div>
  );
}

function Backtest({ data }: { data: ReturnType<typeof backtest> }) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const h = 150, L = 28, R = 6, T = 6, B = 16;
  if (!data.length) return null;
  const ymax = niceMax(Math.max(...data.map((d) => Math.max(d.actual, d.hi))) * 1.05);
  const X = lin(0, data.length - 1, L, w - R), Y = lin(0, ymax, h - B, T);
  return (
    <div>
      <h3 className="lbl mb-1">Live backtest, last 6 months: day-ahead forecast (cyan, 80% band) vs observed (dots)</h3>
      <div ref={ref} className="relative" style={{ height: h }}>
        <svg width={w} height={h} className="absolute inset-0" role="img" aria-label="Backtest chart">
          <YTicks y={Y} max={ymax} x0={L} x1={w - R} />
          <path d={area(data.map((d, i) => [X(i), Y(d.hi)]), data.map((d, i) => [X(i), Y(d.lo)]))} fill="var(--color-cyan)" opacity={0.15} />
          <path d={line(data.map((d, i) => [X(i), Y(d.pred)]))} fill="none" stroke="var(--color-cyan)" strokeWidth={1.3} />
          {data.map((d, i) => <circle key={d.idx} cx={X(i)} cy={Y(d.actual)} r={1.6} fill={d.actual < d.lo || d.actual > d.hi ? "var(--color-amber)" : "var(--color-ink)"} />)}
          <text x={L} y={h - 3} fontSize={9} className="num" fill="var(--color-faint)">{fmtDate(data[0].date, true)}</text>
          <text x={w - R} y={h - 3} fontSize={9} textAnchor="end" className="num" fill="var(--color-faint)">{fmtDate(data[data.length - 1].date, true)}</text>
        </svg>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ stress test
function StressPanel() {
  const r = useDecisionStore((s) => s.result);
  const [ref, { w }] = useSize<HTMLDivElement>();
  if (!r) return <p className="text-[12px] text-mute">Close a chokepoint first.</p>;
  const { grid, curve, stress } = r.mc;
  const h = 220, L = 46, R = 10, T = 8, B = 20;
  const ymax = niceMax(Math.max(...Array.from(curve.wait), ...Array.from(curve.reroute)) * 1.02);
  const X = lin(0, grid[grid.length - 1], L, w - R), Y = lin(0, ymax, h - B, T);
  const pts = (a: Float64Array) => Array.from(a, (v, i) => [X(grid[i]), Y(v)] as [number, number]);
  let cross: number | null = null;
  for (let i = 1; i < grid.length; i++) if (curve.wait[i - 1] <= curve.reroute[i - 1] && curve.wait[i] > curve.reroute[i]) { cross = grid[i]; break; }
  const D = r.mc.durations;
  return (
    <div className="space-y-4">
      <p className="max-w-[760px] text-[12px] leading-relaxed text-mute">
        The plan was chosen for an expected {r.target.expectedDays}-day closure with {Math.round(useDecisionStore.getState().settings.uncertainty * 100)}% uncertainty. Here the true duration is fixed and the same decisions are replayed.
        Regret is the extra cost against the decisions that would have been best in hindsight. {cross !== null ? `Waiting stops beating a blanket reroute at about ${cross.toFixed(0)} days.` : "Within this range, waiting always beats a blanket reroute."}
      </p>
      <table className="w-full border-collapse">
        <thead><tr className="border-b border-line">{["True duration", "Plan cost", "Hindsight best", "Regret", "Always wait", "Always reroute", "Decisions that flip", "Verdict"].map((x, i) => <th key={x} className={`${th} ${i ? "text-right" : ""}`}>{x}</th>)}</tr></thead>
        <tbody>
          {stress.map((s) => (
            <tr key={s.mult} className={`border-b border-line/60 ${s.mult === 1 ? "bg-raised" : ""}`}>
              <td className="px-2 py-1 text-[12px] text-ink">{s.mult}× <span className="num text-mute">({s.T.toFixed(1)} d)</span></td>
              <td className={`${td} text-right text-ink`}>{fmtUsd(s.mc)}</td>
              <td className={`${td} text-right text-mute`}>{fmtUsd(s.oracle)}</td>
              <td className={`${td} text-right ${s.regretPct > 10 ? "text-red" : s.regretPct > 2 ? "text-amber" : "text-green"}`}>{s.regretPct.toFixed(1)}%</td>
              <td className={`${td} text-right text-mute`}>{fmtUsd(s.wait)}</td>
              <td className={`${td} text-right text-mute`}>{fmtUsd(s.reroute)}</td>
              <td className={`${td} text-right text-mute`}>{s.flips.length}</td>
              <td className="px-2 py-1 text-right text-[12px]">{s.stillBest ? <span className="text-green">beats both simple rules</span> : <span className="text-red">switch: more ships should {s.mc > s.reroute ? "reroute" : "wait"}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <h3 className="lbl mb-1">Break-even: fleet cost vs true closure duration</h3>
        <div ref={ref} className="relative" style={{ height: h }}>
          <svg width={w} height={h} className="absolute inset-0" role="img" aria-label="Fleet cost by closure duration for each strategy">
            <rect x={X(D.p10)} width={Math.max(1, X(D.p90) - X(D.p10))} y={T} height={h - B - T} fill="var(--color-cyan)" opacity={0.07} />
            <YTicks y={Y} max={ymax} x0={L} x1={w - R} n={4} fmt={(v) => fmtUsd(v)} />
            <path d={line(pts(curve.reroute))} fill="none" stroke="var(--color-amber)" strokeWidth={1.4} />
            <path d={line(pts(curve.wait))} fill="none" stroke="var(--color-cyan)" strokeWidth={1.4} />
            <path d={line(pts(curve.oracle))} fill="none" stroke="var(--color-faint)" strokeWidth={1} strokeDasharray="3 3" />
            <path d={line(pts(curve.mc))} fill="none" stroke="var(--color-green)" strokeWidth={2} />
            <line x1={X(r.target.expectedDays)} x2={X(r.target.expectedDays)} y1={T} y2={h - B} stroke="var(--color-ink)" strokeDasharray="2 3" />
            <text x={X(r.target.expectedDays) + 4} y={T + 10} fontSize={10} fill="var(--color-ink)">expected</text>
            {[0, 0.25, 0.5, 0.75, 1].map((f) => { const v = f * grid[grid.length - 1]; return <text key={f} x={X(v)} y={h - 4} fontSize={9} textAnchor="middle" className="num" fill="var(--color-faint)">{v.toFixed(0)} d</text>; })}
          </svg>
        </div>
        <div className="mt-1 flex flex-wrap gap-4 text-[11px] text-mute">
          <span><i className="mr-1 inline-block h-[2px] w-3 bg-green align-middle" />Monte Carlo plan</span>
          <span><i className="mr-1 inline-block h-[2px] w-3 bg-cyan align-middle" />Always wait</span>
          <span><i className="mr-1 inline-block h-[2px] w-3 bg-amber align-middle" />Always reroute</span>
          <span><i className="mr-1 inline-block h-[2px] w-3 bg-faint align-middle" />Hindsight best (benchmark only)</span>
          <span><i className="mr-1 inline-block h-2 w-3 bg-cyan/20 align-middle" />P10–P90 of the duration prior ({D.p10.toFixed(1)}–{D.p90.toFixed(1)} d)</span>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ fleet table + vessel detail
type SortKey = "arrival" | "wait" | "reroute" | "be" | "p" | "buffer";
function FleetPanel() {
  const r = useDecisionStore((s) => s.result);
  const vesselId = useDecisionStore((s) => s.vesselId);
  const select = useDecisionStore((s) => s.selectVessel);
  const [filter, setFilter] = useState<"all" | "wait" | "reroute">("all");
  const [sort, setSort] = useState<SortKey>("arrival");
  if (!r) return <p className="text-[12px] text-mute">Close a chokepoint first.</p>;
  const D = r.mc.decisions;
  const key: Record<SortKey, (i: number) => number> = {
    arrival: (i) => r.fleet[i].arrival, wait: (i) => -D[i].costWaitMean, reroute: (i) => (isFinite(D[i].costReroute) ? D[i].costReroute : 1e15),
    be: (i) => D[i].breakEvenDays ?? 1e9, p: (i) => -D[i].pRerouteBetter, buffer: (i) => r.fleet[i].slackDays,
  };
  const idx = r.fleet.map((_, i) => i).filter((i) => filter === "all" || (filter === "wait") === D[i].wait).sort((a, b) => key[sort](a) - key[sort](b));
  const sel = r.fleet.findIndex((v) => v.id === vesselId);
  const exportCsv = () => {
    const head = "id,class,from,to,arrival_days,buffer_days,decision,expected_wait_cost_usd,p90_wait_cost_usd,reroute_cost_usd,reroute_extra_days,break_even_days,p_reroute_cheaper,explanation";
    const rows = r.fleet.map((v, i) => [v.id, VESSEL_SPECS[v.type].label, v.from, v.to, v.arrival.toFixed(2), v.slackDays.toFixed(1), D[i].wait ? "wait" : "reroute",
      D[i].costWaitMean.toFixed(0), D[i].costWaitP90.toFixed(0), isFinite(D[i].costReroute) ? D[i].costReroute.toFixed(0) : "", isFinite(v.extraDays) ? v.extraDays.toFixed(1) : "",
      D[i].breakEvenDays?.toFixed(1) ?? "", D[i].pRerouteBetter.toFixed(3), `"${D[i].explanation.replace(/"/g, "'")}"`].join(","));
    void runtime.saveFile(`chokepoint-${r.target.cpId}-${r.target.expectedDays}d-plan.csv`, [head, ...rows].join("\n"));
  };
  const H = ({ k, children, right = true }: { k?: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={`${th} ${right ? "text-right" : ""}`}>
      {k ? <button onClick={() => setSort(k)} className={`hover:text-ink ${sort === k ? "text-ink" : ""}`}>{children}{sort === k ? " ↓" : ""}</button> : children}
    </th>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2">
          <Segmented label="Filter" value={filter} onChange={setFilter} options={[{ value: "all", label: `All ${r.fleet.length}` }, { value: "wait", label: `Wait ${r.mc.counts.wait}` }, { value: "reroute", label: `Reroute ${r.mc.counts.reroute}` }]} />
          <Badge kind="SIMULATED" title="Synthetic vessels" />
          <button onClick={exportCsv} className="ml-auto flex h-[24px] items-center gap-1.5 rounded-sm border border-line-2 px-2 text-[11px] text-ink hover:bg-raised"><Download size={13} strokeWidth={1.5} /> Export CSV</button>
        </div>
        <div className="scroll-thin max-h-[60vh] overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-panel"><tr className="border-b border-line">
              <H right={false}>Vessel</H><H right={false}>Route</H><H k="arrival">Due in</H><H k="buffer">Buffer</H><H right={false}>Plan</H>
              <H k="wait">E[wait cost]</H><H k="reroute">Reroute cost</H><H k="be">Break-even</H><H k="p">P(reroute cheaper)</H>
            </tr></thead>
            <tbody>
              {idx.map((i) => {
                const v = r.fleet[i], d = D[i];
                return (
                  <tr key={v.id} onClick={() => select(v.id)} className={`cursor-pointer border-b border-line/50 hover:bg-raised ${v.id === vesselId ? "bg-raised" : ""}`}>
                    <td className="px-2 py-[3px] text-[12px] text-ink"><span className="num">{v.id}</span> <span className="text-faint">{VESSEL_SPECS[v.type].label}</span></td>
                    <td className="max-w-[220px] truncate px-2 py-[3px] text-[12px] text-mute">{v.from} → {v.to}</td>
                    <td className={`${td} text-right text-mute`}>{v.arrival.toFixed(1)} d</td>
                    <td className={`${td} text-right text-mute`}>{v.slackDays.toFixed(0)} d</td>
                    <td className={`px-2 py-[3px] text-[12px] ${d.wait ? "text-cyan" : "text-amber"}`}>{d.wait ? (v.inPort ? "hold in port" : "wait") : "reroute"}{!d.feasible && <span className="text-faint"> · no alt</span>}</td>
                    <td className={`${td} text-right text-ink`}>{fmtUsd(d.costWaitMean)}</td>
                    <td className={`${td} text-right text-mute`}>{isFinite(d.costReroute) ? fmtUsd(d.costReroute) : "—"}</td>
                    <td className={`${td} text-right text-mute`}>{d.breakEvenDays === null ? "—" : `${d.breakEvenDays.toFixed(1)} d`}</td>
                    <td className={`${td} text-right text-mute`}>{(d.pRerouteBetter * 100).toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <VesselDetail i={sel >= 0 ? sel : idx[0] ?? 0} />
    </div>
  );
}

function VesselDetail({ i }: { i: number }) {
  const r = useDecisionStore((s) => s.result)!;
  const [ref, { w }] = useSize<HTMLDivElement>();
  const v = r.fleet[i], d = r.mc.decisions[i];
  if (!v) return null;
  const g = r.mc.grid, c = d.waitCurve;
  const h = 150, L = 40, R = 6, T = 6, B = 16;
  const ymax = niceMax(Math.max(...Array.from(c), isFinite(d.costReroute) ? d.costReroute : 0) * 1.05);
  const X = lin(0, g[g.length - 1], L, w - R), Y = lin(0, ymax, h - B, T);
  return (
    <aside className="space-y-2 rounded-sm border border-line p-3">
      <div className="flex items-center gap-2">
        <span className="num text-[14px] text-ink">{v.id}</span>
        <span className="text-[12px] text-mute">{VESSEL_SPECS[v.type].label}</span>
        <span className={`ml-auto rounded-sm border px-1.5 text-[11px] ${d.wait ? "border-cyan/50 text-cyan" : "border-amber/50 text-amber"}`}>{d.wait ? (v.inPort ? "Hold in port" : "Wait") : "Reroute"}</span>
      </div>
      <p className="text-[12px] text-mute">{v.from} → {v.to} · due in {v.arrival.toFixed(1)} d · {v.inPort ? "still in port" : `${Math.round(v.distToCpNm)} nm out`} · cargo {fmtUsd(v.cargoUsd)}</p>
      <p className="text-[12px] leading-relaxed text-ink">{d.explanation}</p>
      <div ref={ref} className="relative" style={{ height: h }}>
        <svg width={w} height={h} className="absolute inset-0" role="img" aria-label="Cost of waiting vs rerouting by closure duration">
          <YTicks y={Y} max={ymax} x0={L} x1={w - R} n={3} fmt={(x) => fmtUsd(x)} />
          {isFinite(d.costReroute) && <line x1={L} x2={w - R} y1={Y(d.costReroute)} y2={Y(d.costReroute)} stroke="var(--color-amber)" strokeWidth={1.4} />}
          <path d={line(Array.from(c, (x, k) => [X(g[k]), Y(x)] as [number, number]))} fill="none" stroke="var(--color-cyan)" strokeWidth={1.4} />
          {d.breakEvenDays !== null && <line x1={X(d.breakEvenDays)} x2={X(d.breakEvenDays)} y1={T} y2={h - B} stroke="var(--color-ink)" strokeDasharray="2 3" />}
          {[0, 0.5, 1].map((f) => <text key={f} x={X(f * g[g.length - 1])} y={h - 3} fontSize={9} textAnchor="middle" className="num" fill="var(--color-faint)">{(f * g[g.length - 1]).toFixed(0)} d</text>)}
        </svg>
      </div>
      <p className="text-[11px] text-faint"><span className="text-cyan">Wait</span> cost rises with the closure (queue ahead included); <span className="text-amber">reroute</span> is fixed. {DECISION_FORMULAS.reroute.split(".")[0]}.</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
        <dt className="text-faint">Expected wait</dt><dd className="num text-right text-ink">{d.meanWaitDays.toFixed(1)} d (P90 {d.p90WaitDays.toFixed(1)})</dd>
        <dt className="text-faint">Ships ahead</dt><dd className="num text-right text-ink">{d.queueAhead}</dd>
        <dt className="text-faint">Detour</dt><dd className="num text-right text-ink">{isFinite(v.extraDays) ? `+${v.extraDays.toFixed(1)} d, ${Math.round(v.extraNm)} nm` : "none"}</dd>
        <dt className="text-faint">Toll avoided</dt><dd className="num text-right text-ink">{fmtUsd(v.toll)}</dd>
        <dt className="text-faint">Wait cost P10–P90</dt><dd className="num text-right text-ink">{fmtUsd(d.costWaitP10)}–{fmtUsd(d.costWaitP90)}</dd>
        <dt className="text-faint">Daily cost wait / sea</dt><dd className="num text-right text-ink">{fmtUsd(v.waitPerDay)} / {fmtUsd(v.seaPerDay)}</dd>
      </dl>
    </aside>
  );
}
