"use client";
import { AudioLines, Compass, Keyboard, Plus, Redo2, Undo2, Volume2, VolumeX } from "lucide-react";
import { startTour } from "@/lib/tour";
import type { ImpactEngine } from "@/lib/engine/engine";
import type { ScenarioResult } from "@/lib/engine/types";
import { startBrief, useBrief } from "@/lib/brief";
import { buildBriefPayload } from "@/lib/briefPayload";
import { mapBridge } from "@/lib/mapBridge";
import { PRESETS } from "@/lib/presets";
import { useStore } from "@/lib/store";

const SUGGESTED = "suez14";

export default function TopBar({ engine, result }: { engine: ImpactEngine | null; result: ScenarioResult | null }) {
  const blockages = useStore((s) => s.blockages);
  const activePreset = useStore((s) => s.activePreset);
  const mode = useStore((s) => s.mode);
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const autoNarrate = useStore((s) => s.autoNarrate);
  const s = useStore.getState;
  const briefStatus = useBrief((b) => b.status);
  const busy = briefStatus === "writing" || briefStatus === "voicing" || briefStatus === "speaking";

  const apply = (id: string) => {
    const bs = s().applyPreset(id);
    mapBridge.animateEntry(bs.map((b) => b.id));
    mapBridge.focus(bs);
  };
  const brief = () => {
    if (!engine || !result) return;
    void startBrief(buildBriefPayload(engine, s().blockages, result));
  };

  return (
    <header className="flex h-11 items-center gap-4 border-b border-line bg-bg px-3">
      <div className="flex shrink-0 items-center gap-2" aria-label="CHOKEPOINT">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <path d="M3 1.5 C7.5 6, 7.5 12, 3 16.5" fill="none" stroke="#E6EDF5" strokeWidth="1.4" />
          <path d="M15 1.5 C10.5 6, 10.5 12, 15 16.5" fill="none" stroke="#E6EDF5" strokeWidth="1.4" />
          <circle cx="9" cy="9" r="1.6" fill="#EF5A5F" />
        </svg>
        <span className="text-[13px] font-semibold tracking-[0.16em] text-ink">CHOKEPOINT</span>
      </div>

      <nav aria-label="Preset scenarios" className="scroll-thin flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        <span className="lbl mr-1 shrink-0 !text-[10px]">Presets</span>
        {PRESETS.map((p) => {
          const active = activePreset === p.id;
          const suggested = !blockages.length && !activePreset && p.id === SUGGESTED;
          return (
            <button key={p.id} onClick={() => apply(p.id)} title={p.blurb}
              className={`flex h-[24px] shrink-0 items-center gap-1.5 rounded-sm border px-2 text-[12px] transition-colors duration-150 ${
                active ? "border-ink bg-raised text-ink" : suggested ? "border-cyan/70 text-ink hover:bg-raised" : "border-line-2 text-mute hover:bg-raised hover:text-ink"
              }`}>
              {suggested && <span className="h-[5px] w-[5px] rounded-full bg-cyan" aria-hidden />}
              {p.label}
            </button>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-1">
        <button onClick={() => s().setMode(mode === "add" ? "idle" : "add")} aria-pressed={mode === "add"}
          className={`flex h-[26px] items-center gap-1.5 rounded-sm border px-2 text-[12px] ${mode === "add" ? "border-red/70 bg-raised text-ink" : "border-line-2 text-ink hover:bg-raised"}`}>
          <Plus size={14} strokeWidth={1.5} /> Blockage <kbd className="num ml-0.5 text-[10px] text-faint">N</kbd>
        </button>
        <IconBtn label="Undo (Ctrl/⌘+Z)" onClick={() => s().undo()} disabled={!past}><Undo2 size={15} strokeWidth={1.5} /></IconBtn>
        <IconBtn label="Redo (Shift+Ctrl/⌘+Z)" onClick={() => s().redo()} disabled={!future}><Redo2 size={15} strokeWidth={1.5} /></IconBtn>
        <button onClick={() => s().clearAll()} disabled={!blockages.length}
          className="h-[26px] rounded-sm px-2 text-[12px] text-mute hover:bg-raised hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent">Clear</button>
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        <button onClick={() => s().setAutoNarrate(!autoNarrate)} aria-pressed={autoNarrate}
          title="Speak the headline change after each edit (browser voice)"
          className={`flex h-[26px] items-center gap-1.5 rounded-sm px-2 text-[12px] ${autoNarrate ? "bg-raised text-ink" : "text-mute hover:bg-raised hover:text-ink"}`}>
          {autoNarrate ? <Volume2 size={15} strokeWidth={1.5} /> : <VolumeX size={15} strokeWidth={1.5} />} Narrate
        </button>
        <button onClick={brief} disabled={!blockages.length || !result || busy}
          title={!blockages.length ? "Add a blockage first" : "Spoken summary of this scenario"}
          className="flex h-[26px] items-center gap-1.5 rounded-sm border border-line-2 bg-raised px-2.5 text-[12px] text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line-2">
          <AudioLines size={15} strokeWidth={1.5} /> {busy ? "Briefing…" : "Brief me"}
        </button>
        <button onClick={startTour} title="Guided tour of the main features"
          className="flex h-[26px] items-center gap-1.5 rounded-sm px-2 text-[12px] text-mute hover:bg-raised hover:text-ink">
          <Compass size={15} strokeWidth={1.5} /> Tour
        </button>
        <IconBtn label="Keyboard shortcuts (?)" onClick={() => s().setHelpOpen(true)}><Keyboard size={15} strokeWidth={1.5} /></IconBtn>
      </div>
    </header>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className="grid h-[26px] w-[26px] place-items-center rounded-sm text-mute hover:bg-raised hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent">
      {children}
    </button>
  );
}
