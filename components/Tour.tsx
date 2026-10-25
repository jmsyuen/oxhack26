"use client";
import { Check } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDecisionStore } from "@/lib/decisionStore";
import { runtime } from "@/lib/runtime";
import { useStore } from "@/lib/store";
import { endTour, useTour } from "@/lib/tour";

type StepId = "map" | "timeline" | "decision" | "impact" | "analyst";
interface Step { id: StepId; title: string; body: string; task: string }

const STEPS = (): Step[] => [
  { id: "map", title: "Drop a blockage",
    body: "Click any open water to block a sea lane, or click a chokepoint dot to close it. Drag a blockage to move it, and drag its white handle to resize. You’re starting on a two-week Suez closure.",
    task: "Click the ocean to add a blockage" },
  { id: "timeline", title: "Play the closure",
    body: "Run the scenario day by day. Losses build along the timeline, and the map and figures follow the day you’re on.",
    task: "Press play (or Space)" },
  { id: "decision", title: "Decide who waits and who reroutes",
    body: "This window answers the main question. Forecast predicts normal traffic with XGBoost. Simulate shows the queue in the best, middle and worst case. Decide prices each plan across 1,000 Monte Carlo reopening dates.",
    task: "Open another tab" },
  { id: "impact", title: "Watch the impact move",
    body: "Trade forced off route, extra shipping cost and oil price pressure update as you edit. Further down: the most exposed countries, commodities and chokepoint traffic.",
    task: "Drag a blockage, or change its duration" },
  { id: "analyst", title: "Ask the analyst",
    body: runtime.hasServer
      ? "Get the recommendation in plain English, grounded in the model’s numbers and read aloud by ElevenLabs. Try “Recommend a decision”."
      : "Get the recommendation in plain English, grounded in the model’s numbers. The full app reads it aloud with ElevenLabs; this standalone demo uses your browser’s voice.",
    task: "Click Ask the analyst" },
];

const CARD_W = 330, GAP = 14, PAD = 6;

export default function Tour() {
  const { open, step } = useTour();
  const steps = STEPS();
  const s = steps[step];
  const nBlk = useStore((x) => x.blockages.length);
  const seq = useStore((x) => x.commitSeq);
  const playing = useStore((x) => x.playing);
  const tab = useDecisionStore((x) => x.tab);
  const analyst = useDecisionStore((x) => x.analystOpen);
  const base = useRef({ nBlk: 0, seq: 0, tab: "decide" as string });
  const [done, setDone] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(220);

  // baseline for "Try it" detection whenever the step changes
  useEffect(() => {
    if (!open) return;
    base.current = { nBlk: useStore.getState().blockages.length, seq: useStore.getState().commitSeq, tab: useDecisionStore.getState().tab };
    setDone(false);
  }, [open, step]);
  useEffect(() => {
    if (!open || done) return;
    const b = base.current;
    const hit = { map: nBlk > b.nBlk, timeline: playing, decision: tab !== b.tab, impact: seq !== b.seq, analyst }[s.id];
    if (hit) setDone(true);
  }, [open, done, s?.id, nBlk, seq, playing, tab, analyst]);

  // follow the highlighted element (layout can shift: panels open, window resizes)
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${s.id}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    const t = setInterval(measure, 250);
    window.addEventListener("resize", measure);
    return () => { clearInterval(t); window.removeEventListener("resize", measure); };
  }, [open, s?.id]);
  useLayoutEffect(() => { if (card.current) setCardH(card.current.offsetHeight); });
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") endTour(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  if (!open || !s) return null;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1440, vh = typeof window !== "undefined" ? window.innerHeight : 900;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  let left = vw / 2 - CARD_W / 2, top = vh / 2 - cardH / 2;
  if (rect) {
    if (rect.right + GAP + CARD_W < vw - 8) { left = rect.right + GAP; top = clamp(rect.top, 52, vh - cardH - 8); }
    else if (rect.left - GAP - CARD_W > 8) { left = rect.left - GAP - CARD_W; top = clamp(rect.top, 52, vh - cardH - 8); }
    else if (rect.top - GAP - cardH > 8) { top = rect.top - GAP - cardH; left = clamp(rect.left, 8, vw - CARD_W - 8); }
    else if (rect.bottom + GAP + cardH < vh - 8) { top = rect.bottom + GAP; left = clamp(rect.left, 8, vw - CARD_W - 8); }
    else { top = rect.top + GAP; left = rect.right - CARD_W - GAP; }
  }
  const last = step === steps.length - 1;
  const go = (d: number) => useTour.setState({ step: clamp(step + d, 0, steps.length - 1) });
  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-live="polite">
      {rect && (
        <div className="absolute rounded-[4px] outline outline-1 outline-cyan transition-all duration-300 ease-out"
          style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: "0 0 0 9999px rgba(7,11,18,0.62)" }} />
      )}
      <div ref={card} role="dialog" aria-label={`Tour step ${step + 1} of ${steps.length}: ${s.title}`}
        className="pointer-events-auto absolute rounded-sm border border-line-2 bg-panel p-4 shadow-[0_8px_30px_rgba(0,0,0,0.45)] transition-[left,top] duration-300 ease-out"
        style={{ left, top, width: CARD_W }}>
        <div className="flex items-center justify-between">
          <span className="num text-[11px] text-cyan">Step {step + 1} of {steps.length}</span>
          <button onClick={endTour} className="text-[12px] text-mute underline decoration-line-2 underline-offset-4 hover:text-ink">Skip tour</button>
        </div>
        <h2 className="mt-2 text-[15px] font-medium text-ink">{s.title}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-mute">{s.body}</p>
        <p className={`mt-3 flex items-center gap-2 text-[12px] ${done ? "text-green" : "text-ink"}`}>
          <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${done ? "border-green bg-green/15" : "border-line-2"}`}>
            {done && <Check size={11} strokeWidth={2} />}
          </span>
          {done ? "Done" : `Try it: ${s.task}`}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex gap-1" aria-hidden>
            {steps.map((_, i) => <span key={i} className={`h-[5px] w-[5px] rounded-full ${i === step ? "bg-cyan" : i < step ? "bg-mute" : "bg-line-2"}`} />)}
          </div>
          <div className="ml-auto flex gap-2">
            {step > 0 && <button onClick={() => go(-1)} className="h-[28px] rounded-sm border border-line-2 px-3 text-[12px] text-ink hover:bg-raised">Back</button>}
            <button onClick={() => (last ? endTour() : go(1))} autoFocus
              className={`h-[28px] rounded-sm border px-3 text-[12px] text-ink hover:bg-raised ${done ? "border-cyan" : "border-line-2"}`}>{last ? "Finish" : "Next"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
