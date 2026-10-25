import type { ImpactEngine } from "./engine/engine";
import { haversineKm } from "./engine/geo";
import type { LonLat } from "./engine/types";
import { fmtCoord } from "./format";

const DIRECTIONAL = /^(Off|North of|South of|East of|West of|Northeast of|Northwest of|Southeast of|Southwest of)\b/;
const WATER = /(Sea|Ocean|Gulf|Bay|Strait|Channel|Passage|Bight|Belt|Atlantic|Pacific|Mediterranean|Current|Kattegat|Skagerrak|Dardanelles)/;

/** Human place name for a point: nearest chokepoint, port or named waypoint. */
export function placeName(engine: ImpactEngine, lon: number, lat: number): { short: string; phrase: string } {
  const c: LonLat = [lon, lat];
  let cp: { d: number; name: string } | null = null;
  for (const x of engine.data.chokepoints) {
    const d = haversineKm(c, [x.lon, x.lat]);
    if (d < 250 && (!cp || d < cp.d)) cp = { d, name: x.name };
  }
  if (cp) return { short: cp.name, phrase: `the ${cp.name}` };

  let best: { d: number; name: string; kind: string } | null = null;
  for (const n of engine.data.network.nodes) {
    if (n.kind === "chokepoint") continue;
    const d = haversineKm(c, [n.lon, n.lat]);
    if (!best || d < best.d) best = { d, name: n.name, kind: n.kind };
  }
  if (!best || best.d > 900) return { short: fmtCoord(lon, lat), phrase: `at ${fmtCoord(lon, lat)}` };
  if (best.kind === "port" && best.d < 220) return { short: `Off ${best.name}`, phrase: `off ${best.name}` };
  const n = best.name;
  if (DIRECTIONAL.test(n)) return { short: n, phrase: n.charAt(0).toLowerCase() + n.slice(1) };
  if (WATER.test(n)) return { short: n, phrase: `in the ${n}` };
  return { short: `Near ${n}`, phrase: `near ${n}` };
}
