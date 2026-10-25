/** Data files produced by data-prep/build_traffic.py, train_forecast.py and calibrate_queue.py. */

export type VesselTypeId = "container" | "tanker" | "dry_bulk" | "general_cargo" | "roro";

export interface TrafficSeries {
  total: number[];
  tanker: number[];
  container: number[];
  dry_bulk: number[];
  general_cargo: number[];
  roro: number[];
}

export interface TrafficFile {
  source: string;
  status: "OBSERVED";
  start: string;
  end: string;
  days: number;
  interpolatedDays: number;
  types: string[];
  series: Record<string, TrafficSeries>;
}

export interface Quantiles { q80: number; q95: number }

export interface ForecastModelFile {
  kind: string;
  version: string;
  objective: string;
  target: string;
  baseScore: number;
  features: string[];
  horizon: number;
  conformal: Record<string, Quantiles>;
  conformalByChokepoint: Record<string, Record<string, Quantiles>>;
  trees: { f: number[]; c: number[]; l: number[]; r: number[] }[];
  trainedOn: { rows: number; chokepoints: number; train: [string, string]; validation: [string, string]; test: [string, string] };
}

export interface MetricPair { mae: number; rmse: number }
export interface EvalBlock {
  xgboost: MetricPair; naive: MetricPair; seasonal_naive: MetricPair; ma7: MetricPair; ma28: MetricPair;
  poisson_floor_mae: number; coverage80: number; coverage95: number; n: number;
  by_horizon: { h: number; xgboost: number; naive: number; seasonal_naive: number; ma7: number; ma28: number }[];
}
export interface ForecastEvalFile {
  model: {
    family: string; trees: number; maxDepth: number; learningRate: number; features: number; trainRows: number;
    chokepointsPooled: number; train: [string, string]; validation: [string, string]; test: [string, string]; trainedAt: string; data: string;
  };
  test: Record<string, EvalBlock>;
  shifts: (EvalBlock & { id: string; label: string; from: string; to: string })[];
  importance: { feature: string; share: number }[];
  dispersionIndexSuez: number;
}

export interface QueueCalibration {
  event: string; origin: string; closedFromDay: number; reopenDay: number; level: number; forecast: number[];
  kappa: number; severity: number; rho: number; rmse: number; rmseNoSurge: number; peakQueue: number;
  dates: string[]; observed: number[]; simulated: number[]; queue: number[]; note: string;
}

export interface ModelData {
  traffic: TrafficFile;
  model: ForecastModelFile;
  evaluation: ForecastEvalFile;
  queue: QueueCalibration;
}
