"use client";
import { runtime } from "@/lib/runtime";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { ASSUMPTIONS } from "@/lib/engine/assumptions";
import type { EngineData } from "@/lib/engine/types";
import { Badge } from "../ui/Badge";

interface Status { gemini: boolean; geminiModel: string; elevenlabs: boolean; fred: boolean }

export function DataNotes({ data }: { data: EngineData }) {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => { if (!runtime.hasServer) return; fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => setStatus(null)); }, []);
  const cov = data.flows.coverage;
  const A = ASSUMPTIONS;
  return (
    <details className="group border-b border-line px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between">
        <h2 className="lbl">Data & assumptions</h2>
        <ChevronDown size={14} strokeWidth={1.5} className="text-mute transition-transform duration-150 group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-4 text-[12px]">
        <ul className="space-y-2">
          {data.datasets.map((d) => (
            <li key={d.id}>
              <div className="flex items-center gap-2"><Badge kind={d.status} /><span className="text-ink">{d.label}</span><span className="num ml-auto text-[10px] text-faint">{d.vintage}</span></div>
              <p className="mt-0.5 text-[11px] leading-snug text-mute">{d.source}{d.note ? `. ${d.note}.` : ""}</p>
            </li>
          ))}
        </ul>
        <p className="num text-[11px] leading-snug text-mute">
          {cov.economies} economies · {(cov.coveredShareOfWorld * 100).toFixed(0)}% of world goods exports · ${(cov.maritimeFlowsBn / 1000).toFixed(1)}tn/yr seaborne flows ·{" "}
          {cov.flowCount.toLocaleString()} country-pair × commodity flows. Land-neighbour pairs excluded.
        </p>
        <div>
          <h3 className="lbl mb-1 !text-[10px]">Engine</h3>
          <table className="num w-full text-[11px]">
            <tbody className="[&_td]:py-[2px] [&_td:last-child]:text-right [&_td:last-child]:text-ink [&_td:first-child]:text-mute">
              <tr><td>Ship speed</td><td>{A.speedKnots} kn</td></tr>
              <tr><td>Canal routing penalty (Suez, Panama)</td><td>{A.canalPenaltyNm.toLocaleString()} nm</td></tr>
              <tr><td>Congestion delay at 100% loss</td><td>{A.congestionDaysAtFull} d</td></tr>
              <tr><td>Price multiplier oil / LNG / grain</td><td>{A.priceMultiplier.oil} / {A.priceMultiplier.gas} / {A.priceMultiplier.food}</td></tr>
              <tr><td>Inventory buffer τ</td><td>{A.inventoryTauDays} d</td></tr>
              <tr><td>Supply weight rerouted / delayed</td><td>{A.reroutedSupplyWeight} / {A.congestedSupplyWeight}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="lbl mb-1 !text-[10px]">Per commodity</h3>
          <table className="num w-full text-[11px]">
            <thead><tr className="text-faint"><th className="text-left font-normal">Group</th><th className="text-right font-normal">Cost / extra day</th><th className="text-right font-normal">Cargo / ship</th></tr></thead>
            <tbody className="[&_td]:py-[2px]">
              {data.flows.commodities.map((c) => (
                <tr key={c.id}><td className="font-sans text-mute">{c.label}</td><td className="text-right text-ink">{(c.costPerDayShare * 100).toFixed(2)}%</td><td className="text-right text-ink">${c.cargoMusdPerShip}m</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] leading-snug text-faint">Cost per extra day is a share of cargo value covering freight, fuel and inventory carry.</p>
        </div>
        <div>
          <h3 className="lbl mb-1 !text-[10px]">Services</h3>
          <ul className="space-y-0.5 text-[11px]">
            <ServiceRow name={`Gemini (${status?.geminiModel ?? "…"})`} on={status?.gemini} off="template brief" />
            <ServiceRow name="ElevenLabs" on={status?.elevenlabs} off="browser voice" />
            <ServiceRow name="FRED prices" on={status?.fred} off="no live prices" />
          </ul>
        </div>
        <p className="text-[11px] leading-snug text-faint">
          Every flow is assigned to its shortest sea path. A blockage removes severity × capacity from every lane within its radius; displaced
          volume takes the shortest path avoiding all affected lanes, or is stranded. Scenarios are hypothetical and never describe a real current event.
        </p>
      </div>
    </details>
  );
}

function ServiceRow({ name, on, off }: { name: string; on: boolean | undefined; off: string }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-mute">{name}</span>
      <span className={on ? "text-ink" : "text-faint"}>{on === undefined ? "…" : on ? "configured" : `not set · ${off}`}</span>
    </li>
  );
}
