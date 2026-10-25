"use client";
import { RotateCcw, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { closeBrief, playback, replayBrief, stopBrief, useBrief } from "@/lib/brief";

export default function BriefPanel() {
  const { open, status, words, textSource, voice, note, error } = useBrief();
  const [revealed, setRevealed] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (status === "done") { setRevealed(words.length); }
    if (status !== "speaking") { draw(canvas.current, null, 0, false); return; }
    let raf = 0;
    const tick = () => {
      const { t, duration } = playback.clock();
      let n: number;
      if (voice === "elevenlabs") {
        n = words.some((w) => w.t !== null)
          ? words.filter((w) => w.t !== null && w.t <= t + 0.05).length
          : duration ? Math.ceil((t / duration) * words.length) : 0;
      } else {
        const bw = useBrief.getState().boundaryWord;
        n = bw !== null ? bw + 1 : Math.min(words.length, Math.floor(t * 2.6) + 1);
      }
      setRevealed((p) => (p === n ? p : n));
      draw(canvas.current, voice === "elevenlabs" ? playback.analyser() : null, t, true);
      raf = requestAnimationFrame(tick);
    };
    setRevealed(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, voice, words]);

  if (!open) return null;
  const label = { idle: "", writing: "Writing brief…", voicing: "Generating voice…", speaking: "Speaking", done: "Brief", error: "Brief unavailable" }[status];
  return (
    <div role="region" aria-label="Spoken brief" className="absolute right-3 top-3 z-20 w-[360px] rounded-sm border border-line-2 bg-panel/95">
      <div className="flex h-8 items-center gap-2 border-b border-line px-3">
        <canvas ref={canvas} width={64} height={16} className="h-4 w-16" aria-hidden />
        <span className="lbl !text-[10px] text-ink">{label}</span>
        <span className="ml-auto flex items-center gap-0.5">
          {(status === "done" || status === "speaking") && (
            status === "speaking"
              ? <Btn label="Stop" onClick={stopBrief}><Square size={12} strokeWidth={1.5} /></Btn>
              : <Btn label="Replay" onClick={replayBrief}><RotateCcw size={12} strokeWidth={1.5} /></Btn>
          )}
          <Btn label="Close brief" onClick={closeBrief}><X size={13} strokeWidth={1.5} /></Btn>
        </span>
      </div>
      <div className="px-3 py-2.5">
        {status === "error" ? (
          <p className="text-[12px] text-red">{error}</p>
        ) : words.length === 0 ? (
          <p className="text-[12px] text-faint">Summarising the current scenario…</p>
        ) : (
          <p className="text-[13px] leading-[1.55]" aria-live="polite">
            {words.map((w, i) => (
              <span key={i} className={`transition-colors duration-150 ${i < revealed || status === "voicing" ? "text-ink" : "text-faint"}`}>
                {w.w}{" "}
              </span>
            ))}
          </p>
        )}
        <p className="mt-2 text-[10px] leading-snug text-faint">
          {textSource && <>Text: {textSource === "gemini" ? "Gemini" : "built-in template"}{voice ? " · " : ""}</>}
          {voice && <>Voice: {voice === "elevenlabs" ? "ElevenLabs" : voice === "browser" ? "browser" : "none"}</>}
          {note && <span className="block">{note}</span>}
        </p>
      </div>
    </div>
  );
}

function Btn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="grid h-6 w-6 place-items-center rounded-sm text-mute hover:bg-line hover:text-ink">
      {children}
    </button>
  );
}

function draw(c: HTMLCanvasElement | null, an: AnalyserNode | null, t: number, live: boolean) {
  if (!c) return;
  const g = c.getContext("2d");
  if (!g) return;
  const W = c.width, H = c.height, n = 12, bw = 3, gap = (W - n * bw) / (n - 1);
  g.clearRect(0, 0, W, H);
  let bins: Uint8Array<ArrayBuffer> | null = null;
  if (an) { bins = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(bins); }
  for (let i = 0; i < n; i++) {
    let v: number;
    if (!live) v = 0.12;
    else if (bins) v = Math.max(0.1, bins[Math.min(bins.length - 1, 1 + i)] / 255);
    else v = 0.2 + 0.6 * Math.abs(Math.sin(t * 7 + i * 0.9) * Math.sin(t * 3.1 + i * 0.4));
    const h = Math.max(2, v * H);
    g.fillStyle = live ? "#E6EDF5" : "#4E5B70";
    g.fillRect(i * (bw + gap), (H - h) / 2, bw, h);
  }
}
