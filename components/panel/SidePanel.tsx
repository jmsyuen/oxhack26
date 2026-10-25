"use client";
import type { ImpactEngine } from "@/lib/engine/engine";
import type { ScenarioResult } from "@/lib/engine/types";
import { BlockagesSection } from "./Blockages";
import { ChokepointsSection } from "./Chokepoints";
import { CommoditiesSection } from "./Commodities";
import { CountriesSection } from "./Countries";
import { DataNotes } from "./DataNotes";
import { Headlines } from "./Headlines";
import { PricesSection } from "./Prices";

export default function SidePanel({ engine, result }: { engine: ImpactEngine; result: ScenarioResult | null }) {
  const data = engine.data;
  return (
    <aside aria-label="Scenario results" className="scroll-thin flex min-h-0 flex-col overflow-y-auto border-l border-line bg-panel">
      <div data-tour="impact" className="sticky top-0 z-10"><Headlines result={result} data={data} /></div>
      <BlockagesSection engine={engine} />
      <CountriesSection result={result} data={data} />
      <CommoditiesSection result={result} />
      <ChokepointsSection result={result} data={data} />
      <PricesSection result={result} />
      <DataNotes data={data} />
      <p className="px-4 py-3 text-[11px] leading-snug text-faint">
        CHOKEPOINT models hypothetical disruptions. Figures are estimates from the stated assumptions, not forecasts.
      </p>
    </aside>
  );
}
