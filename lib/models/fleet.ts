import type { CommodityMeta, CpRoute, LonLat } from "../engine/types";
import { DECISION_ASSUMPTIONS, TOLLS, VESSEL_SPECS, type Urgency } from "./assumptions";
import type { Forecast } from "./forecast";
import { mulberry32 } from "./rng";
import type { VesselTypeId } from "./types";

/** One SIMULATED vessel due at the chokepoint within the forecast window. */
export interface Vessel {
  id: string;
  type: VesselTypeId;
  commodity: string;
  route: number;
  from: string;
  to: string;
  /** days from now until it would reach the chokepoint */
  arrival: number;
  distToCpNm: number;
  inPort: boolean;
  pos: LonLat;
  speedKn: number;
  cargoUsd: number;
  slackDays: number;
  penaltyPerDay: number;
  /** cost per day waiting (opex + anchor fuel + cargo carry) and per extra day at sea */
  waitPerDay: number;
  seaPerDay: number;
  toll: number;
  feasible: boolean;
  extraNm: number;
  backtrackNm: number;
  extraDays: number;
  /** deterministic reroute cost (USD) */
  rerouteCost: number;
}

export interface FleetParams {
  cpId: string;
  /** vessels due at the chokepoint within this many days are in the decision set */
  windowDays: number;
  fuelMultiplier: number;
  urgency: Urgency;
  seed: number;
}

const TYPES: VesselTypeId[] = ["container", "tanker", "dry_bulk", "general_cargo", "roro"];

function pick<T>(rand: () => number, items: T[], w: number[]): T {
  let tot = 0;
  for (const x of w) tot += x;
  let r = rand() * tot;
  for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

function along(route: CpRoute, arcFromOrigin: number): LonLat {
  const total = route.cumNm[route.cumNm.length - 1] || 1;
  const target = Math.max(0, Math.min(1, arcFromOrigin / Math.max(1, route.baseNm))) * total;
  const c = route.cumNm;
  let i = 1;
  while (i < c.length - 1 && c[i] < target) i++;
  const f = c[i] > c[i - 1] ? (target - c[i - 1]) / (c[i] - c[i - 1]) : 0;
  const [a, b] = [route.coords[i - 1], route.coords[i]];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/**
 * Deterministic synthetic fleet: daily arrival counts from the XGBoost forecast, ship classes from the observed
 * PortWatch mix at the chokepoint, routes from the network's busiest port pairs through it (weighted by
 * ship-equivalents of the cargo that class carries), cargo values from the trade model's per-ship cargo table.
 */
export function generateFleet(
  fc: Forecast, mix: Record<VesselTypeId, number>, routes: CpRoute[], commodities: CommodityMeta[], p: FleetParams,
): Vessel[] {
  const rand = mulberry32(p.seed);
  const A = DECISION_ASSUMPTIONS;
  const urg = A.urgency[p.urgency];
  const fuel = A.fuelUsdPerT * p.fuelMultiplier;
  const kIdx = new Map(commodities.map((c, i) => [c.id, i]));
  const out: Vessel[] = [];
  if (!routes.length) return out;
  let n = 0;
  // days 1–7: XGBoost forecast; beyond: its 7-day mean (labelled as such in the UI)
  const daily = Array.from({ length: p.windowDays }, (_, i) => ({ h: i + 1, mean: fc.days[i]?.mean ?? fc.weekMean }));
  let carry = 0;
  for (const d of daily) {
    const want = d.mean + carry;
    const count = Math.max(0, Math.round(want));
    carry = want - count;
    for (let j = 0; j < count; j++) {
      const type = pick(rand, TYPES, TYPES.map((t) => mix[t] + 1e-6));
      const spec = VESSEL_SPECS[type];
      const ks = spec.carries.map((c) => kIdx.get(c)!).filter((k) => k !== undefined);
      const wByRoute = routes.map((r) => ks.reduce((a, k) => a + r.shipsByCommodity[k], 0));
      const anyW = wByRoute.some((w) => w > 0);
      const ri = pick(rand, routes.map((_, i) => i), anyW ? wByRoute : routes.map((r) => r.shipsPerYear));
      const route = routes[ri];
      const k = anyW ? pick(rand, ks, ks.map((kk) => route.shipsByCommodity[kk] + 1e-9)) : ks[0];
      const arrival = d.h - 1 + (j + 0.2 + 0.6 * rand()) / count;
      const dist = arrival * 24 * spec.speedKn;
      const inPort = dist >= route.nmToCp;
      const pos = along(route, Math.max(0, route.nmToCp - dist));
      const cargoUsd = commodities[k].cargoMusdPerShip * 1e6 * spec.cargoScale * (0.75 + 0.5 * rand());
      const carry = (cargoUsd * A.cargoCarryPerYear) / 365;
      const slackDays = urg.slack[0] + (urg.slack[1] - urg.slack[0]) * rand();
      const toll = TOLLS[p.cpId]?.[type] ?? 0;
      // best alternative from where the ship is now: sail (forward or back) to a node on its route, then avoid the blockage
      const x = Math.max(0, route.nmToCp - dist);
      let bestNm = Infinity, backNm = 0;
      route.nodeCum.forEach((c, jj) => {
        const viaNm = Math.abs(x - c) + route.altFrom[jj];
        if (viaNm < bestNm) { bestNm = viaNm; backNm = c < x ? x - c : 0; }
      });
      const feasible = isFinite(bestNm);
      const backtrackNm = feasible ? 2 * backNm : 0;
      const extraNm = feasible ? Math.max(0, bestNm - (route.baseNm - x)) : Infinity;
      const extraDays = extraNm / (spec.speedKn * 24);
      const seaPerDay = spec.opexPerDay + spec.seaFuelT * fuel + carry;
      const waitPerDay = spec.opexPerDay + spec.anchorFuelT * fuel + carry;
      const penaltyPerDay = cargoUsd * urg.penaltyShare;
      const rerouteCost = feasible ? extraDays * seaPerDay + penaltyPerDay * Math.max(0, extraDays - slackDays) - toll : Infinity;
      out.push({
        id: `${p.cpId.slice(0, 2).toUpperCase()}-${String(++n).padStart(3, "0")}`,
        type, commodity: commodities[k].id, route: ri, from: route.from, to: route.to, arrival, distToCpNm: dist, inPort, pos,
        speedKn: spec.speedKn, cargoUsd, slackDays, penaltyPerDay, waitPerDay, seaPerDay, toll, feasible,
        extraNm, backtrackNm, extraDays, rerouteCost,
      });
    }
  }
  out.sort((a, b) => a.arrival - b.arrival);
  return out;
}
