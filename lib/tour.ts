"use client";
import { create } from "zustand";
import { useDecisionStore } from "./decisionStore";
import { useStore } from "./store";

const KEY = "chokepoint-tour-v1";

export const useTour = create<{ open: boolean; step: number }>(() => ({ open: false, step: 0 }));

export function startTour() {
  useDecisionStore.setState({ analystOpen: false, panel: null });
  // a click on water with a blockage selected only deselects it, so start with nothing selected
  useStore.getState().select(null);
  useStore.getState().setMode("idle");
  useTour.setState({ open: true, step: 0 });
}
export function endTour() {
  useTour.setState({ open: false });
  try { localStorage.setItem(KEY, "1"); } catch { /* storage unavailable: the tour just shows again next time */ }
}
export function tourSeen() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
