/**
 * Every modelling constant lives here so the UI can show it next to the number it drives.
 * Change a value here and every figure in the app follows.
 */
export const ASSUMPTIONS = {
  speedKnots: 14,
  /** Route-choice cost added for transiting Suez or Panama (tolls, queueing, size limits). Not added to reported distance. */
  canalPenaltyNm: 1000,
  /** Delay for traffic that stays on a partially blocked lane, at 100% capacity loss on that lane. */
  congestionDaysAtFull: 4,
  /** Share of rerouted / delayed volume treated as lost supply for price pressure (tonnage tied up on longer voyages). */
  reroutedSupplyWeight: 0.2,
  congestedSupplyWeight: 0.1,
  /** Price response: % price change per 1% of global seaborne supply effectively removed. */
  priceMultiplier: { oil: 3.0, gas: 4.0, food: 1.5 },
  /** Inventory buffer: pressure builds as 1 − exp(−day / τ). */
  inventoryTauDays: 14,
} as const;

export const NM_PER_DAY = ASSUMPTIONS.speedKnots * 24;

export const FORMULAS: Record<string, string> = {
  disrupted:
    "Value forced off its normal sea route = rerouted + stranded. Per flow: annual value × (1 − path capacity) × active days / 365, where path capacity = min over its lanes of Π(1 − severity of each blockage touching the lane). Each flow is counted once, however many blockages it crosses.",
  rerouted:
    "Σ value × (1 − path capacity) for flows that have an alternative path avoiding every blocked lane, × days / 365. Path capacity = min over lanes of Π(1 − severity).",
  stranded:
    "Σ value × (1 − path capacity) for flows with no alternative path (and beyond any pipeline bypass capacity), × days / 365. Counted separately, never as infinite cost.",
  extraDays: `Value-weighted mean of extra transit days. Rerouted: (alt NM − original NM) / (${ASSUMPTIONS.speedKnots} kn × 24). Staying on a partially blocked lane: ${ASSUMPTIONS.congestionDaysAtFull} d × capacity removed.`,
  extraCost:
    "Σ value × extra days × daily cost rate of the commodity (freight + fuel + inventory carry, as % of cargo value per day; see assumptions) × days / 365.",
  oil: `Δprice % = ${ASSUMPTIONS.priceMultiplier.oil} × share of modelled seaborne crude + refined supply effectively removed × (1 − e^(−day/${ASSUMPTIONS.inventoryTauDays})). Removed = stranded + ${ASSUMPTIONS.reroutedSupplyWeight} × rerouted + ${ASSUMPTIONS.congestedSupplyWeight} × delayed.`,
  gas: `Δprice % = ${ASSUMPTIONS.priceMultiplier.gas} × share of modelled seaborne gas/LNG supply removed × inventory buffer.`,
  food: `Δprice % = ${ASSUMPTIONS.priceMultiplier.food} × share of modelled seaborne grain & food supply removed × inventory buffer.`,
  exposure:
    "Exposure = value of a country's seaborne exports + imports forced off their normal route (rerouted or stranded) during the scenario. % of GDP uses World Bank GDP (latest year available).",
  chokepointShift:
    "Ships/day = baseline transits + Δ modelled laden ship-equivalents × calibration. Ship-equivalents = value ÷ typical cargo value per voyage (crude $150M, LNG $60M, products $45M, food $20M, containers $350M, ores $15M, chemicals $30M, vehicles $100M). Each chokepoint is calibrated so modelled ships match its baseline transit count; diverted ships carry the calibration of the chokepoints on their original route.",
  lane: "Lane width ∝ baseline annual trade value assigned to that lane by shortest sea path (with canal penalty).",
};
