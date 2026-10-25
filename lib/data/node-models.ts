import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelData } from "../models/types";

/** Node-only loader for the model files (scripts / tests). */
export function loadModelDataFromDisk(root = process.cwd()): ModelData {
  const r = (f: string) => JSON.parse(readFileSync(join(root, "public", "data", f), "utf8"));
  return { traffic: r("traffic.json"), model: r("forecast_model.json"), evaluation: r("forecast_eval.json"), queue: r("queue_calibration.json") };
}
