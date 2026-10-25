"use client";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { FORMULAS } from "@/lib/engine/assumptions";
import type { ChokepointShift, EngineData, ScenarioResult } from "@/lib/engine/types";
import { fmtPct } from "@/lib/format";
import { Badge } from "../ui/Badge";
import { Section } from "../ui/Section";
import { Tip } from "../ui/Tip";

export function ChokepointsSection({ result, data }: { result: ScenarioResult | null; data: EngineData }) {
  const shifts: ChokepointShift[] = result?.chokepoints ?? data.chokepoints.map((c) => ({
    id: c.id, name: c.name, baseValue: 0, newValue: 0, pct: 0, shipsPct: 0, shipsBase: c.shipsPerDay, shipsNew: c.shipsPerDay, blocked: false,
  }));
  const changed = (c: ChokepointShift) => c.blocked || Math.abs(c.shipsPct) >= 1;
  const rows = [...shifts].sort((a, b) =>
    Number(changed(b)) - Number(changed(a)) || Math.abs(b.shipsPct) - Math.abs(a.shipsPct) || b.shipsBase - a.shipsBase);
  const pw = data.datasets.find((d) => d.id === "portwatch");
  const hist = new Map(data.chokepoints.map((c) => [c.id, c.history]));
  return (
    <Section title="Chokepoint traffic" right={<span className="flex items-center gap-1"><Badge kind={pw?.status ?? "SEED"} title="Normal transits" /><Badge kind="MODELLED" title="Modelled change" /></span>}>
      <div className="mb-1.5 text-[11px] text-faint">
        <Tip content={FORMULAS.chokepointShift} width={320}><span tabIndex={0} className="cursor-help border-b border-dotted border-line-2">Ships per day, normal → modelled</span></Tip>
      </div>
      <ul className="space-y-[3px]">
        {rows.map((c) => {
          const on = changed(c);
          const up = c.shipsPct > 0;
          const tone = !on ? "text-faint" : up ? "text-green" : "text-red";
          const Icon = up ? ArrowUpRight : ArrowDownRight;
          const h = hist.get(c.id);
          return (
            <li key={c.id} className="grid grid-cols-[16px_1fr_52px_84px_50px] items-center gap-2">
              {on ? <Icon size={14} strokeWidth={1.5} className={tone} aria-hidden /> : <span className="mx-auto h-[3px] w-[3px] rounded-full bg-faint" aria-hidden />}
              <span className={`truncate text-[12px] ${on ? "text-ink" : "text-mute"}`}>{c.name}</span>
              {h && h.length > 1 ? <Spark values={h.map((x) => x.n)} /> : <span />}
              <span className="num text-right text-[11px] text-mute">
                {Math.round(c.shipsBase)}{on && <> → <span className="text-ink">{Math.round(c.shipsNew)}</span></>}
              </span>
              <span className={`num text-right text-[12px] ${tone}`}>{on ? fmtPct(c.shipsPct, 0, true) : "—"}</span>
            </li>
          );
        })}
      </ul>
      {!data.chokepoints.some((c) => c.history?.length) && (
        <p className="mt-1.5 text-[11px] leading-snug text-faint">Transit history appears here once PortWatch data is loaded.</p>
      )}
    </Section>
  );
}

function Spark({ values }: { values: number[] }) {
  const v = values.slice(-52);
  const min = Math.min(...v), max = Math.max(...v);
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * 52},${14 - ((x - min) / Math.max(1e-9, max - min)) * 12 - 1}`).join(" ");
  return (
    <svg width="52" height="14" viewBox="0 0 52 14" aria-hidden className="overflow-visible">
      <polyline points={pts} fill="none" stroke="var(--color-mute)" strokeWidth="1" />
    </svg>
  );
}
