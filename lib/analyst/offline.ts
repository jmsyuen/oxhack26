import { buildContext, type AnalystEnv } from "./context";
import type { ToolRunner } from "./tools";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const m = (x: number) => (Math.abs(x) >= 1000 ? `$${(x / 1000).toFixed(1)}bn` : `$${x.toFixed(1)}m`);

/** Deterministic analyst used when no LLM is configured. Every number comes from the engine or a tool call. */
export function offlineAnswer(q: string, env: AnalystEnv, run: ToolRunner): { text: string; tools: string[] } {
  const ctx = buildContext(env) as Any;
  const d = ctx.decision;
  const tools: string[] = [];
  const call = (n: string, a: Record<string, unknown> = {}) => { tools.push(n); return run(n, a) as Any; };
  if (typeof d === "string") return { text: `${d} Drop a blockage on a chokepoint such as Suez or Hormuz to get vessel-level recommendations.`, tools };
  const s = d.strategies;
  const rec = `Recommendation: ${d.reroute ? `reroute ${d.reroute} of ${d.vessels_in_window} vessels now and hold the other ${d.wait}` : `hold all ${d.vessels_in_window} vessels`}; review again as reopening news arrives.`;
  const ql = q.toLowerCase();
  if (/week|longer|extend|another|what if|double/.test(ql)) {
    const days = d.closure_expected_days + 7;
    const w = call("what_if", { expected_days: days }).result;
    return { tools, text: `In this simulated ${d.chokepoint} closure, stretching the expected closure from ${d.closure_expected_days} to ${days} days moves the plan from ${d.reroute} to ${w.reroute} reroutes. Expected fleet cost rises from ${m(s.monte_carlo.mean_musd)} to ${m(w.strategies.monte_carlo.mean_musd)}, and the saving over the best simple rule becomes ${m(w.saving_vs_best_rule_musd)} (${w.saving_pct}%). Longer closures favour ships that have not yet passed the split point, because their detour stays fixed while the queue keeps growing.\nRecommendation: pre-plan Cape routings for vessels still in port or east of Sri Lanka.` };
  }
  if (/deadline|late|risk|miss/.test(ql)) {
    const v = call("list_vessels", { decision: "any", sort_by: "deadline_risk", limit: 4 }) as Any[];
    return { tools, text: `Deadline risk is concentrated in vessels with thin schedule buffers near the back of the queue. Highest risk: ${v.map((x) => `${x.id} (${x.class}, ${x.route}, buffer ${x.schedule_buffer_days} d, ${x.decision})`).join("; ")}. Under the Monte Carlo plan ${s.monte_carlo.missed_deadline_pct}% of simulated vessels miss their buffer, versus ${s.always_wait.missed_deadline_pct}% if everyone waits.\n${rec}` };
  }
  if (/why|reroute/.test(ql) && d.reroute) {
    const v = call("list_vessels", { decision: "reroute", sort_by: "saving", limit: 3 }) as Any[];
    return { tools, text: `Rerouting wins where the detour is short relative to the expected queue: vessels that have not passed the split point, carry high-value cargo, or sit deep in the queue. ${v.map((x) => `${x.id}: ${x.explanation}`).join(" ")}\n${rec}` };
  }
  if (/fuel|sensitiv|bunker|cost/.test(ql)) {
    const hi = call("what_if", { fuel_multiplier: 1.5 }).result, lo = call("what_if", { fuel_multiplier: 0.7 }).result;
    return { tools, text: `Fuel is the main lever on detour cost. At 0.7x fuel the plan reroutes ${lo.reroute} vessels (expected ${m(lo.strategies.monte_carlo.mean_musd)}); at today's 1x, ${d.reroute} (${m(s.monte_carlo.mean_musd)}); at 1.5x, ${hi.reroute} (${m(hi.strategies.monte_carlo.mean_musd)}). Waiting burns little fuel at anchor, so dearer fuel pushes ships to wait.\n${rec}` };
  }
  if (/worst|tail|cvar|bad/.test(ql)) {
    const st = call("stress_test") as Any[];
    const t3 = st[st.length - 1];
    const bmw = d.best_middle_worst as Any[];
    return { tools, text: `Across ${d.samples} simulated reopening dates, the plan costs ${m(bmw[0].plan_cost_musd)} in the best case (reopens after ${bmw[0].reopens_after_days} days), ${m(bmw[1].plan_cost_musd)} in the middle case and ${m(bmw[2].plan_cost_musd)} in the worst case (${bmw[2].reopens_after_days} days); if everyone waited, the worst case would be ${m(bmw[2].if_all_wait_musd)}. The worst 5% of draws average ${m(s.monte_carlo.cvar95_musd)} for the Monte Carlo plan, against ${m(s.always_wait.cvar95_musd)} for always waiting and ${m(s.always_reroute.cvar95_musd)} for always rerouting. If the closure runs three times longer than expected (${t3.days} days), the plan costs ${m(t3.policy_musd)}, ${t3.regret_pct}% above the hindsight-best ${m(t3.hindsight_best_musd)}, with ${t3.flips} decisions that would flip. Switch the risk preference to worst-case to buy protection against that tail.\n${rec}` };
  }
  if (/forecast|traffic|normal|predict/.test(ql)) {
    const f = ctx.forecast;
    return { tools, text: `The XGBoost forecast from ${f.origin} expects about ${f.next7_ships_per_day[0].mean} ships a day through ${d.chokepoint} (80% range ${f.next7_ships_per_day[0].lo80}–${f.next7_ships_per_day[0].hi80}). On held-out 2025–26 data its error is ${f.test_mae_suez.xgboost} ships a day, at the Poisson noise floor of ${f.test_mae_suez.poisson_floor}, so the remaining day-to-day randomness is irreducible and is carried into the Monte Carlo instead.\n${rec}` };
  }
  const t = ctx.trade_impact;
  return { tools, text: `In this simulated ${d.capacity_removed_pct}% ${d.chokepoint} closure expected to last ${d.closure_expected_days} days, ${d.vessels_in_window} vessels are due in the next ${env.settings.windowDays} days. The Monte Carlo plan holds ${d.wait} and reroutes ${d.reroute}, for an expected fleet cost of ${m(s.monte_carlo.mean_musd)} versus ${m(s[d.best_simple_rule === "wait" ? "always_wait" : "always_reroute"].mean_musd)} under the best simple rule, a saving of ${m(d.saving_vs_best_rule_musd)} (${d.saving_pct}%). Best to worst case, the plan costs ${m((d.best_middle_worst as Any[])[0].plan_cost_musd)} to ${m((d.best_middle_worst as Any[])[2].plan_cost_musd)}.${t ? ` Across trade, ${m(t.trade_disrupted_musd)} of goods is forced off route and oil prices face about +${t.oil_price_pressure_pct}% pressure.` : ""}\n${rec}` };
}
