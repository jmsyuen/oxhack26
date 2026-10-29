import { NextResponse } from "next/server";
import { ANALYST_SYSTEM, TOOL_DEFS } from "@/lib/analyst/tools";
import { getConfig } from "@/lib/server/config";
import { fastConfig, geminiError, generateContent } from "@/lib/server/gemini";

export const dynamic = "force-dynamic";
// Vercel: allow slow model responses (within every plan's limit)
export const maxDuration = 60;

/**
 * Analyst Mode proxy for Google Gemini with function calling. The key stays here; the browser runs the tools
 * (they read the live forecast / simulator / optimiser) and posts the results back. Only allow-listed tools pass.
 */
const ALLOWED = new Set(TOOL_DEFS.map((t) => t.name));

export async function POST(req: Request) {
  const { gemini } = getConfig();
  if (!gemini.key) return NextResponse.json({ configured: false });
  let body: { contents?: unknown[]; context?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body must be JSON" }, { status: 400 }); }
  if (!Array.isArray(body.contents) || body.contents.length === 0 || body.contents.length > 40) return NextResponse.json({ error: "contents must be a non-empty array" }, { status: 400 });
  const ctx = JSON.stringify(body.context ?? {}).slice(0, 30000);
  const req1 = {
    systemInstruction: { parts: [{ text: `${ANALYST_SYSTEM}\n\nCONTEXT (JSON, current screen):\n${ctx}` }] },
    contents: body.contents,
    tools: [{ functionDeclarations: TOOL_DEFS }],
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    generationConfig: fastConfig(gemini.model, 8192, 0.3), // thinking tokens count against this on Gemini 3
  };
  try {
    const res = await generateContent(gemini.key, gemini.model, req1, 50000);
    if (!res.ok) return NextResponse.json({ error: geminiError(res) }, { status: 502 });
    const content = res.json?.candidates?.[0]?.content ?? { role: "model", parts: [] };
    const parts: { text?: string; functionCall?: { name: string; args?: unknown } }[] = content.parts ?? [];
    const calls = parts.filter((p) => p.functionCall && ALLOWED.has(p.functionCall.name))
      .map((p) => ({ name: p.functionCall!.name, args: typeof p.functionCall!.args === "object" && p.functionCall!.args ? p.functionCall!.args : {} }));
    const text = parts.map((p) => p.text ?? "").join("").trim();
    return NextResponse.json({ configured: true, model: gemini.model, content: { role: "model", parts }, calls, text, finishReason: res.json?.candidates?.[0]?.finishReason ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gemini unreachable" }, { status: 502 });
  }
}
