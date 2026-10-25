import { buildContext, whatIf } from "@/lib/analyst/context";
import { ANALYST_SYSTEM, TOOL_DEFS } from "@/lib/analyst/tools";
import type { AnalystBackend } from "@/lib/analyst/backends";

type SampleFn = ((input: unknown, opts?: Record<string, unknown>) => Promise<{ text: string }>) & { limits?: () => Promise<{ tools?: boolean } | null> };
type ClaudeRt = { use: (n: string) => Promise<unknown> };

/** Analyst Mode inside a published claude.ai artifact: Claude via the artifact runtime, with the same page tools. */
export const claudeBackend: AnalystBackend = async (q, history, env, run) => {
  const rt = (window as unknown as { claude?: ClaudeRt }).claude;
  if (!rt?.use) throw new Error("artifact runtime not available");
  const sample = (await rt.use("sample")) as SampleFn | null;
  if (!sample) throw new Error("Claude is not available in this view");
  const lim = await sample.limits?.().catch(() => null);
  const ctx: Record<string, unknown> = buildContext(env);
  const tools: string[] = [];
  if (!lim?.tools && env.decision) {
    // no tool support here: pre-compute the common what-ifs so answers stay grounded
    ctx.precomputed_what_ifs = {
      closure_plus_7_days: whatIf(env, { expected_days: env.decision.target.expectedDays + 7 }),
      fuel_1_5x: whatIf(env, { fuel_multiplier: 1.5 }),
      worst_case_risk_preference: whatIf(env, { risk: "cvar" }),
    };
  }
  const transcript = history.slice(-6).map((h) => `${h.role === "user" ? "User" : "Analyst"}: ${h.text}`).join("\n");
  const prompt = `${ANALYST_SYSTEM}\n\nCONTEXT (JSON, current screen):\n${JSON.stringify(ctx)}\n\n${transcript ? `Conversation so far:\n${transcript}\n\n` : ""}User question: ${q}`;
  const opts: Record<string, unknown> = { cache: false, modelTier: "default" };
  if (lim?.tools) {
    opts.tools = TOOL_DEFS.map((t) => ({
      name: t.name, description: t.description, inputSchema: t.parameters ?? { type: "object", properties: {} },
      execute: async (input: Record<string, unknown>) => { tools.push(t.name); return run(t.name, input ?? {}); },
    }));
  }
  const r = await sample([{ role: "user", content: prompt }], opts);
  return { text: String(r.text ?? "").trim(), provider: "Claude · artifact runtime", tools };
};
