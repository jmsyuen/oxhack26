import type { ImpactEngine } from "../engine/engine";
import type { Blockage, CpRoute } from "../engine/types";
import { haversineKm } from "../engine/geo";
import type { RiskPreference, Urgency } from "./assumptions";
import { generateFleet, type Vessel } from "./fleet";
import { forecast, typeMix, type Forecast } from "./forecast";
import { optimise, type McResult } from "./montecarlo";
import { fluidQueue, type FluidDay } from "./queue";
import { hashSeed } from "./rng";
import type { ModelData } from "./types";

export interface DecisionSettings {
  originIdx: number;
  windowDays: number;
  uncertainty: number;
  risk: RiskPreference;
  fuelMultiplier: number;
  urgency: Urgency;
  samples: number;
}

export interface Target {
  cpIdx: number;
  cpId: string;
  cpName: string;
  blockageId: string;
  expectedDays: number;
  severity: number;
}

/** Best / middle / worst case: the 10th, 50th and 90th percentile of the Monte Carlo closure-duration draws. */
export interface Outcome {
  key: "best" | "middle" | "worst";
  label: string;
  days: number;
  timeline: FluidDay[];
  peakQueue: number;
  clearDay: number | null;
  /** fleet cost under the recommended plan and if every ship waited, at the same percentile of the draws */
  planCost: number;
  waitCost: number;
  rerouteCost: number;
}

export interface DecisionResult {
  target: Target;
  outcomes: Outcome[];
  forecast: Forecast;
  routes: CpRoute[];
  fleet: Vessel[];
  mc: McResult;
  timeline: FluidDay[];
  peakQueue: number;
  clearDay: number | null;
  totalMs: number;
}

/** Which chokepoint does the scenario close? Prefer the one under the selected blockage, then the busiest. */
export function findTarget(engine: ImpactEngine, blockages: Blockage[], selectedId: string | null): Target | null {
  if (!blockages.length) return null;
  const cap = engine.edgeCapacity(blockages);
  const cps = engine.data.chokepoints;
  const hits: { i: number; sev: number; b: Blockage; d: number }[] = [];
  cps.forEach((cp, i) => {
    const n = engine.nodeIdx.get(cp.node);
    if (n === undefined) return;
    let minCap = 1;
    for (const { e } of engine.adj[n]) minCap = Math.min(minCap, cap[e]);
    if (minCap >= 1 - 1e-9) return;
    let best: Blockage | null = null, bd = Infinity;
    for (const b of blockages) {
      const d = haversineKm([cp.lon, cp.lat], [b.lon, b.lat]) - b.radiusKm;
      if (d < bd) { bd = d; best = b; }
    }
    hits.push({ i, sev: 1 - minCap, b: best!, d: bd });
  });
  if (!hits.length) return null;
  hits.sort((x, y) =>
    Number(y.b.id === selectedId) - Number(x.b.id === selectedId) || cps[y.i].shipsPerDay * y.sev - cps[x.i].shipsPerDay * x.sev);
  const h = hits[0];
  return { cpIdx: h.i, cpId: cps[h.i].id, cpName: cps[h.i].name, blockageId: h.b.id, expectedDays: h.b.durationDays, severity: h.sev };
}

export function runDecision(engine: ImpactEngine, md: ModelData, blockages: Blockage[], target: Target, s: DecisionSettings): DecisionResult {
  const t0 = performance.now();
  const fc = forecast(md, target.cpId, s.originIdx);
  const routes = engine.routesThrough(target.cpIdx, blockages, 16);
  const seed = hashSeed(`${target.cpId}:${fc.originIdx}`);
  const fleet = generateFleet(fc, typeMix(md, target.cpId, fc.originIdx), routes, engine.data.flows.commodities,
    { cpId: target.cpId, windowDays: s.windowDays, fuelMultiplier: s.fuelMultiplier, urgency: s.urgency, seed });
  const mc = optimise(fleet, {
    expectedDays: target.expectedDays, uncertainty: s.uncertainty, severity: target.severity, risk: s.risk,
    samples: s.samples, seed: seed ^ 0x5bd1e995, level: fc.level, kappa: md.queue.kappa,
  });
  // aggregate timeline at the expected duration, using the policy's wait share per arrival day
  const D = Math.min(60, Math.max(s.windowDays, Math.ceil(Math.max(target.expectedDays * 2, mc.durations.p90 * 1.6)) + 8));
  const share: number[] = [];
  const arrivals: number[] = [];
  let totW = 0, totN = 0;
  for (let d = 0; d < Math.min(D, s.windowDays); d++) {
    const ids = fleet.map((v, i) => [v, i] as const).filter(([v]) => Math.floor(v.arrival) === d);
    const w = ids.filter(([, i]) => mc.decisions[i].wait).length;
    totW += w; totN += ids.length;
    share.push(ids.length ? w / ids.length : 1);
    arrivals.push(fc.days[d]?.mean ?? fc.weekMean);
  }
  const later = totN ? totW / totN : 1;
  for (let d = share.length; d < D; d++) { share.push(later); arrivals.push(fc.weekMean); }
  const sim = (reopen: number) => {
    const tl = fluidQueue({ arrivals, waitShare: share, level: fc.level, kappa: md.queue.kappa, severity: target.severity, closedFrom: 0, reopen });
    const c = tl.findIndex((d) => d.day >= reopen && d.queue < 0.5);
    return { timeline: tl, peakQueue: Math.max(0, ...tl.map((d) => d.queue)), clearDay: c >= 0 ? c : null };
  };
  const main = sim(target.expectedDays);
  const S = mc.strategies;
  const outcomes: Outcome[] = ([["best", "Best case", "p10"], ["middle", "Middle", "p50"], ["worst", "Worst case", "p90"]] as const).map(([key, label, q]) => ({
    key, label, days: mc.durations[q], ...sim(mc.durations[q]), planCost: S.mc[q], waitCost: S.wait[q], rerouteCost: S.reroute[q],
  }));
  return { target, outcomes, forecast: fc, routes, fleet, mc, timeline: main.timeline, peakQueue: main.peakQueue, clearDay: main.clearDay, totalMs: performance.now() - t0 };
}

/** Re-run the Ever Given calibration in TypeScript (checks the TS queue against the Python fit and the observations). */
export function everGivenCheck(md: ModelData) {
  const q = md.queue;
  const arrivals = q.dates.map((_, d) => (d < 7 ? q.forecast[d] : q.forecast.reduce((a, b) => a + b, 0) / q.forecast.length));
  const days = fluidQueue({
    arrivals, waitShare: arrivals.map(() => 1), level: q.level, kappa: q.kappa, severity: q.severity, closedFrom: q.closedFromDay, reopen: q.reopenDay,
  });
  // the Python model diverts rho × the closed fraction of each day's arrivals; reproduce exactly
  let qq = 0;
  const sim = arrivals.map((a, d) => {
    const closed = Math.max(0, Math.min(d + 1, q.reopenDay) - Math.max(d, q.closedFromDay));
    const cap = q.kappa * q.level * (1 - closed + closed * (1 - q.severity));
    const join = a * (1 - q.rho * closed);
    const served = Math.min(qq + join, cap);
    qq += join - served;
    return { date: q.dates[d], observed: q.observed[d], simulated: served, queue: qq };
  });
  const rmse = Math.sqrt(sim.reduce((s, r) => s + (r.simulated - r.observed) ** 2, 0) / sim.length);
  return { sim, rmse, maxDiffVsPython: Math.max(...sim.map((r, i) => Math.abs(r.simulated - q.simulated[i]))), noDiversion: days };
}
