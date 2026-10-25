"use client";
import { Loader2, Send, Volume2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { askAnalyst, type ChatMsg } from "@/lib/analyst/backends";
import { speakText } from "@/lib/brief";
import { useDecisionStore } from "@/lib/decisionStore";
import type { ImpactEngine } from "@/lib/engine/engine";
import type { ScenarioResult } from "@/lib/engine/types";
import type { ModelData } from "@/lib/models/types";
import { runtime } from "@/lib/runtime";
import { useStore } from "@/lib/store";

const SUGGESTED = [
  "Why are these vessels being rerouted?",
  "What changes if the closure lasts another week?",
  "Which vessels have the greatest deadline risk?",
  "How sensitive are the savings to fuel prices?",
  "What is the worst-case outcome?",
];

export default function AnalystPanel({ engine, md, trade }: { engine: ImpactEngine; md: ModelData; trade: ScenarioResult | null }) {
  const open = useDecisionStore((s) => s.analystOpen);
  const setOpen = useDecisionStore((s) => s.setAnalyst);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [voice, setVoice] = useState(true);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);
  if (!open) return null;

  const ask = async (question: string, speak = voice) => {
    if (!question.trim() || busy) return;
    const ds = useDecisionStore.getState();
    const env = { engine, md, blockages: useStore.getState().blockages, trade, decision: ds.result, settings: { ...ds.settings, originIdx: ds.settings.originIdx ?? md.traffic.days - 1 } };
    const history = msgs;
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setQ("");
    setBusy(true);
    try {
      const r = await askAnalyst(question, history, env);
      setMsgs((m) => [...m, { role: "analyst", text: r.text, provider: r.provider, tools: r.tools, note: r.note }]);
      if (speak) void speakText(r.text, r.provider.startsWith("Built-in") ? "template" : "gemini");
    } finally {
      setBusy(false);
    }
  };
  const engineLabel = runtime.hasServer ? "Gemini + ElevenLabs when keyed" : "Claude (artifact runtime) + browser voice";
  return (
    <aside role="complementary" aria-label="Analyst" className="fixed bottom-0 right-0 top-11 z-30 flex w-full max-w-[440px] flex-col border-l border-line-2 bg-panel">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
        <h2 className="text-[13px] font-medium text-ink">Analyst</h2>
        <span className="text-[11px] text-faint">{engineLabel}</span>
        <button onClick={() => setOpen(false)} aria-label="Close analyst" className="ml-auto grid h-7 w-7 place-items-center rounded-sm text-mute hover:bg-raised hover:text-ink"><X size={15} strokeWidth={1.5} /></button>
      </header>
      <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {msgs.length === 0 && (
          <div className="space-y-3">
            <p className="text-[12px] leading-relaxed text-mute">Ask about the current scenario. Answers use only the forecaster, simulator and optimiser outputs; the analyst runs what-ifs through the same engine instead of doing its own maths.</p>
            <button onClick={() => void ask("Recommend a decision for this disruption and explain it briefly.", true)} disabled={busy}
              className="flex h-[32px] w-full items-center justify-center gap-2 rounded-sm border border-cyan/70 bg-raised text-[13px] text-ink hover:border-cyan disabled:opacity-50">
              <Volume2 size={15} strokeWidth={1.5} /> Recommend a decision
            </button>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "ml-8 rounded-sm bg-raised px-3 py-2 text-[12px] text-ink" : "text-[13px] leading-relaxed text-ink"}>
            {m.text.split("\n").map((p, k) => <p key={k} className={k ? "mt-1.5" : ""}>{p}</p>)}
            {m.role === "analyst" && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-faint">
                <span>{m.provider}</span>
                {m.tools && m.tools.length > 0 && <span className="num">tools: {[...new Set(m.tools)].join(", ")}</span>}
                <button onClick={() => void speakText(m.text)} className="flex items-center gap-1 rounded-sm px-1 text-mute hover:bg-raised hover:text-ink"><Volume2 size={12} strokeWidth={1.5} /> Speak</button>
                {m.note && <span className="w-full text-amber/80">{m.note}</span>}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-[12px] text-mute"><Loader2 size={14} className="animate-spin" /> Running the numbers…</div>}
        <div ref={end} />
      </div>
      <div className="shrink-0 border-t border-line px-4 py-2.5">
        <div className="mb-2 flex flex-wrap gap-1">
          {SUGGESTED.map((s) => (
            <button key={s} onClick={() => void ask(s)} disabled={busy} className="rounded-sm border border-line-2 px-1.5 py-0.5 text-left text-[11px] text-mute hover:text-ink disabled:opacity-50">{s}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void ask(q); }} className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this disruption" aria-label="Question"
            className="h-[30px] min-w-0 flex-1 rounded-sm border border-line-2 bg-bg px-2 text-[12px] text-ink placeholder:text-faint focus:border-cyan focus:outline-none" />
          <button type="submit" disabled={busy || !q.trim()} aria-label="Ask" className="grid h-[30px] w-[30px] place-items-center rounded-sm border border-line-2 text-ink hover:bg-raised disabled:opacity-40"><Send size={14} strokeWidth={1.5} /></button>
          <label className="flex items-center gap-1 text-[11px] text-mute"><input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> voice</label>
        </form>
      </div>
    </aside>
  );
}
