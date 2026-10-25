import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";
import type { ImpactEngine } from "@/lib/engine/engine";
import { circleRing, destination } from "@/lib/engine/geo";
import type { Blockage, LonLat } from "@/lib/engine/types";

export const STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export const C = {
  cyan: "#2EC4E6",
  red: "#EF5A5F",
  amber: "#F2A93B",
  green: "#34C38F",
  strand: "#8C96A8",
  ink: "#E6EDF5",
  bg: "#070B12",
};

/** Offline fallback: plain dark background; countries are drawn from bundled polygons. */
export const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#060a10" } }],
};

export async function resolveStyle(): Promise<{ style: StyleSpecification | string; offline: boolean }> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(STYLE_URL, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(String(r.status));
    return { style: (await r.json()) as StyleSpecification, offline: false };
  } catch {
    return { style: FALLBACK_STYLE, offline: true };
  }
}

export function lanesGeoJSON(engine: ImpactEngine): GeoJSON.FeatureCollection {
  let max = 0;
  for (let e = 0; e < engine.nEdges; e++) max = Math.max(max, engine.edgeBase[e]);
  const sq = Math.sqrt(max || 1);
  return {
    type: "FeatureCollection",
    features: engine.data.network.edges.map((edge, e) => {
      const coords = engine.edgeDir[e] < 0 ? [...edge.coords].reverse() : edge.coords;
      return {
        type: "Feature",
        id: e,
        properties: { id: e, w: Math.sqrt(engine.edgeBase[e]) / sq, base: engine.edgeBase[e] },
        geometry: { type: "LineString", coordinates: coords },
      };
    }),
  };
}

export function chokepointsGeoJSON(engine: ImpactEngine): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: engine.data.chokepoints.map((c, i) => ({
      type: "Feature",
      id: i,
      properties: { id: c.id, name: c.name, idx: i },
      geometry: { type: "Point", coordinates: [c.lon, c.lat] },
    })),
  };
}

export interface BlockageDrawOpts {
  selectedId: string | null;
  activeIds: Set<string> | null;
  /** per-id 0..1 grow factor for preset entry animation */
  grow?: Map<string, number>;
}

export function blockagesGeoJSON(bs: Blockage[], o: BlockageDrawOpts) {
  const fill: GeoJSON.Feature[] = [];
  const ring: GeoJSON.Feature[] = [];
  const handle: GeoJSON.Feature[] = [];
  for (const b of bs) {
    const g = o.grow?.get(b.id) ?? 1;
    const r = Math.max(1, b.radiusKm * (0.35 + 0.65 * g));
    const c: LonLat = [b.lon, b.lat];
    const active = !o.activeIds || o.activeIds.has(b.id);
    const props = { id: b.id, sev: b.severity * g, sel: b.id === o.selectedId ? 1 : 0, active: active ? 1 : 0 };
    fill.push({ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [circleRing(c, r)] } });
    ring.push({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: circleRing(c, r * 1.16, 96) } });
    if (b.id === o.selectedId) {
      handle.push({ type: "Feature", properties: { id: b.id }, geometry: { type: "Point", coordinates: destination(c, r, 90) } });
    }
  }
  const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
  return { fill: fc(fill), ring: fc(ring), handle: fc(handle) };
}

export function ghostGeoJSON(c: LonLat | null, radiusKm: number): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: c ? [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [circleRing(c, radiusKm)] } }] : [],
  };
}

export const DASH_SEQUENCE: number[][] = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
];

export function traceGradient(p: number): ExpressionSpecification {
  if (p >= 0.985) return ["interpolate", ["linear"], ["line-progress"], 0, "rgba(242,169,59,0.85)", 1, "rgba(242,169,59,0.85)"];
  const head = Math.max(0.001, p);
  return [
    "interpolate", ["linear"], ["line-progress"],
    0, "rgba(242,169,59,0.35)",
    head * 0.8 + 0.0001, "rgba(242,169,59,0.7)",
    head, "rgba(255,214,150,1)",
    Math.min(1, head + 0.012), "rgba(242,169,59,0)",
    ...(head + 0.012 < 1 ? [1, "rgba(242,169,59,0)"] : []),
  ] as ExpressionSpecification;
}

/** Exposure (% of GDP) → 0..1 tint intensity: power 0.75 scale, saturating at 1.5% of GDP (0.6% ≈ mid-tone). */
export const EXPOSURE_SATURATION_PCT = 1.5;
export const tintOf = (pctGdp: number) => Math.min(1, Math.pow(Math.max(0, pctGdp) / EXPOSURE_SATURATION_PCT, 0.75));
