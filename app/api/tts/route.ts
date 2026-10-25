import { NextResponse } from "next/server";
import { getConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";
// Vercel: allow slow model responses (within every plan's limit)
export const maxDuration = 30;

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
}

/** Word start times from ElevenLabs character alignment. */
function wordsFromAlignment(a: Alignment | undefined) {
  if (!a?.characters?.length) return null;
  const out: { w: string; t: number }[] = [];
  let cur = "";
  let start = 0;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) out.push({ w: cur, t: start });
      cur = "";
    } else {
      if (!cur) start = a.character_start_times_seconds[i] ?? 0;
      cur += ch;
    }
  });
  if (cur) out.push({ w: cur, t: start });
  return out;
}

export async function POST(req: Request) {
  const { elevenlabs } = getConfig();
  if (!elevenlabs.key) return NextResponse.json({ configured: false });
  let text = "";
  try {
    text = String((await req.json())?.text ?? "").slice(0, 1200);
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (!text.trim()) return NextResponse.json({ error: "No text" }, { status: 400 });

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(elevenlabs.voiceId)}/with-timestamps?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": elevenlabs.key },
        body: JSON.stringify({ text, model_id: elevenlabs.modelId, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
        signal: ctl.signal,
      },
    );
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return NextResponse.json({ error: `ElevenLabs HTTP ${r.status}`, detail: detail.slice(0, 300) }, { status: 502 });
    }
    const j = await r.json();
    if (!j?.audio_base64) return NextResponse.json({ error: "ElevenLabs returned no audio" }, { status: 502 });
    return NextResponse.json({ audioBase64: j.audio_base64, mime: "audio/mpeg", words: wordsFromAlignment(j.alignment) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ElevenLabs unreachable" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
