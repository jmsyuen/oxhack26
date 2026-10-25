/**
 * Sanity checks from PROJECT_BRIEF.md. Run: npm run sanity
 * Exits non-zero if any check fails.
 */
import { readFileSync } from "node:fs";
import { loadModelDataFromDisk } from "../lib/data/node-models";
import { everGivenCheck, findTarget, runDecision } from "../lib/models/decision";
import { features, forecast, indexOf, predictRow, simulateForecast } from "../lib/models/forecast";
import { ImpactEngine } from "../lib/engine/engine";
import { summarise } from "../lib/engine/scenario";
import { loadEngineDataFromDisk } from "../lib/data/node-load";
import { PRESET_POINTS } from "../lib/presets";
import type { Blockage } from "../lib/engine/types";

const t0 = performance.now();
const engine = new ImpactEngine(loadEngineDataFromDisk());
console.log(`engine init ${(performance.now() - t0).toFixed(0)} ms`);
const bn = (x: number) => `$${(x / 1e9).toFixed(1)}bn`;
let failures = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
  if (!ok) failures++;
};
const blk = (id: string, p: { lon: number; lat: number; radiusKm: number }, severity = 1, durationDays = 30): Blockage =>
  ({ id, ...p, severity, durationDays });
const ci = (iso: string) => engine.data.flows.countries.indexOf(iso);

// pair-level helper: value-weighted extra days for flows between two countries
function pairExtraDays(bs: Blockage[], exp: string, imp: string) {
  const r = engine.run(bs);
  return r;
}

// 1. Suez closure: Asia–Europe reroutes around the Cape, +10–14 days
{
  const b = [blk("suez", PRESET_POINTS.suez)];
  const t1 = performance.now();
  const s = summarise(engine, b, null);
  console.log(`  run ${(performance.now() - t1).toFixed(1)} ms`);
  const cape = s.chokepoints.find((c) => c.id === "cape")!;
  // isolate China -> Netherlands containers to read their reroute
  const sub = engine.data.flows.flows.filter((f) => f[0] === ci("CHN") && f[1] === ci("NLD"));
  const tiny = new ImpactEngine({ ...engine.data, flows: { ...engine.data.flows, flows: sub } });
  const r = tiny.run(b);
  const days = r.valueDays / Math.max(1e-9, r.rerouted);
  check("Suez: China→Netherlands reroutes +10–14 days", days >= 10 && days <= 14 && r.stranded < 1e-6,
    `${days.toFixed(1)} days, stranded ${r.stranded.toFixed(0)} MUSD`);
  check("Suez: Cape of Good Hope absorbs traffic", cape.shipsPct > 20, `Cape ${cape.shipsBase} → ${cape.shipsNew.toFixed(0)} ships/day (${cape.shipsPct.toFixed(0)}%), trade value ${cape.pct.toFixed(0)}%`);
  const suezCp = s.chokepoints.find((c) => c.id === "suez")!;
  console.log(`  Suez ships/day ${suezCp.shipsBase} → ${suezCp.shipsNew.toFixed(0)}; calibration ${engine.shipCalibration.toFixed(2)}`);
  console.log(`  Suez 30d: disrupted ${bn(s.disruptedUsd)}, rerouted ${bn(s.reroutedUsd)}, stranded ${bn(s.strandedUsd)}, avg +${s.avgExtraDays.toFixed(1)} d, extra cost ${bn(s.extraCostUsd)}`);
  const ann = engine.run(b);
  console.log(`  Suez annual flow value modelled: ${bn(ann.disrupted * 1e6)}`);
}

