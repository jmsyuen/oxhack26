"use client";
import { useState } from "react";
import { FORMULAS } from "@/lib/engine/assumptions";
import type { EngineData, ScenarioResult } from "@/lib/engine/types";
import { fmtPct, fmtUsd } from "@/lib/format";
import { Badge } from "../ui/Badge";
import { Section } from "../ui/Section";
import { Segmented } from "../ui/Segmented";
import { Tip } from "../ui/Tip";

const SHORT: Record<string, string> = { ARE: "UAE", GBR: "United Kingdom", USA: "United States" };

type Side = "imp" | "exp";
type Metric = "usd" | "gdp";

export function CountriesSection({ result, data }: { result: ScenarioResult | null; data: EngineData }) {
  const [side, setSide] = useState<Side>("imp");
  const [metric, setMetric] = useState<Metric>("usd");
  const val = (c: ScenarioResult["countries"][number]) =>
    metric === "usd" ? (side === "imp" ? c.importUsd : c.exportUsd) : side === "imp" ? c.importPctGdp : c.exportPctGdp;
  const rows = (result?.countries ?? []).filter((c) => val(c) > 0).sort((a, b) => val(b) - val(a)).slice(0, 10);
  const max = rows.length ? val(rows[0]) : 1;
  const labels = data.flows.commodities;
  return (
    <Section
      title="Most exposed"
      right={
        <div className="flex items-center gap-1.5">
          <Segmented label="Trade side" value={side} onChange={setSide} options={[{ value: "imp", label: "Importers" }, { value: "exp", label: "Exporters" }]} />
          <Segmented label="Metric" value={metric} onChange={setMetric} options={[{ value: "usd", label: "USD" }, { value: "gdp", label: "% GDP" }]} />
        </div>
      }
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-faint">
        <Badge kind="MODELLED" />
        <Tip content={FORMULAS.exposure}><span tabIndex={0} className="cursor-help border-b border-dotted border-line-2">
          {side === "imp" ? "Imports" : "Exports"} forced off route{metric === "gdp" ? ", as % of GDP" : ""}
        </span></Tip>
      </div>
      {rows.length === 0 ? (
        <p className="py-1 text-[12px] text-mute">No country exposed yet.</p>
      ) : (
        <ol className="space-y-[3px]">
          {rows.map((c, i) => {
            const v = val(c);
            return (
              <li key={c.iso3}>
                <Tip width={230} content={
                  <span className="block space-y-0.5">
                    <span className="block text-ink">{c.name}</span>
                    <span className="num block text-mute">Exports hit {fmtUsd(c.exportUsd)} · imports hit {fmtUsd(c.importUsd)}</span>
                    <span className="num block text-mute">Stranded {fmtUsd(c.strandedUsd)} · {fmtPct(c.pctGdp, 2)} of GDP</span>
                    <span className="block text-mute">Top commodity: {labels[c.topCommodity].label}</span>
                  </span>
                } className="block">
                  <div className="grid grid-cols-[14px_108px_1fr_62px] items-center gap-2" tabIndex={0}>
                    <span className="num text-right text-[10px] text-faint">{i + 1}</span>
                    <span className="truncate text-[12px] text-ink">{SHORT[c.iso3] ?? c.name}</span>
                    <span className="relative h-[8px] overflow-hidden rounded-[1px] bg-line/60">
                      <span className="absolute inset-y-0 left-0 bg-red/80 transition-[width] duration-300 ease-out" style={{ width: `${Math.max(1.5, (v / max) * 100)}%` }} />
                    </span>
                    <span className="num text-right text-[12px] text-ink">{metric === "usd" ? fmtUsd(v) : fmtPct(v, 2)}</span>
                  </div>
                </Tip>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}
