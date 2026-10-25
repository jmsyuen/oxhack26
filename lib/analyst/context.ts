import type { ImpactEngine } from "../engine/engine";
import type { Blockage, ScenarioResult } from "../engine/types";
import type { DecisionSettingsState } from "../decisionStore";
import { runDecision, type DecisionResult } from "../models/decision";
import type { ModelData } from "../models/types";
import { VESSEL_SPECS } from "../models/assumptions";

const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => Math.round(x * 10) / 10;
const musd = (x: number) => Math.round(x / 1e5) / 10; // USD → $m, 1 dp

export interface AnalystEnv {
  engine: ImpactEngine;
  md: ModelData;
  blockages: Blockage[];
  trade: ScenarioResult | null;
  decision: DecisionResult | null;
  settings: DecisionSettingsState;
}

export function decisionSummary(d: DecisionResult) {
  const S = d.mc.strategies;
  const row = (k: keyof typeof S) => ({ best_case_p10_musd: musd(S[k].p10), middle_p50_musd: musd(S[k].p50), mean_musd: musd(S[k].mean), worst_case_p90_musd: musd(S[k].p90), cvar95_musd: musd(S[k].cvar95), missed_deadline_pct: r1(S[k].missedPct), mean_delay_days: r1(S[k].meanDelayDays), rerouted_pct: r0(S[k].reroutePct) });
  return {
    chokepoint: d.target.cpName, closure_expected_days: d.target.expectedDays, capacity_removed_pct: r0(d.target.severity * 100),
    vessels_in_window: d.fleet.length, wait: d.mc.counts.wait, reroute: d.mc.counts.reroute, no_sea_alternative: d.mc.counts.noAlternative,
    objective: d.mc.objective, best_simple_rule: d.mc.bestRule, saving_vs_best_rule_musd: musd(d.mc.savingVsBestRule), saving_pct: r1(d.mc.savingPct),
    value_of_modelling_uncertainty_musd: musd(d.mc.vss), value_of_knowing_reopening_musd: musd(d.mc.evpi),
    strategies: { always_wait: row("wait"), always_reroute: row("reroute"), point_estimate: row("plugin"), monte_carlo: row("mc"), perfect_foresight_benchmark: row("oracle") },
    closure_duration_draws_days: { p10: r1(d.mc.durations.p10), p50: r1(d.mc.durations.p50), p90: r1(d.mc.durations.p90) },
    best_middle_worst: d.outcomes.map((o) => ({ case: o.label, reopens_after_days: r1(o.days), plan_cost_musd: musd(o.planCost), if_all_wait_musd: musd(o.waitCost), peak_queue_ships: r0(o.peakQueue), queue_cleared_by_day: o.clearDay })),
    peak_queue_ships: r0(d.peakQueue), queue_cleared_by_day: d.clearDay, samples: d.mc.samples,
  };
}

