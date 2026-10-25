"use client";
import { runtime } from "@/lib/runtime";
import { useEffect, useState } from "react";
import { FORMULAS } from "@/lib/engine/assumptions";
import type { ScenarioResult } from "@/lib/engine/types";
import { fmtPct } from "@/lib/format";
import { Badge } from "../ui/Badge";
import { Section } from "../ui/Section";
import { Tip } from "../ui/Tip";

interface PriceItem { id: "oil" | "gas" | "food"; label: string; unit: string; value: number | null; date: string | null; series: string; freq: string }
interface PriceResp { configured: boolean; items: PriceItem[]; error?: string; fetchedAt?: string }

const ROWS: { id: PriceItem["id"]; label: string; unit: string; formula: string }[] = [
  { id: "oil", label: "Brent crude", unit: "$/bbl", formula: FORMULAS.oil },
  { id: "gas", label: "LNG, Asia", unit: "$/MMBtu", formula: FORMULAS.gas },
  { id: "food", label: "Wheat", unit: "$/t", formula: FORMULAS.food },
];

export function PricesSection({ result }: { result: ScenarioResult | null }) {
  const [prices, setPrices] = useState<PriceResp | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (!runtime.hasServer) return;
      fetch("/api/prices").then((r) => r.json()).then((j: PriceResp) => { if (alive) { setPrices(j); setFailed(false); } })
        .catch(() => { if (alive) setFailed(true); });
    };
    load();
    const t = setInterval(load, 10 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const pct = { oil: result?.price.oilPct ?? 0, gas: result?.price.gasPct ?? 0, food: result?.price.foodPct ?? 0 };
  const live = prices?.configured ? prices.items : [];
  return (
    <Section title="Commodity prices" right={<span className="flex items-center gap-1">{live.length > 0 && <Badge kind="OBSERVED" title="Live price (FRED)" />}<Badge kind="MODELLED" title="Price pressure" /></span>}>
      <div className="mb-1 grid grid-cols-[1fr_74px_52px_74px] gap-2 text-[10px] uppercase tracking-[0.08em] text-faint">
        <span>Benchmark</span><span className="text-right">Latest</span><span className="text-right">Pressure</span><span className="text-right">Shock-adj.</span>
      </div>
      <ul className="space-y-1">
        {ROWS.map((row) => {
          const p = live.find((x) => x.id === row.id);
          const v = p?.value ?? null;
          const adj = v !== null ? v * (1 + pct[row.id] / 100) : null;
          return (
            <li key={row.id} className="grid grid-cols-[1fr_74px_52px_74px] items-baseline gap-2">
              <span className="min-w-0">
                <span className="block truncate text-[12px] text-ink">{row.label}</span>
                <span className="num block truncate text-[10px] text-faint">{p?.date ? `FRED ${p.series} · ${p.date}` : row.unit}</span>
              </span>
              <span className="num text-right text-[12px] text-ink">{v !== null ? v.toFixed(2) : "—"}</span>
              <Tip content={row.formula} width={300} className="text-right">
                <span tabIndex={0} className={`num cursor-help text-[12px] ${pct[row.id] >= 1 ? "text-red" : "text-mute"}`}>{fmtPct(pct[row.id], 0, true)}</span>
              </Tip>
              <span className="num text-right text-[12px] text-ink">{adj !== null ? adj.toFixed(2) : "—"}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] leading-snug text-faint">
        {failed ? "Price service unreachable." : !prices ? "Checking price feed…" : !prices.configured
          ? "Live prices are off. Add FRED_API_KEY to .env.local to show latest prices; pressure is modelled either way."
          : prices.error ? `Price feed error: ${prices.error}` : "Latest FRED observation, cached 10 min. Shock-adjusted = latest × (1 + pressure)."}
      </p>
    </Section>
  );
}
