"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ImpactEngine } from "../engine/engine";
import { summarise } from "../engine/scenario";
import type { RateResult, ScenarioResult } from "../engine/types";
import { useStore } from "../store";

/**
 * Recomputes the scenario whenever blockages or the scrubbed day change.
 * Throttled to one engine pass per `ms` with a trailing run, so numbers update *while* dragging
 * without starving the map's 60fps circle movement.
 */
export function useScenario(engine: ImpactEngine | null, ms = 90) {
  const blockages = useStore((s) => s.blockages);
  const viewDay = useStore((s) => s.viewDay);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const cache = useMemo(() => new Map<string, RateResult>(), [engine]);
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!engine) return;
    const run = () => {
      last.current = performance.now();
      if (cache.size > 64) cache.clear();
      setResult(summarise(engine, blockages, viewDay, cache));
    };
    const since = performance.now() - last.current;
    if (timer.current) clearTimeout(timer.current);
    if (since >= ms) run();
    else timer.current = setTimeout(run, ms - since);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [engine, blockages, viewDay, cache, ms]);

  return result;
}
