"use client";
import { create } from "zustand";
import type { RiskPreference, Urgency } from "./models/assumptions";
import type { DecisionResult, Target } from "./models/decision";

export interface DecisionSettingsState {
  /** forecast origin (index into traffic.json days); null = latest observed day */
  originIdx: number | null;
  windowDays: number;
  uncertainty: number;
  risk: RiskPreference;
  fuelMultiplier: number;
  urgency: Urgency;
  samples: number;
}

export type Panel = null | "model" | "stress" | "fleet";
export type Tab = "forecast" | "simulate" | "decide";

interface DState {
  settings: DecisionSettingsState;
  result: DecisionResult | null;
  target: Target | null;
  computing: boolean;
  panel: Panel;
  vesselId: string | null;
  analystOpen: boolean;
  everGiven: boolean;
  tab: Tab;
  setTab: (t: Tab) => void;
  set: (p: Partial<DecisionSettingsState>) => void;
  openPanel: (p: Panel, vesselId?: string | null) => void;
  selectVessel: (id: string | null) => void;
  setAnalyst: (v: boolean) => void;
  setEverGiven: (v: boolean) => void;
}

export const DEFAULT_SETTINGS: DecisionSettingsState = {
  originIdx: null, windowDays: 21, uncertainty: 0.6, risk: "expected", fuelMultiplier: 1, urgency: "medium", samples: 1000,
};

export const useDecisionStore = create<DState>((set) => ({
  settings: DEFAULT_SETTINGS,
  result: null,
  target: null,
  computing: false,
  panel: null,
  vesselId: null,
  analystOpen: false,
  everGiven: false,
  tab: "decide",
  setTab: (tab) => set({ tab }),
  set: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
  openPanel: (panel, vesselId) => set((s) => ({ panel, vesselId: vesselId === undefined ? s.vesselId : vesselId })),
  selectVessel: (id) => set({ vesselId: id }),
  setAnalyst: (v) => set({ analystOpen: v }),
  setEverGiven: (v) => set({ everGiven: v }),
}));
