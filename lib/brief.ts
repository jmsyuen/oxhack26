"use client";
import { create } from "zustand";
import type { BriefPayload } from "./briefPayload";
import { runtime } from "./runtime";
import { templateBrief } from "./server/briefTemplate";

export interface BriefWord { w: string; t: number | null }
export type BriefStatus = "idle" | "writing" | "voicing" | "speaking" | "done" | "error";

interface BriefState {
  open: boolean;
  status: BriefStatus;
  text: string;
  words: BriefWord[];
  textSource: "gemini" | "template" | null;
  voice: "elevenlabs" | "browser" | "none" | null;
  note: string | null;
  error: string | null;
  /** browser speech: index of the word currently spoken, from boundary events */
  boundaryWord: number | null;
}

export const useBrief = create<BriefState>(() => ({
  open: false, status: "idle", text: "", words: [], textSource: null, voice: null, note: null, error: null, boundaryWord: null,
}));

// ---- playback state (module scope; not React state, read by the panel's animation loop)
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let source: AudioBufferSourceNode | null = null;
let buffer: AudioBuffer | null = null;
let startedAt = 0;
let speechStartedAt = 0;
let run = 0;

export const playback = {
  analyser: () => analyser,
  /** seconds since speech started, and total duration when known */
  clock(): { t: number; duration: number | null } {
    const s = useBrief.getState();
    if (s.voice === "elevenlabs" && ctx && buffer) return { t: Math.max(0, ctx.currentTime - startedAt), duration: buffer.duration };
    if (s.voice === "browser") return { t: (performance.now() - speechStartedAt) / 1000, duration: null };
    return { t: 0, duration: null };
  },
};

function stopPlayback() {
  try { source?.stop(); } catch { /* already stopped */ }
  source = null;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

function b64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function playBuffer(id: number) {
  if (!ctx || !buffer) return;
  if (!analyser) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.6;
    analyser.connect(ctx.destination);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(analyser);
  src.onended = () => { if (id === run && source === src) useBrief.setState({ status: "done" }); };
  startedAt = ctx.currentTime + 0.05;
  src.start(startedAt);
  source = src;
  useBrief.setState({ status: "speaking" });
}

function speakWithBrowser(text: string, id: number, note: string | null) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    useBrief.setState({ status: "done", voice: "none", note: [note, "This browser has no speech synthesis; showing the text only."].filter(Boolean).join(" ") });
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  u.pitch = 1;
  const voices = window.speechSynthesis.getVoices();
  const pick = voices.find((v) => /en[-_](GB|US)/i.test(v.lang) && /Google|Natural|Samantha|Daniel|Serena/i.test(v.name)) ?? voices.find((v) => /^en/i.test(v.lang));
  if (pick) u.voice = pick;
  const starts: number[] = [];
  text.replace(/\S+/g, (m, off: number) => { starts.push(off); return m; });
  u.onboundary = (e) => {
    if (id !== run || e.name !== "word") return;
    let i = 0;
    while (i + 1 < starts.length && starts[i + 1] <= e.charIndex) i++;
    useBrief.setState({ boundaryWord: i });
  };
  u.onend = () => { if (id === run) useBrief.setState({ status: "done", boundaryWord: null }); };
  u.onerror = () => { if (id === run) useBrief.setState({ status: "done" }); };
  speechStartedAt = performance.now();
  useBrief.setState({ status: "speaking", voice: "browser", note, boundaryWord: null });
  window.speechSynthesis.speak(u);
}

