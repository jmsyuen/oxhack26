import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EngineData } from "../engine/types";

/** Node-only loader (scripts / tests). The browser uses lib/data/load.ts. */
export function loadEngineDataFromDisk(root = process.cwd()): EngineData {
  const r = (f: string) => JSON.parse(readFileSync(join(root, "public", "data", f), "utf8"));
  return {
    network: r("network.json"),
    countries: r("countries.json"),
    flows: r("flows.json"),
    chokepoints: r("chokepoints.json"),
    datasets: r("datasets.json"),
  };
}
