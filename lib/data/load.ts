import type { EngineData } from "../engine/types";
import type { ModelData } from "../models/types";

type Bundle = Record<string, unknown>;
/** The single-file artifact inlines every data file here instead of serving /public/data. */
const inlined = (): Bundle | null =>
  typeof window !== "undefined" ? ((window as unknown as { __CHOKEPOINT_DATA__?: Bundle }).__CHOKEPOINT_DATA__ ?? null) : null;

async function get<T>(f: string): Promise<T> {
  const b = inlined();
  if (b && f in b) return b[f] as T;
  const r = await fetch(`/data/${f}`);
  if (!r.ok) throw new Error(`Could not load /data/${f} (HTTP ${r.status}). Run the data-prep scripts or restore public/data.`);
  return r.json() as Promise<T>;
}

/** Browser loader for the bundled datasets in /public/data. */
export async function loadEngineData(): Promise<EngineData> {
  const [network, countries, flows, chokepoints, datasets] = await Promise.all([
    get<EngineData["network"]>("network.json"),
    get<EngineData["countries"]>("countries.json"),
    get<EngineData["flows"]>("flows.json"),
    get<EngineData["chokepoints"]>("chokepoints.json"),
    get<EngineData["datasets"]>("datasets.json"),
  ]);
  return { network, countries, flows, chokepoints, datasets };
}

/** Forecaster, observed traffic and queue calibration (data-prep/train_forecast.py, calibrate_queue.py). */
export async function loadModelData(): Promise<ModelData> {
  const [traffic, model, evaluation, queue] = await Promise.all([
    get<ModelData["traffic"]>("traffic.json"),
    get<ModelData["model"]>("forecast_model.json"),
    get<ModelData["evaluation"]>("forecast_eval.json"),
    get<ModelData["queue"]>("queue_calibration.json"),
  ]);
  return { traffic, model, evaluation, queue };
}

export async function loadCountriesGeo(): Promise<GeoJSON.FeatureCollection> {
  return get<GeoJSON.FeatureCollection>("countries.geojson");
}
