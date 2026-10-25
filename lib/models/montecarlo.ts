import { DECISION_FORMULAS, type RiskPreference } from "./assumptions";
import type { Vessel } from "./fleet";
import { lognormalDurations } from "./rng";

/**
 * Monte Carlo wait-vs-reroute optimiser.
 *
 * Queue: vessels reach the chokepoint at their arrival times and are served FIFO. While closed the chokepoint
 * serves (1 − severity) × κ × level ships/day (zero for a full closure); after reopening, κ × level.
 * Because service is FIFO, a vessel's delay depends only on the vessels ahead of it, so deciding in arrival order
 * gives every vessel a queue that is consistent with the earlier vessels' decisions, for every sampled duration.
 */

export interface McParams {
  expectedDays: number;
  uncertainty: number;
  severity: number;
  risk: RiskPreference;
  samples: number;
  seed: number;
  level: number;
  kappa: number;
}

export interface VesselDecision {
  id: string;
  wait: boolean;
  feasible: boolean;
  costWaitMean: number;
  costWaitP10: number;
  costWaitP90: number;
  costWaitCvar: number;
  costReroute: number;
  pRerouteBetter: number;
  meanWaitDays: number;
  p90WaitDays: number;
  queueAhead: number;
  breakEvenDays: number | null;
  /** expected saving of the chosen action against the other one (USD, ≥ 0 under the expected-cost rule) */
  edge: number;
  explanation: string;
  /** wait cost along the duration grid (given the queue ahead under the chosen policy) */
  waitCurve: Float64Array;
}

export type StrategyId = "wait" | "reroute" | "plugin" | "mc" | "oracle";
export interface StrategyStats {
  id: StrategyId;
  label: string;
  mean: number; p10: number; p50: number; p90: number; p95: number; cvar95: number;
  missedPct: number; meanDelayDays: number; reroutePct: number;
  samples: Float64Array;
}

export interface McResult {
  decisions: VesselDecision[];
  counts: { wait: number; reroute: number; noAlternative: number; inPortHold: number };
  strategies: Record<StrategyId, StrategyStats>;
  bestRule: StrategyId;
  /** saving on the chosen risk measure (expected cost, CVaR 95% or the blend) */
  savingVsBestRule: number;
  objective: string;
  savingPct: number;
  vss: number;
  evpi: number;
  grid: Float64Array;
  curve: Record<"mc" | "wait" | "reroute" | "oracle", Float64Array>;
  stress: { mult: number; T: number; mc: number; oracle: number; wait: number; reroute: number; regret: number; regretPct: number; flips: string[]; stillBest: boolean }[];
  ratesPerDay: { open: number; closed: number };
  samples: number;
  durations: { mean: number; p10: number; p50: number; p90: number };
  ms: number;
}

const EPS = 1e-9;

function quantileInPlace(a: Float64Array, q: number): number {
  // quickselect on a scratch copy
  const n = a.length;
  if (!n) return 0;
  let k = Math.min(n - 1, Math.max(0, Math.floor(q * (n - 1))));
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const pivot = a[(lo + hi) >> 1];
    let i = lo, j = hi;
    while (i <= j) {
      while (a[i] < pivot) i++;
      while (a[j] > pivot) j--;
      if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
    }
    if (k <= j) hi = j; else if (k >= i) lo = i; else break;
  }
  return a[k];
}

function stats(x: Float64Array) {
  const n = x.length;
  let s = 0;
  for (let i = 0; i < n; i++) s += x[i];
  const c = Float64Array.from(x);
  const p10 = quantileInPlace(c, 0.1), p50 = quantileInPlace(c, 0.5), p90 = quantileInPlace(c, 0.9), p95 = quantileInPlace(c, 0.95);
  let tail = 0, m = 0;
  for (let i = 0; i < n; i++) if (x[i] >= p95) { tail += x[i]; m++; }
  return { mean: s / Math.max(1, n), p10, p50, p90, p95, cvar95: m ? tail / m : p95 };
}

type Mode =
  | { kind: "fixed"; wait: Uint8Array }
  | { kind: "decide"; risk: RiskPreference; nStat: number }
  | { kind: "oracle" };

