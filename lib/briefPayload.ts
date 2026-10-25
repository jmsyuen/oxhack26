import type { ImpactEngine } from "./engine/engine";
import type { Blockage, ScenarioResult } from "./engine/types";
import { placeName } from "./place";

export interface BriefPayload {
  horizonDays: number;
  blockages: { label: string; place: string; severityPct: number; durationDays: number; radiusKm: number }[];
  totals: {
    disruptedUsd: number; reroutedUsd: number; strandedUsd: number; delayedInPlaceUsd: number;
    extraCostUsd: number; avgExtraDays: number;
  };
  topImporters: { name: string; usd: number; pctGdp: number }[];
  topExporters: { name: string; usd: number; pctGdp: number }[];
  commodities: { label: string; usd: number; strandedSharePct: number }[];
  chokepoints: { name: string; shipsPerDayBefore: number; shipsPerDayAfter: number; changePct: number }[];
  pricePressurePct: { oil: number; lng: number; grain: number };
  tradeDataStatus: string;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export function buildBriefPayload(engine: ImpactEngine, blockages: Blockage[], r: ScenarioResult): BriefPayload {
  const imp = [...r.countries].sort((a, b) => b.importUsd - a.importUsd).filter((c) => c.importUsd > 0).slice(0, 4);
  const exp = [...r.countries].sort((a, b) => b.exportUsd - a.exportUsd).filter((c) => c.exportUsd > 0).slice(0, 4);
  const trade = engine.data.datasets.find((d) => d.id === "trade");
  return {
    horizonDays: r.horizonDays,
    blockages: blockages.map((b, i) => ({
      label: `B${i + 1}`,
      place: placeName(engine, b.lon, b.lat).phrase,
      severityPct: Math.round(b.severity * 100),
      durationDays: b.durationDays,
      radiusKm: Math.round(b.radiusKm),
    })),
    totals: {
      disruptedUsd: Math.round(r.disruptedUsd), reroutedUsd: Math.round(r.reroutedUsd), strandedUsd: Math.round(r.strandedUsd),
      delayedInPlaceUsd: Math.round(r.congestedUsd), extraCostUsd: Math.round(r.extraCostUsd), avgExtraDays: r1(r.avgExtraDays),
    },
    topImporters: imp.map((c) => ({ name: c.name, usd: Math.round(c.importUsd), pctGdp: r1(c.importPctGdp * 100) / 100 })),
    topExporters: exp.map((c) => ({ name: c.name, usd: Math.round(c.exportUsd), pctGdp: r1(c.exportPctGdp * 100) / 100 })),
    commodities: [...r.commodities].sort((a, b) => b.disruptedUsd - a.disruptedUsd).filter((c) => c.disruptedUsd > 0).slice(0, 3)
      .map((c) => ({ label: c.label, usd: Math.round(c.disruptedUsd), strandedSharePct: Math.round((c.strandedUsd / c.disruptedUsd) * 100) })),
    chokepoints: [...r.chokepoints].filter((c) => Math.abs(c.shipsPct) >= 3).sort((a, b) => Math.abs(b.shipsPct) - Math.abs(a.shipsPct)).slice(0, 3)
      .map((c) => ({ name: c.name, shipsPerDayBefore: Math.round(c.shipsBase), shipsPerDayAfter: Math.round(c.shipsNew), changePct: Math.round(c.shipsPct) })),
    pricePressurePct: { oil: Math.round(r.price.oilPct), lng: Math.round(r.price.gasPct), grain: Math.round(r.price.foodPct) },
    tradeDataStatus: trade?.status ?? "SEED",
  };
}
