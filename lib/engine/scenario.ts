import { ASSUMPTIONS } from "./assumptions";
import { CV, ImpactEngine, N_COMMODITIES } from "./engine";
import type { Blockage, ChokepointShift, CountryExposure, RateResult, ScenarioResult } from "./types";

const MUSD = 1e6;

interface Segment {
  start: number;
  end: number;
  ids: string[];
  rate: RateResult;
}

/**
 * All blockages start on day 0 and last `durationDays`. Between consecutive end dates the set of
 * active blockages is constant, so the scenario is a sum of constant-rate segments:
 *   cumulative(t) = Σ_s rate_s × overlap(segment_s, [0, t]) / 365
 * This keeps duration scaling exact (doubling every duration doubles disrupted value) and never
 * double-counts a flow, because each segment evaluates the combined effect of its active set once.
 */
export function buildSegments(engine: ImpactEngine, blockages: Blockage[], cache?: Map<string, RateResult>): Segment[] {
  const live = blockages.filter((b) => b.durationDays > 0);
  const ends = [...new Set(live.map((b) => b.durationDays))].sort((a, b) => a - b);
  const segs: Segment[] = [];
  let prev = 0;
  for (const end of ends) {
    const active = live.filter((b) => b.durationDays >= end);
    const sig = active
      .map((b) => `${b.id}:${b.lon.toFixed(4)}:${b.lat.toFixed(4)}:${b.radiusKm.toFixed(1)}:${b.severity.toFixed(4)}`)
      .sort()
      .join("|");
    let rate = cache?.get(sig);
    if (!rate) {
      rate = engine.run(active);
      cache?.set(sig, rate);
    }
    segs.push({ start: prev, end, ids: active.map((b) => b.id), rate });
    prev = end;
  }
  return segs;
}

function buffer(day: number) {
  return 1 - Math.exp(-day / ASSUMPTIONS.inventoryTauDays);
}