interface PassOut {
  fleetCost: Float64Array;
  delay: Float64Array;
  missed: Float64Array;
  rerouted: Float64Array;
  wait?: Uint8Array;
  perVessel?: { mean: number; p10: number; p90: number; cvar: number; pR: number; mW: number; p90W: number; ahead: number; curve: Float64Array }[];
}

function pass(fleet: Vessel[], T: Float64Array, open: number, closed: number, mode: Mode, gridFrom = -1): PassOut {
  const S = T.length;
  const free = new Float64Array(S);
  const start = new Float64Array(S);
  const cw = new Float64Array(S);
  const fleetCost = new Float64Array(S), delay = new Float64Array(S), missed = new Float64Array(S), rerouted = new Float64Array(S);
  const dtOpen = 1 / Math.max(open, EPS);
  const dtClosed = closed > EPS ? 1 / closed : Infinity;
  const wait = mode.kind === "decide" ? new Uint8Array(fleet.length) : undefined;
  const perVessel: PassOut["perVessel"] = mode.kind === "decide" ? [] : undefined;
  const nStat = mode.kind === "decide" ? mode.nStat : S;
  const scratch = new Float64Array(nStat);
  let ahead = 0;
  fleet.forEach((v, i) => {
    const a = v.arrival;
    for (let s = 0; s < S; s++) {
      let st = a > free[s] ? a : free[s];
      if (st < T[s] && dtClosed === Infinity) st = T[s];
      start[s] = st;
      const W = st - a;
      cw[s] = W * v.waitPerDay + (W > v.slackDays ? (W - v.slackDays) * v.penaltyPerDay : 0);
    }
    const cr = v.rerouteCost;
    let decideWait: boolean | null = null;
    if (mode.kind === "fixed") decideWait = !!mode.wait[i];
    else if (mode.kind === "decide") {
      let sum = 0, nR = 0, sumW = 0;
      for (let s = 0; s < nStat; s++) { sum += cw[s]; if (cw[s] > cr) nR++; sumW += start[s] - a; scratch[s] = cw[s]; }
      const mean = sum / nStat;
      const p95 = quantileInPlace(scratch, 0.95);
      let tail = 0, m = 0;
      for (let s = 0; s < nStat; s++) if (cw[s] >= p95) { tail += cw[s]; m++; }
      const cvar = m ? tail / m : p95;
      const p10 = quantileInPlace(scratch, 0.1), p90 = quantileInPlace(scratch, 0.9);
      for (let s = 0; s < nStat; s++) scratch[s] = start[s] - a;
      const p90W = quantileInPlace(scratch, 0.9);
      const risk = mode.risk === "expected" ? mean : mode.risk === "cvar" ? cvar : 0.5 * mean + 0.5 * cvar;
      decideWait = !v.feasible || risk <= cr;
      wait![i] = decideWait ? 1 : 0;
      const curve = gridFrom >= 0 ? cw.slice(gridFrom) : new Float64Array(0);
      perVessel!.push({ mean, p10, p90, cvar, pR: nR / nStat, mW: sumW / nStat, p90W, ahead, curve });
    }
    for (let s = 0; s < S; s++) {
      const w = decideWait ?? (!v.feasible || cw[s] <= cr);
      if (w) {
        const st = start[s];
        free[s] = st + (st < T[s] ? dtClosed : dtOpen);
        fleetCost[s] += cw[s];
        const W = st - a;
        delay[s] += W;
        if (W > v.slackDays) missed[s]++;
      } else {
        fleetCost[s] += cr;
        delay[s] += v.extraDays;
        rerouted[s]++;
        if (v.extraDays > v.slackDays) missed[s]++;
      }
    }
    if (decideWait) ahead++;
  });
  return { fleetCost, delay, missed, rerouted, wait, perVessel };
}

function money(v: number) {
  const a = Math.abs(v);
  return a >= 1e6 ? `$${(a / 1e6).toFixed(2)}m` : `$${Math.round(a / 1e3)}k`;
}

