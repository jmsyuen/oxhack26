import { buildContext, type AnalystEnv } from "./context";
import { offlineAnswer } from "./offline";
import { ANALYST_SYSTEM, makeToolRunner, TOOL_DEFS, type ToolRunner } from "./tools";
import { runtime } from "../runtime";

export interface ChatMsg { role: "user" | "analyst"; text: string; provider?: string; tools?: string[]; note?: string }
export interface AnalystReply { text: string; provider: string; tools: string[]; note?: string }
export type AnalystBackend = (q: string, history: ChatMsg[], env: AnalystEnv, run: ToolRunner) => Promise<AnalystReply>;

/** Gemini via /api/analyst. The server holds the key; tool calls come back here and run against the live engine. */
export const geminiBackend: AnalystBackend = async (q, history, env, run) => {
  type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: unknown; thoughtSignature?: string };
  type Content = { role: "user" | "model"; parts: Part[] };
  const contents: Content[] = history.slice(-8).map((h) => ({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.text }] }));
  contents.push({ role: "user", parts: [{ text: q }] });
  const context = buildContext(env);
  const tools: string[] = [];
  for (let round = 0; round < 5; round++) {
    const r = await fetch("/api/analyst", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents, context }) });
    const j = await r.json();
    if (j.configured === false) throw Object.assign(new Error("No GEMINI_API_KEY set"), { quiet: true });
    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    if (!j.calls?.length) return { text: String(j.text ?? "").trim(), provider: `Gemini · ${j.model}`, tools, note: j.finishReason === "MAX_TOKENS" ? "Gemini hit its output limit, so this answer may be cut short." : undefined };
    contents.push(j.content as Content);
    contents.push({ role: "user", parts: (j.calls as { name: string; args: Record<string, unknown> }[]).map((c) => {
      tools.push(c.name);
      let result: unknown;
      try { result = run(c.name, c.args ?? {}); } catch (e) { result = { error: e instanceof Error ? e.message : "tool failed" }; }
      return { functionResponse: { name: c.name, response: { result } } };
    }) });
  }
  throw new Error("Gemini kept calling tools without answering");
};

export const offlineBackend: AnalystBackend = async (q, _h, env, run) => {
  const r = offlineAnswer(q, env, run);
  return { text: r.text, provider: "Built-in analyst (no LLM)", tools: r.tools };
};

export async function askAnalyst(q: string, history: ChatMsg[], env: AnalystEnv): Promise<AnalystReply> {
  const run = makeToolRunner(env);
  const primary = runtime.hasServer ? geminiBackend : runtime.analyst;
  if (primary) {
    try {
      const r = await primary(q, history, env, run);
      if (r.text) return r;
    } catch (e) {
      const quiet = (e as { quiet?: boolean }).quiet;
      const r = await offlineBackend(q, history, env, run);
      return { ...r, note: quiet ? "No Gemini key configured; using the built-in analyst." : `LLM unavailable (${e instanceof Error ? e.message : "error"}); using the built-in analyst.` };
    }
  }
  return offlineBackend(q, history, env, run);
}

export { ANALYST_SYSTEM, TOOL_DEFS };