// 2. Hormuz: strands most Gulf oil, hits JPN/KOR/IND/CHN hardest
{
  const b = [blk("hormuz", PRESET_POINTS.hormuz)];
  const s = summarise(engine, b, null);
  const crude = s.commodities[0];
  const strandedShare = crude.strandedUsd / Math.max(1, crude.disruptedUsd);
  check("Hormuz: most Gulf crude stranded", strandedShare > 0.5, `${(strandedShare * 100).toFixed(0)}% of disrupted crude stranded`);
  // energy importers outside the Gulf itself
  const gulf = ["SAU", "ARE", "IRQ", "KWT", "QAT", "IRN", "OMN"];
  const r = engine.run(b);
  const energyImp = engine.data.flows.countries
    .map((iso, i) => ({ iso, v: [0, 1, 2].reduce((a, k) => a + 0, 0), i }))
    .filter((c) => !gulf.includes(c.iso));
  // energy imports disrupted per importer: recompute from a filtered engine
  const energyFlows = engine.data.flows.flows.filter((f) => f[2] <= 2);
  const eng2 = new ImpactEngine({ ...engine.data, flows: { ...engine.data.flows, flows: energyFlows } });
  const r2 = eng2.run(b);
  const ranked = energyImp.map((c) => ({ iso: c.iso, v: r2.country[c.i * 5 + 1] })).sort((a, b) => b.v - a.v).slice(0, 5);
  const want = ["JPN", "KOR", "IND", "CHN"];
  const hits = want.filter((w) => ranked.some((x) => x.iso === w));
  check("Hormuz: JPN, KOR, IND, CHN are the top non-Gulf energy importers hit", hits.length === 4,
    ranked.map((x) => `${x.iso} $${(x.v / 1000 * 30 / 365).toFixed(1)}bn`).join(", "));
  const byGdp = [...s.countries].filter((c) => !gulf.includes(c.iso3)).sort((a, b) => b.pctGdp - a.pctGdp).slice(0, 6);
  console.log(`  top non-Gulf exposure %GDP: ${byGdp.map((c) => `${c.iso3} ${c.pctGdp.toFixed(2)}%`).join(", ")}`);
  void r;
  console.log(`  Hormuz 30d: disrupted ${bn(s.disruptedUsd)}, stranded ${bn(s.strandedUsd)}, oil +${s.price.oilPct.toFixed(0)}%, LNG +${s.price.gasPct.toFixed(0)}%`);
}

// 3. Panama barely affects Asia–Europe
{
  const b = [blk("panama", PRESET_POINTS.panama)];
  const asia = ["CHN", "JPN", "KOR", "TWN", "SGP", "MYS", "THA", "VNM", "IDN", "IND", "PHL", "BGD"].map(ci);
  const eu = ["DEU", "NLD", "BEL", "FRA", "ITA", "ESP", "GBR", "POL", "GRC"].map(ci);
  const isAE = (f: number[]) => (asia.includes(f[0]) && eu.includes(f[1])) || (eu.includes(f[0]) && asia.includes(f[1]));
  const sub = engine.data.flows.flows.filter(isAE);
  const total = sub.reduce((a, f) => a + f[3], 0);
  const tiny = new ImpactEngine({ ...engine.data, flows: { ...engine.data.flows, flows: sub } });
  const r = tiny.run(b);
  check("Panama: <3% of Asia–Europe trade affected", r.disrupted / total < 0.03, `${((r.disrupted / total) * 100).toFixed(2)}%`);
}

// 4. Severity 0 / duration 0 = zero; doubling duration doubles disrupted value
{
  const z1 = summarise(engine, [blk("a", PRESET_POINTS.suez, 0, 30)], null);
  const z2 = summarise(engine, [blk("a", PRESET_POINTS.suez, 1, 0)], null);
  check("Severity 0 → zero impact", z1.disruptedUsd === 0 && z1.extraCostUsd === 0, bn(z1.disruptedUsd));
  check("Duration 0 → zero impact", z2.disruptedUsd === 0, bn(z2.disruptedUsd));
  const d30 = summarise(engine, [blk("a", PRESET_POINTS.suez, 0.6, 30)], null).disruptedUsd;
  const d60 = summarise(engine, [blk("a", PRESET_POINTS.suez, 0.6, 60)], null).disruptedUsd;
  check("Doubling duration doubles disrupted value", Math.abs(d60 / d30 - 2) < 1e-9, `ratio ${(d60 / d30).toFixed(6)}`);
}

