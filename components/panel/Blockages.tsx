"use client";
import { ChevronDown, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ImpactEngine } from "@/lib/engine/engine";
import type { Blockage } from "@/lib/engine/types";
import { fmtCoord } from "@/lib/format";
import { placeName } from "@/lib/place";
import { useStore } from "@/lib/store";
import { Section } from "../ui/Section";
import { Slider } from "../ui/Slider";

export function BlockagesSection({ engine }: { engine: ImpactEngine }) {
  const blockages = useStore((s) => s.blockages);
  const selectedId = useStore((s) => s.selectedId);
  const mode = useStore((s) => s.mode);
  return (
    <Section title={`Blockages${blockages.length ? ` · ${blockages.length}` : ""}`}
      right={blockages.length > 0 ? <span className="text-[11px] text-faint">1–9 to select</span> : undefined}>
      {blockages.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-mute">
          {mode === "add" ? "Click on water to place it." : "None yet. Click the ocean, press N, or pick a preset above."}
        </p>
      ) : (
        <ul className="-mx-4">
          {blockages.map((b, i) => (
            <BlockageRow key={b.id} b={b} i={i} selected={b.id === selectedId} engine={engine} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function BlockageRow({ b, i, selected, engine }: { b: Blockage; i: number; selected: boolean; engine: ImpactEngine }) {
  const select = useStore((s) => s.select);
  const remove = useStore((s) => s.removeBlockage);
  const update = useStore((s) => s.updateBlockage);
  const place = useMemo(() => placeName(engine, b.lon, b.lat), [engine, b.lon, b.lat]);
  const lanes = useMemo(() => engine.lanesTouched(b), [engine, b]);
  // details (severity, duration, radius sliders) start collapsed, even for a just-added blockage
  const [open, setOpen] = useState(false);
  return (
    <li className={`border-l-2 ${selected ? "border-ink bg-raised" : "border-transparent hover:bg-raised/60"}`}>
      <div className="flex items-center gap-2 px-[14px] py-1.5">
        <button onClick={() => { select(b.id); setOpen(!open); }} aria-expanded={open} aria-controls={`blk-details-${b.id}`}
          title={open ? "Hide details" : "Show severity, duration and radius"}
          className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="num grid h-[18px] w-[22px] shrink-0 place-items-center rounded-[2px] border border-red/60 text-[10px] text-ink">B{i + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] text-ink">{place.short}</span>
            <span className="num block truncate text-[10px] text-faint">{fmtCoord(b.lon, b.lat)} · {Math.round(b.radiusKm)} km · {lanes} lane{lanes === 1 ? "" : "s"}</span>
          </span>
          <span className="num shrink-0 text-[11px] text-mute">{Math.round(b.severity * 100)}% · {b.durationDays}d</span>
          <ChevronDown size={14} strokeWidth={1.5} className={`shrink-0 text-faint transition-transform duration-150 ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
        <button onClick={() => remove(b.id)} aria-label={`Remove blockage B${i + 1}`}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-sm text-faint hover:bg-line hover:text-ink">
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
      {open && (
        <div id={`blk-details-${b.id}`} className="space-y-1.5 px-[14px] pb-3 pt-1">
          <Slider id={`sev-${b.id}`} label="Severity" value={Math.round(b.severity * 100)} min={0} max={100} color="var(--color-red)"
            format={(v) => `${v}%`} onChange={(v) => update(b.id, { severity: v / 100 })} />
          <Slider id={`dur-${b.id}`} label="Duration" value={b.durationDays} min={1} max={180}
            format={(v) => `${v} d`} onChange={(v) => update(b.id, { durationDays: v })} />
          <Slider id={`rad-${b.id}`} label="Radius" value={Math.round(b.radiusKm)} min={10} max={1000} step={5}
            format={(v) => `${v} km`} onChange={(v) => update(b.id, { radiusKm: v })} />
          <div className="flex items-center justify-between pt-1">
            <span className={`text-[11px] ${lanes === 0 ? "text-amber" : "text-faint"}`}>
              {lanes === 0 ? "Touches no sea lane. Move it onto a lane." : "Severity = share of lane capacity removed"}
            </span>
            <button onClick={() => remove(b.id)} className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-mute hover:bg-line hover:text-ink">
              <Trash2 size={12} strokeWidth={1.5} /> Delete
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
