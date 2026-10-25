"use client";
import { useEffect, useRef } from "react";
import type { ImpactEngine } from "../engine/engine";
import { findTarget, runDecision } from "../models/decision";
import type { ModelData } from "../models/types";
import { useDecisionStore } from "../decisionStore";
import { useStore } from "../store";

/**
 * Runs forecast → disruption simulation → Monte Carlo optimisation for the chokepoint the scenario closes.
 * Debounced (trailing) so dragging a blockage stays smooth; the trade panel keeps updating live meanwhile.
 */
export function useDecision(engine: ImpactEngine | null, md: ModelData | null, ms = 220) {
  const blockages = useStore((s) => s.blockages);
  const selectedId = useStore((s) => s.selectedId);
  const settings = useDecisionStore((s) => s.settings);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!engine || !md) return;
    useDecisionStore.setState({ computing: true });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const target = findTarget(engine, blockages, selectedId);
      if (!target) { useDecisionStore.setState({ result: null, target: null, computing: false }); return; }
      try {
        const result = runDecision(engine, md, blockages, target, { ...settings, originIdx: settings.originIdx ?? md.traffic.days - 1 });
        useDecisionStore.setState({ result, target, computing: false });
      } catch (e) {
        console.error("[decision]", e);
        useDecisionStore.setState({ computing: false });
      }
    }, ms);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [engine, md, blockages, selectedId, settings, ms]);
}