// 5. Two blockages on the same lane don't double count
{
  const one = summarise(engine, [blk("a", PRESET_POINTS.suez)], null);
  const p2 = { ...PRESET_POINTS.suez, lat: PRESET_POINTS.suez.lat - 0.4 };
  const two = summarise(engine, [blk("a", PRESET_POINTS.suez), blk("b", p2)], null);
  check("Two blockages on one lane: no double counting", Math.abs(two.disruptedUsd - one.disruptedUsd) / one.disruptedUsd < 0.01,
    `one ${bn(one.disruptedUsd)} vs two ${bn(two.disruptedUsd)}`);
  const s1 = summarise(engine, [blk("a", PRESET_POINTS.suez, 0.5)], null);
  const s2 = summarise(engine, [blk("a", PRESET_POINTS.suez, 0.5), blk("b", p2, 0.5)], null);
  const ratio = s2.disruptedUsd / two.disruptedUsd;
  check("Two 50% blockages on one lane remove 75% of capacity, not 100%", ratio > 0.74 && ratio < 0.76 && s2.disruptedUsd > s1.disruptedUsd,
    `50%: ${bn(s1.disruptedUsd)} · 50%+50%: ${bn(s2.disruptedUsd)} · 100%+100%: ${bn(two.disruptedUsd)} (ratio ${ratio.toFixed(3)})`);
}

// 5b. Severity is monotonic and continuous
{
  const v = [0.1, 0.25, 0.5, 1].map((sv) => summarise(engine, [blk("a", PRESET_POINTS.hormuz, sv)], null).disruptedUsd);
  check("Severity monotonic (10% < 25% < 50% < 100%)", v[0] < v[1] && v[1] < v[2] && v[2] < v[3],
    v.map((x) => bn(x)).join(" < "));
}

// 6. Compounding: Malacca + Hormuz > either alone
{
  const h = summarise(engine, [blk("h", PRESET_POINTS.hormuz)], null).disruptedUsd;
  const m = summarise(engine, [blk("m", PRESET_POINTS.malacca)], null).disruptedUsd;
  const hm = summarise(engine, [blk("h", PRESET_POINTS.hormuz), blk("m", PRESET_POINTS.malacca)], null).disruptedUsd;
  check("Malacca + Hormuz compounds", hm > Math.max(h, m) && hm <= h + m + 1, `${bn(h)} + ${bn(m)} → ${bn(hm)}`);
  const t = performance.now();
  for (let i = 0; i < 20; i++) engine.run([blk("h", { ...PRESET_POINTS.hormuz, lon: PRESET_POINTS.hormuz.lon + i * 0.01 }), blk("m", PRESET_POINTS.malacca)]);
  console.log(`  avg run (2 blockages): ${((performance.now() - t) / 20).toFixed(1)} ms`);
}