export function summarise(
  engine: ImpactEngine,
  blockages: Blockage[],
  viewDay: number | null,
  cache?: Map<string, RateResult>,
): ScenarioResult {
  const segs = buildSegments(engine, blockages, cache);
  const horizon = segs.length ? segs[segs.length - 1].end : 0;
  const t = viewDay === null ? horizon : Math.max(0, Math.min(horizon, viewDay));
  const { data } = engine;
  const nC = engine.nCountries;

  const w = segs.map((s) => Math.max(0, Math.min(t, s.end) - s.start) / 365);
  const acc = { disrupted: 0, rerouted: 0, stranded: 0, congested: 0, extraCost: 0, valueDays: 0 };
  const byK = Array.from({ length: N_COMMODITIES }, () => ({ ...acc }));
  const country = new Float64Array(nC * CV.STRIDE);
  const countryK = new Float64Array(nC * N_COMMODITIES);

  segs.forEach((s, i) => {
    const wi = w[i];
    if (wi <= 0 || !s.rate.any) return;
    const r = s.rate;
    acc.disrupted += r.disrupted * wi;
    acc.rerouted += r.rerouted * wi;
    acc.stranded += r.stranded * wi;
    acc.congested += r.congested * wi;
    acc.extraCost += r.extraCost * wi;
    acc.valueDays += r.valueDays * wi;
    r.byCommodity.forEach((c, k) => {
      byK[k].disrupted += c.disrupted * wi;
      byK[k].rerouted += c.rerouted * wi;
      byK[k].stranded += c.stranded * wi;
      byK[k].congested += c.congested * wi;
      byK[k].extraCost += c.extraCost * wi;
    });
    for (let j = 0; j < country.length; j++) country[j] += r.country[j] * wi;
    for (let j = 0; j < countryK.length; j++) countryK[j] += r.countryCommodity[j] * wi;
  });

  // instantaneous set: full-scenario view shows the peak (all blockages active)
  let activeIdx = -1;
  if (segs.length) {
    if (viewDay === null) activeIdx = 0;
    else {
      activeIdx = segs.findIndex((s) => t >= s.start && t < s.end);
      if (activeIdx < 0) activeIdx = segs.length - 1;
    }
  }
  const active = activeIdx >= 0 ? segs[activeIdx].rate : null;

  const countryMeta = data.flows.countries.map((iso) => data.countries.find((c) => c.iso3 === iso)!);
  const countries: CountryExposure[] = countryMeta.map((c, i) => {
    const o = i * CV.STRIDE;
    const exp = country[o + CV.EXP] * MUSD;
    const imp = country[o + CV.IMP] * MUSD;
    let topK = 0;
    for (let k = 1; k < N_COMMODITIES; k++) if (countryK[i * N_COMMODITIES + k] > countryK[i * N_COMMODITIES + topK]) topK = k;
    return {
      idx: i, iso3: c.iso3, name: c.name,
      exportUsd: exp, importUsd: imp, totalUsd: exp + imp,
      strandedUsd: (country[o + CV.EXP_STRANDED] + country[o + CV.IMP_STRANDED]) * MUSD,
      extraCostUsd: country[o + CV.COST] * MUSD,
      pctGdp: ((exp + imp) / c.gdpUsd) * 100,
      exportPctGdp: (exp / c.gdpUsd) * 100,
      importPctGdp: (imp / c.gdpUsd) * 100,
      topCommodity: topK,
    };
  });

  const chokepoints: ChokepointShift[] = data.chokepoints.map((cp, i) => {
    const base = engine.chokepointBase[i];
    const now = active && active.any ? active.chokepointNew[i] : base;
    const pct = base > 0 ? ((now - base) / base) * 100 : 0;
    const dShips = active && active.any ? active.chokepointShipsNew[i] / 365 : 0;
    const shipsNew = Math.max(0, cp.shipsPerDay + dShips);
    const shipsPct = cp.shipsPerDay > 0 ? ((shipsNew - cp.shipsPerDay) / cp.shipsPerDay) * 100 : 0;
    let blocked = false;
    if (active && active.any) {
      const n = engine.nodeIdx.get(cp.node)!;
      for (const { e } of engine.adj[n]) if (active.edgeCap[e] < 1 - 1e-9) blocked = true;
    }
    return {
      id: cp.id, name: cp.name, baseValue: base * MUSD, newValue: Math.max(0, now) * MUSD, pct, shipsPct,
      shipsBase: cp.shipsPerDay, shipsNew, blocked,
    };
  });

  // price pressure: at viewDay for scrubbing, peak across the scenario for the full view
  const M = ASSUMPTIONS.priceMultiplier;
  let price = { oilPct: 0, gasPct: 0, foodPct: 0, oilShare: 0, gasShare: 0, foodShare: 0 };
  const evalAt = (s: Segment, day: number) => {
    const b = buffer(day);
    const sh = s.rate.supplyShare;
    return { oilPct: M.oil * sh.oil * b * 100, gasPct: M.gas * sh.gas * b * 100, foodPct: M.food * sh.food * b * 100,
             oilShare: sh.oil * 100, gasShare: sh.gas * 100, foodShare: sh.food * 100 };
  };
  if (segs.length) {
    if (viewDay === null) {
      for (const s of segs) {
        const p = evalAt(s, s.end);
        price = {
          oilPct: Math.max(price.oilPct, p.oilPct), gasPct: Math.max(price.gasPct, p.gasPct),
          foodPct: Math.max(price.foodPct, p.foodPct), oilShare: Math.max(price.oilShare, p.oilShare),
          gasShare: Math.max(price.gasShare, p.gasShare), foodShare: Math.max(price.foodShare, p.foodShare),
        };
      }
    } else if (t > 0) price = evalAt(segs[activeIdx], t);
  }

  const timeline: ScenarioResult["timeline"] = [];
  if (horizon > 0) {
    const step = horizon > 120 ? 2 : 1;
    for (let d = 0; d <= horizon; d += step) timeline.push(cumAt(segs, d));
    if (timeline[timeline.length - 1].day !== horizon) timeline.push(cumAt(segs, horizon));
  }

  return {
    any: segs.some((s) => s.rate.any),
    horizonDays: horizon,
    viewDay: t,
    disruptedUsd: acc.disrupted * MUSD,
    reroutedUsd: acc.rerouted * MUSD,
    strandedUsd: acc.stranded * MUSD,
    congestedUsd: acc.congested * MUSD,
    extraCostUsd: acc.extraCost * MUSD,
    avgExtraDays: acc.rerouted + acc.congested > 0 ? acc.valueDays / (acc.rerouted + acc.congested) : 0,
    commodities: data.flows.commodities.map((c, k) => ({
      idx: k, id: c.id, label: c.label,
      disruptedUsd: byK[k].disrupted * MUSD, reroutedUsd: byK[k].rerouted * MUSD,
      strandedUsd: byK[k].stranded * MUSD, congestedUsd: byK[k].congested * MUSD,
      extraCostUsd: byK[k].extraCost * MUSD,
    })),
    countries,
    chokepoints,
    price,
    active,
    activeIds: activeIdx >= 0 ? segs[activeIdx].ids : [],
    timeline,
  };
}

function cumAt(segs: Segment[], day: number) {
  let d = 0, s = 0, c = 0;
  for (const seg of segs) {
    const wi = Math.max(0, Math.min(day, seg.end) - seg.start) / 365;
    d += seg.rate.disrupted * wi;
    s += seg.rate.stranded * wi;
    c += seg.rate.extraCost * wi;
  }
  return { day, disrupted: d * MUSD, stranded: s * MUSD, extraCost: c * MUSD };
}
