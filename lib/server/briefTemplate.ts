import type { BriefPayload } from "../briefPayload";

const say = (usd: number) => {
  const a = Math.abs(usd);
  if (a >= 1e12) return `${(a / 1e12).toFixed(1)} trillion dollars`;
  if (a >= 1e9) return `${a >= 1e11 ? Math.round(a / 1e9) : (a / 1e9).toFixed(1)} billion dollars`;
  if (a >= 1e6) return `${Math.round(a / 1e6)} million dollars`;
  return "almost nothing";
};

function describe(b: BriefPayload["blockages"][number]) {
  const kind = b.severityPct >= 100 ? "a full closure" : b.severityPct >= 50 ? `a ${b.severityPct} percent capacity cut` : `a ${b.severityPct} percent restriction`;
  return `${kind} ${b.place.startsWith("the ") ? `at ${b.place}` : b.place} for ${b.durationDays} days`;
}

const CARGO: Record<string, string> = {
  "Crude oil": "Crude oil is", "LNG & gas": "LNG and gas are", "Refined fuels": "Refined fuels are",
  "Grain & food": "Grain and food are", "Manufactured goods": "Manufactured goods are",
  "Ores, metals & coal": "Ores, metals and coal are", "Chemicals & fertiliser": "Chemicals and fertiliser are",
  "Vehicles & parts": "Vehicles and parts are",
};
const THE = new Set(["United States", "United Kingdom", "United Arab Emirates", "Netherlands", "Philippines"]);
const country = (n: string) => (THE.has(n) ? `the ${n}` : n);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Deterministic fallback brief used when no Gemini key is configured (or Gemini fails). ~60–85 words. */
export function templateBrief(p: BriefPayload): string {
  if (!p.blockages.length) return "There is no blockage in this scenario yet. Drop one on a sea lane to see the modelled impact.";
  const t = p.totals;
  const list = p.blockages.map(describe);
  const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  const parts = [`In this simulated scenario, we model ${joined}.`];
  if (t.disruptedUsd <= 0) {
    parts.push("No modelled sea lane runs through the blocked area, so no trade is disrupted.");
    return parts.join(" ");
  }
  if (t.reroutedUsd > 0 && t.strandedUsd > 0)
    parts.push(`About ${say(t.disruptedUsd)} of seaborne trade is forced off its usual routes: ${say(t.reroutedUsd)} reroutes, adding about ${Math.max(1, Math.round(t.avgExtraDays))} days per voyage, and ${say(t.strandedUsd)} has no alternative route.`);
  else if (t.reroutedUsd > 0)
    parts.push(`About ${say(t.disruptedUsd)} of seaborne trade is forced to reroute, adding about ${Math.max(1, Math.round(t.avgExtraDays))} days per voyage.`);
  else parts.push(`About ${say(t.disruptedUsd)} of seaborne trade is stranded with no alternative route.`);
  const imp = p.topImporters[0];
  if (imp) parts.push(`${cap(country(imp.name))} is the most exposed importer, with ${say(imp.usd)} affected.`);
  const c = p.commodities[0];
  if (c) parts.push(`${CARGO[c.label] ?? `${c.label} is`} the hardest-hit cargo.`);
  if (p.pricePressurePct.oil >= 3) parts.push(`Oil faces modelled price pressure of about ${p.pricePressurePct.oil} percent.`);
  const gain = p.blockages.length === 1 ? p.chokepoints.find((x) => x.changePct > 0) : undefined;
  if (gain) parts.push(`Traffic around the ${gain.name} rises about ${gain.changePct} percent.`);
  parts.push("This is a model estimate, not a forecast.");
  return parts.join(" ");
}
