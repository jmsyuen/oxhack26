import { loadEngineDataFromDisk } from "../lib/data/node-load";
import { loadModelDataFromDisk } from "../lib/data/node-models";
import { ImpactEngine } from "../lib/engine/engine";
import { everGivenCheck, findTarget, runDecision } from "../lib/models/decision";
import { PRESET_POINTS } from "../lib/presets";
const eng = new ImpactEngine(loadEngineDataFromDisk());
const md = loadModelDataFromDisk();
const M = (x: number) => `$${(x / 1e6).toFixed(1)}m`;
for (const [days, cv, risk] of [[7, 0.5, "expected"], [10, 0.6, "expected"], [14, 0.5, "expected"], [7, 1.0, "expected"], [7, 1.0, "cvar"], [7, 1.0, "balanced"]] as const) {
  const bs = [{ id: "b1", ...PRESET_POINTS.suez, severity: 1, durationDays: days }];
  const tg = findTarget(eng, bs, "b1")!;
  const r = runDecision(eng, md, bs, tg, { originIdx: md.traffic.days - 1, windowDays: 21, uncertainty: cv, risk, fuelMultiplier: 1, urgency: "medium", samples: 1000 });
  const S = r.mc.strategies;
  console.log(`\nSuez ${days}d cv${cv} ${risk}: fleet ${r.fleet.length}, wait ${r.mc.counts.wait} reroute ${r.mc.counts.reroute}, peak queue ${r.peakQueue.toFixed(0)}, ${r.mc.ms.toFixed(0)}ms (total ${r.totalMs.toFixed(0)}ms)`);
  for (const k of ["wait", "reroute", "plugin", "mc", "oracle"] as const) console.log(`  ${S[k].label.padEnd(18)} mean ${M(S[k].mean)} p90 ${M(S[k].p90)} cvar ${M(S[k].cvar95)} missed ${S[k].missedPct.toFixed(1)}% delay ${S[k].meanDelayDays.toFixed(2)}d rr ${S[k].reroutePct.toFixed(0)}%`);
  console.log(`  saving vs ${r.mc.bestRule}: ${M(r.mc.savingVsBestRule)} (${r.mc.savingPct.toFixed(1)}%), VSS ${M(r.mc.vss)}, EVPI ${M(r.mc.evpi)}`);
  console.log("  stress", r.mc.stress.map((s) => `${s.mult}x: regret ${s.regretPct.toFixed(1)}% flips ${s.flips.length}`).join(" | "));
  if (days === 10) { console.log("  e.g.", r.mc.decisions.slice(0, 3).map((d) => d.explanation).join("\n       ")); console.log("  fc", r.forecast.originDate, r.forecast.days.map((d) => d.mean.toFixed(1)).join(" "), "level", r.forecast.level.toFixed(1)); }
}
const eg = everGivenCheck(md);
console.log("\nEver Given TS check: RMSE", eg.rmse.toFixed(2), "max diff vs python", eg.maxDiffVsPython.toExponential(2));

{ const bs = [{ id: "b1", ...PRESET_POINTS.suez, severity: 1, durationDays: 10 }];
  const r = runDecision(eng, md, bs, findTarget(eng, bs, "b1")!, { originIdx: md.traffic.days - 1, windowDays: 21, uncertainty: 0.6, risk: "expected", fuelMultiplier: 1, urgency: "medium", samples: 1000 });
  const ex = r.fleet.map((v) => v.extraDays).filter(isFinite).sort((a, b) => a - b);
  console.log("extra days p10/p50/p90", ex[Math.floor(ex.length * .1)].toFixed(1), ex[Math.floor(ex.length * .5)].toFixed(1), ex[Math.floor(ex.length * .9)].toFixed(1), "types", JSON.stringify(Object.fromEntries(["container","tanker","dry_bulk","general_cargo","roro"].map((t) => [t, r.fleet.filter((v) => v.type === t).length]))));
  console.log("timeline", r.timeline.map((d) => `${d.transits.toFixed(0)}/${d.queue.toFixed(0)}`).join(" "), "clear day", r.clearDay);
  for (let k = 0; k < 3; k++) { const t = performance.now(); runDecision(eng, md, bs, findTarget(eng, bs, "b1")!, { originIdx: md.traffic.days - 1, windowDays: 21, uncertainty: 0.6, risk: "expected", fuelMultiplier: 1, urgency: "medium", samples: 1000 }); console.log("warm run", (performance.now() - t).toFixed(0), "ms"); }
}