// ---------------------------------------------------------------- decision engine (forecast → simulator → Monte Carlo)
{
  const md = loadModelDataFromDisk();
  let maxErr = 0;
  try {
    const fx = JSON.parse(readFileSync("data-prep/out/parity.json", "utf8")) as { cp: string; t: number; h: number; pred: number }[];
    for (const r of fx) { const f = features(md.traffic.series[r.cp].total, md.traffic.start, r.t, r.h); maxErr = Math.max(maxErr, Math.abs(predictRow(md.model, f.x) * f.base - r.pred)); }
    check("XGBoost TypeScript inference matches Python", maxErr < 1e-3, `${fx.length} fixtures, max |Δ| ${maxErr.toExponential(1)} ships/day`);
  } catch { console.log("  (parity fixtures missing: run data-prep/train_forecast.py)"); }
  {
    let inside = 0, n = 0;
    for (let t = indexOf(md.traffic.start, "2025-01-01"); t <= md.traffic.days - 8; t += 3) {
      const f = forecast(md, "suez", t);
      const sm = simulateForecast(md, f, 400, 7);
      f.days.forEach((d, h) => { if (d.actual === null) return; n++; if (d.actual >= sm.p10[h] && d.actual <= sm.p90[h]) inside++; });
    }
    const cov = (inside / n) * 100;
    check("Simulated forecast weeks are calibrated on held-out data", cov > 75 && cov < 90, `${cov.toFixed(1)}% of ${n} actual Suez days inside the simulated 10th–90th percentile band (nominal 80%)`);
  }
  const eg = everGivenCheck(md);
  check("Queue model reproduces the Ever Given fit", eg.maxDiffVsPython < 0.01 && eg.rmse < 12, `RMSE ${eg.rmse.toFixed(1)} ships/day vs observed, max |Δ| vs Python ${eg.maxDiffVsPython.toExponential(1)}`);
  const settings = { originIdx: md.traffic.days - 1, windowDays: 21, uncertainty: 0.6, risk: "expected" as "expected" | "balanced" | "cvar", fuelMultiplier: 1, urgency: "medium" as const, samples: 600 };
  const run = (days: number, extra: Partial<typeof settings> = {}) => {
    const bs = [blk("s", PRESET_POINTS.suez, 1, days)];
    return runDecision(engine, md, bs, findTarget(engine, bs, "s")!, { ...settings, ...extra });
  };
  const r7 = run(7), r14 = run(14), r28 = run(28);
  check("Longer expected closure → more reroutes", r7.mc.counts.reroute <= r14.mc.counts.reroute && r14.mc.counts.reroute <= r28.mc.counts.reroute,
    `7d ${r7.mc.counts.reroute}, 14d ${r14.mc.counts.reroute}, 28d ${r28.mc.counts.reroute} of ${r14.fleet.length}`);
  const S = r14.mc.strategies;
  check("Monte Carlo plan beats both simple rules out of sample (14 d)", S.mc.mean <= Math.min(S.wait.mean, S.reroute.mean),
    `MC $${(S.mc.mean / 1e6).toFixed(0)}m vs wait $${(S.wait.mean / 1e6).toFixed(0)}m, reroute $${(S.reroute.mean / 1e6).toFixed(0)}m; saving ${r14.mc.savingPct.toFixed(1)}%`);
  check("Perfect foresight is a lower bound", S.oracle.mean <= S.mc.mean + 1, `oracle $${(S.oracle.mean / 1e6).toFixed(0)}m ≤ MC $${(S.mc.mean / 1e6).toFixed(0)}m`);
  const hi = run(14, { fuelMultiplier: 2 });
  check("Dearer fuel → fewer reroutes", hi.mc.counts.reroute <= r14.mc.counts.reroute, `fuel 1× ${r14.mc.counts.reroute}, 2× ${hi.mc.counts.reroute}`);
  const cv = run(7, { risk: "cvar", uncertainty: 1 });
  check("Worst-case preference lowers CVaR 95%", cv.mc.strategies.mc.cvar95 <= cv.mc.strategies.wait.cvar95, `CVaR $${(cv.mc.strategies.mc.cvar95 / 1e6).toFixed(0)}m vs always-wait $${(cv.mc.strategies.wait.cvar95 / 1e6).toFixed(0)}m`);
  const hz = [blk("h", PRESET_POINTS.hormuz, 1, 14)];
  const rh = runDecision(engine, md, hz, findTarget(engine, hz, "h")!, settings);
  check("Hormuz: no sea alternative, everyone waits", rh.mc.counts.reroute === 0 && rh.mc.counts.noAlternative === rh.fleet.length, `${rh.fleet.length} vessels, ${rh.mc.counts.noAlternative} without an alternative`);
  console.log(`  decision engine run: ${r14.totalMs.toFixed(0)} ms for ${r14.fleet.length} vessels × ${settings.samples} draws`);
}

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nAll sanity checks passed.");