export function optimise(fleet: Vessel[], p: McParams): McResult {
  const t0 = performance.now();
  const open = p.kappa * p.level;
  const closed = (1 - Math.min(1, Math.max(0, p.severity))) * open;
  const S = p.samples;
  const m = Math.max(0.1, p.expectedDays);
  const Td = lognormalDurations(p.seed, S, m, p.uncertainty);
  const Te = lognormalDurations(p.seed ^ 0x9e3779b9, S, m, p.uncertainty);
  const G = 37;
  const grid = new Float64Array(G);
  const gMax = Math.max(3 * m, 4);
  for (let g = 0; g < G; g++) grid[g] = (g / (G - 1)) * gMax;
  const Tdg = new Float64Array(S + G);
  Tdg.set(Td);
  Tdg.set(grid, S);

  // 1) Monte Carlo policy (+ the duration grid riding along for break-even curves)
  const dec = pass(fleet, Tdg, open, closed, { kind: "decide", risk: p.risk, nStat: S }, S);
  const mcWait = dec.wait!;
  // 2) point-estimate policy: same rule, single duration = mean
  const plug = pass(fleet, Float64Array.of(m), open, closed, { kind: "decide", risk: "expected", nStat: 1 });
  const plugWait = plug.wait!;
  const allWait = new Uint8Array(fleet.length).fill(1);
  const allReroute = Uint8Array.from(fleet, (v) => (v.feasible ? 0 : 1));

  // 3) out-of-sample evaluation on independent draws (common random numbers across strategies)
  const n = Math.max(1, fleet.length);
  const evalOf = (id: StrategyId, label: string, o: PassOut): StrategyStats => {
    const st = stats(o.fleetCost);
    let missed = 0, del = 0, rr = 0;
    for (let s = 0; s < S; s++) { missed += o.missed[s]; del += o.delay[s]; rr += o.rerouted[s]; }
    return { id, label, ...st, missedPct: (missed / S / n) * 100, meanDelayDays: del / S / n, reroutePct: (rr / S / n) * 100, samples: o.fleetCost };
  };
  const strategies: Record<StrategyId, StrategyStats> = {
    wait: evalOf("wait", "Always wait", pass(fleet, Te, open, closed, { kind: "fixed", wait: allWait })),
    reroute: evalOf("reroute", "Always reroute", pass(fleet, Te, open, closed, { kind: "fixed", wait: allReroute })),
    plugin: evalOf("plugin", "Point estimate", pass(fleet, Te, open, closed, { kind: "fixed", wait: plugWait })),
    mc: evalOf("mc", "Monte Carlo", pass(fleet, Te, open, closed, { kind: "fixed", wait: mcWait })),
    oracle: evalOf("oracle", "Perfect foresight", pass(fleet, Te, open, closed, { kind: "oracle" })),
  };
  const obj = (x: StrategyStats) => (p.risk === "expected" ? x.mean : p.risk === "cvar" ? x.cvar95 : 0.5 * x.mean + 0.5 * x.cvar95);
  const bestRule: StrategyId = obj(strategies.wait) <= obj(strategies.reroute) ? "wait" : "reroute";
  const savingVsBestRule = obj(strategies[bestRule]) - obj(strategies.mc);

  // 4) cost vs true duration (deterministic) for each strategy, and the stress test
  const curve = {
    mc: pass(fleet, grid, open, closed, { kind: "fixed", wait: mcWait }).fleetCost,
    wait: pass(fleet, grid, open, closed, { kind: "fixed", wait: allWait }).fleetCost,
    reroute: pass(fleet, grid, open, closed, { kind: "fixed", wait: allReroute }).fleetCost,
    oracle: pass(fleet, grid, open, closed, { kind: "oracle" }).fleetCost,
  };
  const mults = [0.5, 1, 2, 3];
  const Ts = Float64Array.from(mults, (x) => x * m);
  const sMc = pass(fleet, Ts, open, closed, { kind: "fixed", wait: mcWait }).fleetCost;
  const sW = pass(fleet, Ts, open, closed, { kind: "fixed", wait: allWait }).fleetCost;
  const sR = pass(fleet, Ts, open, closed, { kind: "fixed", wait: allReroute }).fleetCost;
  const stress = mults.map((mult, j) => {
    const one = Float64Array.of(Ts[j]);
    const o = pass(fleet, one, open, closed, { kind: "decide", risk: "expected", nStat: 1 });
    const flips = fleet.filter((_, i) => !!o.wait![i] !== !!mcWait[i]).map((v) => v.id);
    const regret = sMc[j] - o.fleetCost[0];
    return { mult, T: Ts[j], mc: sMc[j], oracle: o.fleetCost[0], wait: sW[j], reroute: sR[j], regret, regretPct: o.fleetCost[0] > 0 ? (regret / o.fleetCost[0]) * 100 : 0, flips, stillBest: sMc[j] <= Math.min(sW[j], sR[j]) + 1 };
  });

  // 5) per-vessel explanations and break-even durations
  const counts = { wait: 0, reroute: 0, noAlternative: 0, inPortHold: 0 };
  const decisions: VesselDecision[] = fleet.map((v, i) => {
    const pv = dec.perVessel![i];
    const w = !!mcWait[i];
    if (w) counts.wait++; else counts.reroute++;
    if (!v.feasible) counts.noAlternative++;
    if (w && v.inPort) counts.inPortHold++;
    let be: number | null = null;
    if (v.feasible) {
      const c = pv.curve;
      for (let g = 1; g < c.length; g++) {
        if (c[g - 1] <= v.rerouteCost && c[g] > v.rerouteCost) {
          const f = (v.rerouteCost - c[g - 1]) / Math.max(EPS, c[g] - c[g - 1]);
          be = grid[g - 1] + f * (grid[g] - grid[g - 1]);
          break;
        }
      }
      if (be === null && c.length && c[0] > v.rerouteCost) be = 0;
    }
    const edge = v.feasible ? Math.abs(pv.mean - v.rerouteCost) : 0;
    let explanation: string;
    if (!v.feasible) explanation = `No sea route avoids the blockage, so it has to wait: expected queue delay ${pv.mW.toFixed(1)} d (P90 ${pv.p90W.toFixed(1)} d), expected cost ${money(pv.mean)}.`;
    else if (w)
      explanation = `${v.inPort ? "Hold in port" : "Wait"}: expected delay ${pv.mW.toFixed(1)} d ${pv.ahead ? `behind ${pv.ahead} ships` : "at the front of the queue"} costs ${money(pv.mean)}, less than the ${v.extraDays.toFixed(1)}-day reroute at ${money(v.rerouteCost)}${v.toll ? ` (after the ${money(v.toll)} toll saved)` : ""}. Reroute only pays if the closure runs past ${be === null ? "the modelled range" : `${be.toFixed(1)} d`}; chance of that ${(pv.pR * 100).toFixed(0)}%.`;
    else
      explanation = `Reroute now: the ${v.extraDays.toFixed(1)}-day detour${v.backtrackNm > 1 ? ` (incl. ${Math.round(v.backtrackNm)} nm back to the split point)` : ""} costs ${money(v.rerouteCost)} versus an expected ${money(pv.mean)} waiting ${pv.mW.toFixed(1)} d ${pv.ahead ? `behind ${pv.ahead} ships` : "at the front of the queue"}. Break-even closure ${be === null ? "n/a" : `${be.toFixed(1)} d`}; rerouting is cheaper in ${(pv.pR * 100).toFixed(0)}% of draws.`;
    return {
      id: v.id, wait: w, feasible: v.feasible, costWaitMean: pv.mean, costWaitP10: pv.p10, costWaitP90: pv.p90, costWaitCvar: pv.cvar,
      costReroute: v.rerouteCost, pRerouteBetter: pv.pR, meanWaitDays: pv.mW, p90WaitDays: pv.p90W, queueAhead: pv.ahead,
      breakEvenDays: be, edge, explanation, waitCurve: pv.curve,
    };
  });
  const dStats = stats(Td);
  return {
    decisions, counts, strategies, bestRule, savingVsBestRule,
    savingPct: obj(strategies[bestRule]) > 0 ? (savingVsBestRule / obj(strategies[bestRule])) * 100 : 0,
    vss: obj(strategies.plugin) - obj(strategies.mc), evpi: obj(strategies.mc) - obj(strategies.oracle),
    objective: p.risk === "expected" ? "expected cost" : p.risk === "cvar" ? "CVaR 95%" : "½ mean + ½ CVaR",
    grid, curve, stress, ratesPerDay: { open, closed }, samples: S,
    durations: { mean: dStats.mean, p10: dStats.p10, p50: dStats.p50, p90: dStats.p90 },
    ms: performance.now() - t0,
  };
}

export { DECISION_FORMULAS };
