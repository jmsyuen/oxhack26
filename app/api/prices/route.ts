import { NextResponse } from "next/server";
import { getConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

const SERIES = [
  { id: "oil", series: "DCOILBRENTEU", label: "Brent crude", unit: "$/bbl", freq: "daily" },
  { id: "gas", series: "PNGASJPUSDM", label: "LNG, Asia", unit: "$/MMBtu", freq: "monthly" },
  { id: "food", series: "PWHEAMTUSDM", label: "Wheat", unit: "$/t", freq: "monthly" },
] as const;

type Item = { id: string; label: string; unit: string; value: number | null; date: string | null; series: string; freq: string };
const TTL_MS = 10 * 60 * 1000;
const g = globalThis as unknown as { __priceCache?: { at: number; items: Item[] } };

async function latest(series: string, key: string) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${key}&file_type=json&sort_order=desc&limit=10`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`FRED ${series}: HTTP ${r.status}`);
  const j = (await r.json()) as { observations?: { date: string; value: string }[] };
  const o = (j.observations ?? []).find((x) => x.value !== "." && !Number.isNaN(Number(x.value)));
  return o ? { value: Number(o.value), date: o.date } : { value: null, date: null };
}

export async function GET() {
  const { fred } = getConfig();
  if (!fred.key) return NextResponse.json({ configured: false, items: [] });
  if (g.__priceCache && Date.now() - g.__priceCache.at < TTL_MS)
    return NextResponse.json({ configured: true, cached: true, fetchedAt: new Date(g.__priceCache.at).toISOString(), items: g.__priceCache.items });
  try {
    const items: Item[] = await Promise.all(
      SERIES.map(async (s) => ({ id: s.id, label: s.label, unit: s.unit, series: s.series, freq: s.freq, ...(await latest(s.series, fred.key)) })),
    );
    g.__priceCache = { at: Date.now(), items };
    return NextResponse.json({ configured: true, cached: false, fetchedAt: new Date().toISOString(), items });
  } catch (e) {
    return NextResponse.json({ configured: true, error: e instanceof Error ? e.message : "FRED unreachable", items: g.__priceCache?.items ?? [] }, { status: 502 });
  }
}