/** Must be called from a click handler: the audio context is unlocked synchronously. */
export async function startBrief(payload: BriefPayload) {
  const id = ++run;
  stopPlayback();
  buffer = null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      ctx = AC ? new AC() : null;
    }
    void ctx?.resume();
  } catch {
    ctx = null;
  }
  useBrief.setState({ open: true, status: "writing", text: "", words: [], textSource: null, voice: null, note: null, error: null, boundaryWord: null });

  let text = "";
  let note: string | null = null;
  if (!runtime.hasServer) {
    text = templateBrief(payload);
    useBrief.setState({ text, textSource: "template", status: "voicing", words: text.split(/\s+/).filter(Boolean).map((w) => ({ w, t: null })) });
    speakWithBrowser(text, id, "Standalone demo: brief from the built-in template, read by the browser voice.");
    return;
  }
  try {
    const r = await fetch("/api/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
    text = String(j.text ?? "");
    note = j.note ?? null;
    if (id !== run) return;
    useBrief.setState({ text, textSource: j.source === "gemini" ? "gemini" : "template", note, status: "voicing",
      words: text.split(/\s+/).filter(Boolean).map((w) => ({ w, t: null })) });
  } catch (e) {
    if (id === run) useBrief.setState({ status: "error", error: `Couldn’t write the brief: ${e instanceof Error ? e.message : "network error"}.` });
    return;
  }

  try {
    const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const j = await r.json();
    if (j?.configured === false) throw Object.assign(new Error("not_configured"), { quiet: true });
    if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
    if (id !== run) return;
    if (!ctx) throw new Error("Web Audio unavailable");
    buffer = await ctx.decodeAudioData(b64ToArrayBuffer(j.audioBase64));
    if (id !== run) return;
    const words: BriefWord[] = Array.isArray(j.words) && j.words.length ? j.words : useBrief.getState().words;
    useBrief.setState({ voice: "elevenlabs", words });
    playBuffer(id);
  } catch (e) {
    if (id !== run) return;
    const quiet = (e as { quiet?: boolean }).quiet;
    const why = quiet ? "No ELEVENLABS_API_KEY set; using the browser’s voice." : `ElevenLabs failed (${e instanceof Error ? e.message : "error"}); using the browser’s voice.`;
    speakWithBrowser(text, id, [note, why].filter(Boolean).join(" "));
  }
}

/** Speak arbitrary text (Analyst Mode): ElevenLabs when configured, otherwise the browser voice. */
export async function speakText(text: string, source: "gemini" | "template" = "gemini") {
  const id = ++run;
  stopPlayback();
  buffer = null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      ctx = AC ? new AC() : null;
    }
    void ctx?.resume();
  } catch { ctx = null; }
  const words = text.split(/\s+/).filter(Boolean).map((w) => ({ w, t: null }));
  useBrief.setState({ open: true, status: "voicing", text, words, textSource: source, voice: null, note: null, error: null, boundaryWord: null });
  if (!runtime.hasServer) { speakWithBrowser(text, id, "Standalone demo: browser voice (ElevenLabs runs in the full app)."); return; }
  try {
    const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const j = await r.json();
    if (j?.configured === false) throw Object.assign(new Error("not_configured"), { quiet: true });
    if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
    if (id !== run || !ctx) return;
    buffer = await ctx.decodeAudioData(b64ToArrayBuffer(j.audioBase64));
    if (id !== run) return;
    useBrief.setState({ voice: "elevenlabs", words: Array.isArray(j.words) && j.words.length ? j.words : words });
    playBuffer(id);
  } catch (e) {
    if (id !== run) return;
    const quiet = (e as { quiet?: boolean }).quiet;
    speakWithBrowser(text, id, quiet ? "No ELEVENLABS_API_KEY set; using the browser’s voice." : "ElevenLabs failed; using the browser’s voice.");
  }
}

export function stopBrief() {
  run++;
  stopPlayback();
  const s = useBrief.getState();
  if (s.status === "speaking" || s.status === "voicing" || s.status === "writing") useBrief.setState({ status: "done", boundaryWord: null });
}

export function replayBrief() {
  const s = useBrief.getState();
  if (!s.text) return;
  const id = ++run;
  stopPlayback();
  if (s.voice === "elevenlabs" && buffer && ctx) { void ctx.resume(); playBuffer(id); }
  else speakWithBrowser(s.text, id, s.note);
}

export function closeBrief() {
  stopBrief();
  useBrief.setState({ open: false });
}

/** Short spoken update used by "Narrate changes" (browser voice, never ElevenLabs credits). */
export function narrate(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  if (useBrief.getState().status === "speaking") return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.08;
  window.speechSynthesis.speak(u);
}
