/**
 * Prints the headline numbers for every preset as a Markdown table (for README / the pitch).
 * Run: npm run pitch
 */
import { ImpactEngine } from "../lib/engine/engine";
import { summarise } from "../lib/engine/scenario";
import { loadEngineDataFromDisk } from "../lib/data/node-load";
import { PRESETS } from "../lib/presets";

const engine = new ImpactEngine(loadEngineDataFromDisk());
const bn = (x: number) => (x >= 1e12 ? `$${(x / 1e12).toFixed(2)}tn` : `$${(x / 1e9).toFixed(1)}bn`);
console.log("| Preset | Trade disrupted | Rerouted | Stranded | Extra transit | Shipping cost | Oil | LNG | Most exposed importer | Biggest traffic shift |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const p of PRESETS) {
  const r = summarise(engine, p.blockages.map((b, i) => ({ ...b, id: `p${i}` })), null);
  const imp = [...r.countries].sort((a, b) => b.importUsd - a.importUsd)[0];
  const cp = [...r.chokepoints].filter((c) => !c.blocked).sort((a, b) => b.shipsPct - a.shipsPct)[0];
  console.log(`| ${p.label} — ${p.blurb} | ${bn(r.disruptedUsd)} | ${bn(r.reroutedUsd)} | ${bn(r.strandedUsd)} | ${r.avgExtraDays.toFixed(1)} d | ${bn(r.extraCostUsd)} | +${r.price.oilPct.toFixed(0)}% | +${r.price.gasPct.toFixed(0)}% | ${imp.name} ${bn(imp.importUsd)} | ${cp && cp.shipsPct > 1 ? `${cp.name} +${cp.shipsPct.toFixed(0)}%` : "—"} |`);
}
