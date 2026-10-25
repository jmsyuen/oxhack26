"use client";
import type { ScenarioResult } from "@/lib/engine/types";
import { fmtUsd } from "@/lib/format";
import { Badge } from "../ui/Badge";
import { Section } from "../ui/Section";
import { Tip } from "../ui/Tip";

export function CommoditiesSection({ result }: { result: ScenarioResult | null }) {
  const rows = result?.commodities ?? [];
  const max = Math.max(1, ...rows.map((c) => c.disruptedUsd));
  const any = rows.some((c) => c.disruptedUsd > 0);
  return (
    <Section title="By commodity" right={<Badge kind="MODELLED" />}>
      <div className="mb-1.5 flex items-center gap-3 text-[11px] text-mute">
        <span className="flex items-center gap-1"><i className="inline-block h-[6px] w-[10px] rounded-[1px] bg-amber" />Rerouted</span>
        <span className="flex items-center gap-1"><i className="inline-block h-[6px] w-[10px] rounded-[1px] bg-strand" />Stranded</span>
      </div>
      {!any ? (
        <p className="py-1 text-[12px] text-mute">No cargo disrupted yet.</p>
      ) : (
        <ul className="space-y-[3px]">
          {rows.map((c) => (
            <li key={c.id}>
              <Tip width={250} className="block" content={
                <span className="num block space-y-0.5 text-mute">
                  <span className="block font-sans text-ink">{c.label}</span>
                  <span className="block">Rerouted {fmtUsd(c.reroutedUsd)}</span>
                  <span className="block">Stranded {fmtUsd(c.strandedUsd)}</span>
                  <span className="block">Delayed in place {fmtUsd(c.congestedUsd)}</span>
                  <span className="block">Extra shipping cost {fmtUsd(c.extraCostUsd)}</span>
                </span>
              }>
                <div tabIndex={0} className="grid grid-cols-[150px_1fr_62px] items-center gap-2">
                  <span className={`truncate text-[12px] ${c.disruptedUsd > 0 ? "text-ink" : "text-faint"}`}>{c.label}</span>
                  <span className="relative flex h-[8px] overflow-hidden rounded-[1px] bg-line/60">
                    <span className="h-full bg-amber/85 transition-[width] duration-300 ease-out" style={{ width: `${(c.reroutedUsd / max) * 100}%` }} />
                    <span className="h-full bg-strand/80 transition-[width] duration-300 ease-out" style={{ width: `${(c.strandedUsd / max) * 100}%` }} />
                  </span>
                  <span className={`num text-right text-[12px] ${c.disruptedUsd > 0 ? "text-ink" : "text-faint"}`}>{fmtUsd(c.disruptedUsd)}</span>
                </div>
              </Tip>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