export function buildContext(env: AnalystEnv) {
  const { md, trade, decision: d, settings } = env;
  const ev = md.evaluation;
  const ctx: Record<string, unknown> = {
    note: "All scenario figures are SIMULATED/MODELLED from stated assumptions; traffic history is OBSERVED IMF PortWatch data.",
    settings: { uncertainty_cv: settings.uncertainty, risk_preference: settings.risk, fuel_multiplier: settings.fuelMultiplier, cargo_urgency: settings.urgency, decision_window_days: settings.windowDays },
  };
  if (d) {
    ctx.forecast = {
      model: "XGBoost, 114 trees, pooled over 28 PortWatch chokepoints", origin: d.forecast.originDate,
      next7_ships_per_day: d.forecast.days.map((x) => ({ date: x.date, mean: r1(x.mean), lo80: r1(x.lo80), hi80: r1(x.hi80) })),
      test_mae_suez: { xgboost: r1(ev.test.suez.xgboost.mae * 100) / 100, ma28: r1(ev.test.suez.ma28.mae * 100) / 100, naive: r1(ev.test.suez.naive.mae * 100) / 100, poisson_floor: r1(ev.test.suez.poisson_floor_mae * 100) / 100 },
    };
    ctx.decision = decisionSummary(d);
    ctx.stress_test = d.mc.stress.map((s) => ({ duration_multiple: s.mult, days: r1(s.T), policy_musd: musd(s.mc), hindsight_best_musd: musd(s.oracle), regret_pct: r1(s.regretPct), decisions_that_would_flip: s.flips.length }));
  } else ctx.decision = "No chokepoint is closed by the current blockages, so there is no vessel-level decision to make.";
  if (trade?.any) {
    ctx.trade_impact = {
      horizon_days: trade.horizonDays, trade_disrupted_musd: musd(trade.disruptedUsd), stranded_musd: musd(trade.strandedUsd), extra_shipping_cost_musd: musd(trade.extraCostUsd),
      avg_extra_transit_days: r1(trade.avgExtraDays), oil_price_pressure_pct: r0(trade.price.oilPct), lng_pct: r0(trade.price.gasPct),
      most_exposed_pct_gdp: [...trade.countries].sort((a, b) => b.pctGdp - a.pctGdp).slice(0, 5).map((c) => ({ country: c.name, pct_gdp: Math.round(c.pctGdp * 100) / 100, usd_m: musd(c.totalUsd) })),
      commodities: [...trade.commodities].sort((a, b) => b.disruptedUsd - a.disruptedUsd).slice(0, 4).map((c) => ({ commodity: c.label, disrupted_musd: musd(c.disruptedUsd) })),
      chokepoint_traffic: trade.chokepoints.filter((c) => c.blocked || Math.abs(c.shipsPct) >= 3).map((c) => ({ name: c.name, ships_per_day_before: r0(c.shipsBase), after: r0(c.shipsNew), pct: r0(c.shipsPct) })),
    };
  }
  return ctx;
}

export function vesselRow(d: DecisionResult, i: number) {
  const v = d.fleet[i], x = d.mc.decisions[i];
  return {
    id: v.id, class: VESSEL_SPECS[v.type].label, route: `${v.from} → ${v.to}`, decision: x.wait ? (v.inPort ? "hold in port" : "wait") : "reroute",
    arrives_in_days: r1(v.arrival), cargo_value_musd: musd(v.cargoUsd), schedule_buffer_days: r1(v.slackDays),
    expected_wait_cost_musd: musd(x.costWaitMean), p90_wait_cost_musd: musd(x.costWaitP90), reroute_cost_musd: x.feasible ? musd(x.costReroute) : null,
    reroute_extra_days: x.feasible ? r1(v.extraDays) : null, expected_wait_days: r1(x.meanWaitDays), ships_ahead_in_queue: x.queueAhead,
    break_even_closure_days: x.breakEvenDays === null ? null : r1(x.breakEvenDays), p_reroute_cheaper: r1(x.pRerouteBetter * 100) / 100,
    explanation: x.explanation,
  };
}

/** what-if rerun that never touches the UI state */
export function whatIf(env: AnalystEnv, p: { expected_days?: number; uncertainty?: number; risk?: string; fuel_multiplier?: number; urgency?: string }) {
  const d = env.decision;
  if (!d) return { error: "No chokepoint is closed in the current scenario." };
  const clamp = (x: unknown, lo: number, hi: number, dflt: number) => (typeof x === "number" && isFinite(x) ? Math.max(lo, Math.min(hi, x)) : dflt);
  const s = env.settings;
  const target = { ...d.target, expectedDays: clamp(p.expected_days, 0.5, 180, d.target.expectedDays) };
  const settings = {
    ...s, originIdx: s.originIdx ?? env.md.traffic.days - 1,
    uncertainty: clamp(p.uncertainty, 0.05, 2, s.uncertainty),
    risk: (["expected", "balanced", "cvar"].includes(String(p.risk)) ? p.risk : s.risk) as typeof s.risk,
    fuelMultiplier: clamp(p.fuel_multiplier, 0.3, 3, s.fuelMultiplier),
    urgency: (["low", "medium", "high"].includes(String(p.urgency)) ? p.urgency : s.urgency) as typeof s.urgency,
  };
  const r = runDecision(env.engine, env.md, env.blockages, target, settings);
  return { inputs: { expected_days: target.expectedDays, uncertainty: settings.uncertainty, risk: settings.risk, fuel_multiplier: settings.fuelMultiplier, urgency: settings.urgency }, result: decisionSummary(r) };
}
