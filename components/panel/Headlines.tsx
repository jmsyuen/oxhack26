"use client";
import { FORMULAS } from "@/lib/engine/assumptions";
import type { EngineData, ScenarioResult } from "@/lib/engine/types";
import { fmtPct, fmtUsd } from "@/lib/format";
import { Badge } from "../ui/Badge";
import { Figure } from "./Figure";

const inputsLine = "Inputs: bilateral trade flows (SEED gravity estimate until BACI is loaded), sea-lane network (MODELLED).";

function Formula({ text }: { text: string }) {
  return (
    <span className="block">
      <span className="block">{text}</span>
      <span className="mt-1.5 block text-[11px] text-mute">{inputsLine}</span>
    </span>
  );
}

export function Headlines({ result, data }: { result: ScenarioResult | null; data: EngineData }) {
  const r = result;
  const has = !!r && r.any;
  const span =
    !r || r.horizonDays === 0
      ? "No active blockage"
      : r.viewDay >= r.horizonDays
        ? `Days 0–${r.horizonDays}, cumulative`
        : `Day ${Math.round(r.viewDay)} of ${r.horizonDays}, cumulative`;
  const share = has && r!.disruptedUsd > 0 ? (r!.reroutedUsd / r!.disruptedUsd) * 100 : 0;
  const trade = data.datasets.find((d) => d.id === "trade");
  return (
    <section aria-label="Scenario impact" className="border-b border-line bg-panel">
      <header className="flex h-9 items-center justify-between border-b border-line px-4">
        <h2 className="lbl text-ink">Impact</h2>
        <span className="num text-[11px] text-mute">{span}</span>
      </header>
      <div className="grid grid-cols-2 [&>*:nth-child(odd)]:border-r [&>*]:border-b [&>*]:border-line [&>*:nth-last-child(-n+2)]:border-b-0">
        <Figure label="Trade disrupted" value={r?.disruptedUsd ?? 0} format={(v) => fmtUsd(v)} deltaFormat={(d) => fmtUsd(d, { sign: true })}
          formula={<Formula text={FORMULAS.disrupted} />} muted={!has}
          sub={has && r!.congestedUsd > 0 ? `+ ${fmtUsd(r!.congestedUsd)} delayed in place` : "forced off its normal route"} />
        <Figure label="Rerouted" value={r?.reroutedUsd ?? 0} format={(v) => fmtUsd(v)} deltaFormat={(d) => fmtUsd(d, { sign: true })}
          formula={<Formula text={FORMULAS.rerouted} />} muted={!has} worseWhenUp={false}
          sub={has ? `${share.toFixed(0)}% of disrupted finds a route` : "via an alternative sea path"} />
        <Figure label="Stranded" value={r?.strandedUsd ?? 0} format={(v) => fmtUsd(v)} deltaFormat={(d) => fmtUsd(d, { sign: true })}
          formula={<Formula text={FORMULAS.stranded} />} muted={!has}
          sub="no alternative route" />
        <Figure label="Extra transit" value={r?.avgExtraDays ?? 0} format={(v) => `${v.toFixed(1)} d`} deltaFormat={(d) => `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} d`}
          formula={<Formula text={FORMULAS.extraDays} />} muted={!has}
          sub="value-weighted average" />
        <Figure label="Shipping cost" value={r?.extraCostUsd ?? 0} format={(v) => fmtUsd(v)} deltaFormat={(d) => fmtUsd(d, { sign: true })}
          formula={<Formula text={FORMULAS.extraCost} />} muted={!has}
          sub="extra freight, fuel, inventory" />
        <Figure label="Oil price" value={r?.price.oilPct ?? 0} format={(v) => fmtPct(v, 0, true)} deltaFormat={(d) => fmtPct(d, 0, true)}
          formula={<Formula text={FORMULAS.oil} />} muted={!has}
          sub={`pressure · LNG ${fmtPct(r?.price.gasPct ?? 0, 0, true)} · grain ${fmtPct(r?.price.foodPct ?? 0, 0, true)}`} />
      </div>
      {trade && trade.status !== "OBSERVED" && (
        <div className="flex items-center gap-2 border-t border-line px-4 py-1.5 text-[11px] text-mute">
          <Badge kind="SEED" />
          <span className="truncate">Trade inputs are estimates. Load CEPII BACI for observed flows.</span>
        </div>
      )}
    </section>
  );
}
