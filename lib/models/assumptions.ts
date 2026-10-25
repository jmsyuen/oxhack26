import type { VesselTypeId } from "./types";

/**
 * Vessel economics for the decision engine. Every number is a stated assumption (badged MODELLED in the UI):
 * typical 2024–26 market levels for a mid-size ship of each class, not quotes for a specific vessel.
 */
export interface VesselSpec {
  id: VesselTypeId;
  label: string;
  speedKn: number;
  /** charter/time-charter-equivalent + running cost, USD/day, excluding fuel */
  opexPerDay: number;
  /** fuel burn at service speed and at anchor, tonnes/day */
  seaFuelT: number;
  anchorFuelT: number;
  /** commodity groups (flows.json ids) this class carries */
  carries: string[];
  /** cargo value relative to the commodity's typical cargo per ship (break-bulk ships carry less) */
  cargoScale: number;
}

export const VESSEL_SPECS: Record<VesselTypeId, VesselSpec> = {
  container: { id: "container", label: "Container", speedKn: 16, opexPerDay: 60_000, seaFuelT: 85, anchorFuelT: 4, carries: ["manuf"], cargoScale: 1 },
  tanker: { id: "tanker", label: "Tanker", speedKn: 13.5, opexPerDay: 45_000, seaFuelT: 55, anchorFuelT: 8, carries: ["crude", "gas", "refined", "chem"], cargoScale: 1 },
  dry_bulk: { id: "dry_bulk", label: "Dry bulk", speedKn: 12.5, opexPerDay: 20_000, seaFuelT: 32, anchorFuelT: 3, carries: ["food", "metals"], cargoScale: 1 },
  general_cargo: { id: "general_cargo", label: "General cargo", speedKn: 12, opexPerDay: 12_000, seaFuelT: 20, anchorFuelT: 2, carries: ["manuf", "food", "metals", "chem", "vehicles"], cargoScale: 0.12 },
  roro: { id: "roro", label: "Ro-ro / car carrier", speedKn: 17, opexPerDay: 35_000, seaFuelT: 55, anchorFuelT: 4, carries: ["vehicles"], cargoScale: 1 },
};

/** Canal transit fees (USD per transit, typical laden ship of the class). Straits charge nothing. */
export const TOLLS: Record<string, Partial<Record<VesselTypeId, number>>> = {
  suez: { container: 500_000, tanker: 350_000, dry_bulk: 200_000, general_cargo: 90_000, roro: 300_000 },
  panama: { container: 800_000, tanker: 300_000, dry_bulk: 180_000, general_cargo: 80_000, roro: 350_000 },
};

export const DECISION_ASSUMPTIONS = {
  /** VLSFO, USD/tonne, before the fuel multiplier */
  fuelUsdPerT: 620,
  /** annual carrying cost of cargo in transit (capital, insurance, obsolescence) */
  cargoCarryPerYear: 0.08,
  /** days of schedule buffer before late-delivery costs start, and the late cost per day as a share of cargo value */
  urgency: {
    low: { slack: [8, 20] as [number, number], penaltyShare: 0.0001 },
    medium: { slack: [3, 10] as [number, number], penaltyShare: 0.0003 },
    high: { slack: [0, 4] as [number, number], penaltyShare: 0.0008 },
  },
  /** Monte Carlo draws for the decision, and an independent set (different seed) for out-of-sample evaluation */
  samples: 1000,
} as const;

export type Urgency = keyof typeof DECISION_ASSUMPTIONS.urgency;
export type RiskPreference = "expected" | "balanced" | "cvar";

export const DECISION_FORMULAS = {
  wait:
    "Wait cost = queue delay × (opex + anchor fuel × fuel price + cargo carry) + late cost × max(0, delay − schedule buffer). Queue delay comes from a FIFO queue at the chokepoint: closed (or at (1 − severity) capacity) until the sampled reopening time, then cleared at κ × normal level (κ fitted on the 2021 Ever Given closure).",
  reroute:
    "Reroute cost = extra days × (opex + sea fuel × fuel price + cargo carry) + late cost × max(0, extra days − buffer) − canal toll avoided. Extra days = (alternative nm − normal nm + 2 × distance already sailed past the split point) ÷ (speed × 24).",
  mc:
    "Closure duration T ~ lognormal(mean, CV). Vessels decide in arrival order, so each one sees the queue formed by the vessels ahead of it (FIFO). Rule: wait if the risk measure of the wait-cost distribution ≤ reroute cost. Expected = mean; worst-case = CVaR 95% (mean of the worst 5% of draws); balanced = ½ mean + ½ CVaR.",
  oracle: "Perfect foresight: the same rule with the true duration known. A retrospective benchmark only, not a deployable strategy.",
  vss: "Value of modelling uncertainty = expected cost of deciding on the point estimate (T = mean) − expected cost of the Monte Carlo policy, both evaluated on an independent set of draws.",
  evpi: "Value of knowing the reopening date = Monte Carlo policy cost − perfect-foresight cost.",
};
