/**
 * Gemini generateContent with settings that work across model generations.
 * Gemini 3+ reasons at "high" by default, which can take 20-60 s; we ask for thinkingLevel "low" (Google's
 * low-latency setting) and keep the default temperature, as recommended for Gemini 3. Gemini 2.x gets a zero
 * thinking budget instead. If a model rejects the thinking setting, the request is retried once without it.
 */
export function modelGeneration(model: string): number {
  const m = /gemini-(\d+)/i.exec(model);
  return m ? Number(m[1]) : 3;
}

export function fastConfig(model: string, maxOutputTokens: number, temperature: number): Record<string, unknown> {
  return modelGeneration(model) >= 3
    ? { maxOutputTokens, thinkingConfig: { thinkingLevel: "low" } }
    : { maxOutputTokens, temperature, thinkingConfig: { thinkingBudget: 0 } };
}

export interface GeminiResult { ok: boolean; status: number; json: any } // eslint-disable-line @typescript-eslint/no-explicit-any

async function post(key: string, model: string, body: unknown, timeoutMs: number): Promise<GeminiResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: ctl.signal,
    });
    return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error(`Gemini took longer than ${Math.round(timeoutMs / 1000)} s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateContent(key: string, model: string, body: { generationConfig?: Record<string, unknown> } & Record<string, unknown>, timeoutMs: number) {
  let res = await post(key, model, body, timeoutMs);
  const msg = String(res.json?.error?.message ?? "");
  if (!res.ok && res.status === 400 && /thinking/i.test(msg) && body.generationConfig?.thinkingConfig) {
    const { thinkingConfig: _drop, ...gc } = body.generationConfig; // eslint-disable-line @typescript-eslint/no-unused-vars
    res = await post(key, model, { ...body, generationConfig: gc }, timeoutMs);
  }
  return res;
}

export const geminiError = (res: GeminiResult) => String(res.json?.error?.message ?? `Gemini HTTP ${res.status}`);
