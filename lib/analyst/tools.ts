import { buildContext, vesselRow, whatIf, type AnalystEnv } from "./context";

/** Read-only analysis tools. The same definitions are sent to Gemini (function calling) and Claude (sample tools). */
export interface ToolDef {
  name: string;
  description: string;
  parameters?: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export const TOOL_DEFS: ToolDef[] = [
  { name: "get_vessel", description: "Full cost breakdown and decision explanation for one simulated vessel, by id (e.g. SU-042).",
    parameters: { type: "object", properties: { id: { type: "string", description: "vessel id" } }, required: ["id"] } },
  { name: "list_vessels", description: "List simulated vessels, filtered by decision and sorted. deadline_risk = most likely to miss delivery; saving = biggest expected gain from the chosen action; break_even = shortest break-even closure.",
    parameters: { type: "object", properties: {
      decision: { type: "string", enum: ["wait", "reroute", "any"] },
      sort_by: { type: "string", enum: ["deadline_risk", "saving", "wait_cost", "break_even"] },
      limit: { type: "integer", description: "1-15" } } } },
  { name: "what_if", description: "Re-run forecast, queue simulation and Monte Carlo optimisation with changed assumptions (does not change the user's screen). Use for 'what if it lasts another week', fuel sensitivity, risk appetite, urgency.",
    parameters: { type: "object", properties: {
      expected_days: { type: "number", description: "expected closure duration in days" },
      uncertainty: { type: "number", description: "coefficient of variation of the closure duration, 0.05-2" },
      risk: { type: "string", enum: ["expected", "balanced", "cvar"] },
      fuel_multiplier: { type: "number", description: "fuel price multiple, 0.3-3" },
      urgency: { type: "string", enum: ["low", "medium", "high"] } } } },
  { name: "stress_test", description: "How the recommended policy performs if the closure lasts 0.5x, 1x, 2x or 3x the expected duration, against the hindsight-best decisions." },
  { name: "get_scenario", description: "Current scenario summary: forecast, decision, strategies, trade impact." },
];

export type ToolRunner = (name: string, args: Record<string, unknown>) => unknown;

export function makeToolRunner(env: AnalystEnv): ToolRunner {
  return (name, args) => {
    const d = env.decision;
    switch (name) {
      case "get_scenario": return buildContext(env);
      case "stress_test": return d ? d.mc.stress.map((s) => ({ multiple: s.mult, days: Math.round(s.T * 10) / 10, policy_musd: Math.round(s.mc / 1e5) / 10, hindsight_best_musd: Math.round(s.oracle / 1e5) / 10, always_wait_musd: Math.round(s.wait / 1e5) / 10, always_reroute_musd: Math.round(s.reroute / 1e5) / 10, regret_pct: Math.round(s.regretPct * 10) / 10, flips: s.flips.length, still_beats_simple_rules: s.stillBest })) : { error: "no decision in this scenario" };
      case "get_vessel": {
        if (!d) return { error: "no decision in this scenario" };
        const i = d.fleet.findIndex((v) => v.id.toLowerCase() === String(args.id ?? "").toLowerCase());
        return i < 0 ? { error: `No vessel ${String(args.id)}. Ids look like ${d.fleet[0]?.id}.` } : vesselRow(d, i);
      }
      case "list_vessels": {
        if (!d) return { error: "no decision in this scenario" };
        const want = String(args.decision ?? "any");
        const lim = Math.max(1, Math.min(15, Number(args.limit) || 6));
        let idx = d.fleet.map((_, i) => i).filter((i) => want === "any" || (want === "wait") === d.mc.decisions[i].wait);
        const x = d.mc.decisions;
        const key: Record<string, (i: number) => number> = {
          deadline_risk: (i) => -(Math.max(x[i].wait ? x[i].meanWaitDays : d.fleet[i].extraDays, 0) - d.fleet[i].slackDays),
          saving: (i) => -x[i].edge,
          wait_cost: (i) => -x[i].costWaitMean,
          break_even: (i) => x[i].breakEvenDays ?? 1e9,
        };
        const k = key[String(args.sort_by)] ?? key.saving;
        idx = idx.sort((a, b) => k(a) - k(b)).slice(0, lim);
        return idx.map((i) => vesselRow(d, i));
      }
      case "what_if": return whatIf(env, args as Parameters<typeof whatIf>[1]);
      default: return { error: `unknown tool ${name}` };
    }
  };
}

export const ANALYST_SYSTEM = `You are the CHOKEPOINT maritime decision analyst, briefing a shipping operator.
The question you serve: how can shipping companies minimise costs when major maritime routes are disrupted?
Rules:
- Use only numbers from CONTEXT or from tool results. Never compute or invent figures yourself; call what_if for any changed assumption and get_vessel / list_vessels for vessel questions.
- Say once that the scenario is simulated. The traffic forecast comes from an XGBoost model on observed IMF PortWatch data; vessels are synthetic.
- Explain the why: queue delay vs detour days, toll saved, schedule buffers, and the closure-duration uncertainty.
- Under 150 words, plain sentences (it may be read aloud): no markdown, no bullet symbols, money as "$12.3m".
- End with one line starting "Recommendation:".`;
