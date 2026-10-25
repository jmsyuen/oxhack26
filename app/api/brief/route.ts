import { NextResponse } from "next/server";
import type { BriefPayload } from "@/lib/briefPayload";
import { templateBrief } from "@/lib/server/briefTemplate";
import { getConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";
// Vercel: allow slow model responses (within every plan's limit)
export const maxDuration = 30;

const SYSTEM = `You are a calm, precise radio news anchor. Write a spoken briefing of 55 to 80 words (about 25 seconds) on a SIMULATED shipping-disruption scenario.
Rules:
- Say clearly that this is a simulated, modelled scenario, not a real event.
- Use only the numbers in the data. Round them for speech ("about 250 billion dollars", "roughly 11 extra days"). Write money in words, never "$" or "bn".
- Cover: what is blocked and for how long, trade value forced off its routes, how much reroutes versus is stranded, the most exposed countries, the hardest-hit commodity, and oil or LNG price pressure if material.
- Plain sentences only. No lists, markdown, headlines, greetings or sign-off.`;

function isPayload(x: unknown): x is BriefPayload {
  const p = x as BriefPayload;
  return !!p && Array.isArray(p.blockages) && typeof p.totals === "object" && p.totals !== null;
}

async function callGemini(key: string, model: string, payload: BriefPayload, withThinkingOff: boolean) {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: `Scenario data (JSON):\n${JSON.stringify(payload)}` }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 400, ...(withThinkingOff ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
  };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false as const, status: r.status, error: j?.error?.message ?? `HTTP ${r.status}` };
    const text: string = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("").trim();
    if (!text) return { ok: false as const, status: 502, error: "Gemini returned an empty response" };
    return { ok: true as const, text };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (!isPayload(payload)) return NextResponse.json({ error: "Missing scenario data" }, { status: 400 });

  const { gemini } = getConfig();
  if (!gemini.key) return NextResponse.json({ text: templateBrief(payload), source: "template", note: "No GEMINI_API_KEY set, so this brief uses the built-in template." });

  try {
    let res = await callGemini(gemini.key, gemini.model, payload, true);
    if (!res.ok && res.status === 400) res = await callGemini(gemini.key, gemini.model, payload, false);
    if (res.ok) return NextResponse.json({ text: res.text.replace(/\s+/g, " "), source: "gemini", model: gemini.model });
    return NextResponse.json({
      text: templateBrief(payload), source: "template",
      note: `Gemini request failed (${res.error}). Check GEMINI_API_KEY and GEMINI_MODEL. Using the built-in template.`,
    });
  } catch (e) {
    return NextResponse.json({
      text: templateBrief(payload), source: "template",
      note: `Gemini unreachable (${e instanceof Error ? e.message : "network error"}). Using the built-in template.`,
    });
  }
}
