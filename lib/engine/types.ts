export type LonLat = [number, number];

export interface NetNode {
  id: string;
  name: string;
  lon: number;
  lat: number;
  kind: "port" | "chokepoint" | "waypoint";
}

export interface NetEdge {
  id: number;
  a: string;
  b: string;
  nm: number;
  coords: LonLat[];
}

export interface Network {
  nodes: NetNode[];
  edges: NetEdge[];
}

export interface Bypass {
  frm: string;
  to: string;
  cap: Record<string, number>;
  note: string;
}

export interface CountryMeta {
  iso3: string;
  name: string;
  gdpUsd: number;
  gdpYear: number;
  gdpSource: string;
  exportsBn: number;
  importsBn: number;
  ports: Record<string, number>;
  eports?: Record<string, number> | null;
  bports?: Record<string, number> | null;
  bypass: Bypass[];
}

export interface CommodityMeta {
  id: string;
  label: string;
  costPerDayShare: number;
  cargoMusdPerShip: number;
}

export interface FlowsFile {
  commodities: CommodityMeta[];
  energy: number[];
  bulk: number[];
  countries: string[];
  /** [exporterIdx, importerIdx, commodityIdx, annual value in million USD] */
  flows: [number, number, number, number][];
  coverage: {
    economies: number;
    coveredExportsBn: number;
    worldExportsBn: number;
    coveredShareOfWorld: number;
    maritimeFlowsBn: number;
    flowCount: number;
    note: string;
  };
}

export interface ChokepointMeta {
  id: string;
  name: string;
  node: string;
  lon: number;
  lat: number;
  shipsPerDay: number;
  shipsSource: "seed" | "portwatch";
  history: { date: string; n: number }[] | null;
}

export interface DatasetMeta {
  id: string;
  label: string;
  status: "OBSERVED" | "SEED" | "MODELLED";
  source: string;
  vintage: string;
  note: string;
}

export interface EngineData {
  network: Network;
  countries: CountryMeta[];
  flows: FlowsFile;
  chokepoints: ChokepointMeta[];
  datasets: DatasetMeta[];
}

export interface Blockage {
  id: string;
  lon: number;
  lat: number;
  radiusKm: number;
  /** 0..1 share of shipping capacity removed */
  severity: number;
  durationDays: number;
}

/** Annual-rate outputs (million USD per year) for one fixed set of active blockages. */
export interface RateResult {
  any: boolean;
  /** value of all flows whose route crosses an affected lane (touched, at any severity) */
  affected: number;
  /** value forced off its normal route = rerouted + stranded */
  disrupted: number;
  rerouted: number;
  stranded: number;
  congested: number;
  /** sum over value × extra days (MUSD·days), for value-weighted averages */
  valueDays: number;
  extraCost: number;
  byCommodity: CommodityRate[];
  /** per country index: [exp disrupted, imp disrupted, exp stranded, imp stranded, extra cost] */
  country: Float64Array;
  /** per country × commodity disrupted (exp + imp) */
  countryCommodity: Float64Array;
  edgeCap: Float64Array;
  edgeRemoved: Float64Array;
  edgeAdded: Float64Array;
  edgeStranded: Float64Array;
  chokepointNew: Float64Array;
  /** change in calibrated ships per year through each chokepoint (PortWatch units) */
  chokepointShipsNew: Float64Array;
  traces: Trace[];
  supplyShare: { oil: number; gas: number; food: number };
}

export interface CommodityRate {
  disrupted: number;
  rerouted: number;
  stranded: number;
  congested: number;
  extraCost: number;
  valueDays: number;
}

export interface Trace {
  key: string;
  value: number;
  coords: LonLat[];
  extraDays: number;
}

export interface CountryExposure {
  idx: number;
  iso3: string;
  name: string;
  exportUsd: number;
  importUsd: number;
  totalUsd: number;
  strandedUsd: number;
  extraCostUsd: number;
  pctGdp: number;
  exportPctGdp: number;
  importPctGdp: number;
  topCommodity: number;
}

export interface ChokepointShift {
  id: string;
  name: string;
  baseValue: number;
  newValue: number;
  pct: number;
  /** % change in estimated ships/day */
  shipsPct: number;
  shipsBase: number;
  shipsNew: number;
  blocked: boolean;
}

export interface PricePressure {
  oilPct: number;
  gasPct: number;
  foodPct: number;
  oilShare: number;
  gasShare: number;
  foodShare: number;
}

export interface ScenarioResult {
  any: boolean;
  horizonDays: number;
  viewDay: number;
  /** cumulative USD over [0, viewDay] */
  disruptedUsd: number;
  reroutedUsd: number;
  strandedUsd: number;
  congestedUsd: number;
  extraCostUsd: number;
  avgExtraDays: number;
  commodities: {
    idx: number;
    id: string;
    label: string;
    disruptedUsd: number;
    reroutedUsd: number;
    strandedUsd: number;
    congestedUsd: number;
    extraCostUsd: number;
  }[];
  countries: CountryExposure[];
  chokepoints: ChokepointShift[];
  price: PricePressure;
  /** instantaneous (active at viewDay) */
  active: RateResult | null;
  activeIds: string[];
  /** cumulative disrupted USD by day 0..horizon */
  timeline: { day: number; disrupted: number; stranded: number; extraCost: number }[];
}

/** A port-to-port route through one chokepoint, with its alternative under the current blockages. */
export interface CpRoute {
  key: string;
  from: string;
  to: string;
  /** calibrated laden ship transits per year through the chokepoint on this route */
  shipsPerYear: number;
  shipsByCommodity: number[];
  baseNm: number;
  /** nm from the origin port to the chokepoint along the normal route */
  nmToCp: number;
  /** nm of the shortest route avoiding every blocked lane; null = no alternative (stranded) */
  altNm: number | null;
  /** how far before the chokepoint the alternative leaves the normal route (nm), for vessels still in port */
  divergeNm: number;
  /** cumulative nm at each node of the normal route, origin → chokepoint */
  nodeCum: number[];
  /** nm from each of those nodes to the destination avoiding blocked lanes (Infinity = unreachable) */
  altFrom: number[];
  coords: LonLat[];
  cumNm: number[];
  altCoords: LonLat[];
}
