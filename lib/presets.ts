import type { Blockage } from "./engine/types";

/** Canonical chokepoint blockage placements (centre + radius in km). */
export const PRESET_POINTS = {
  suez: { lon: 32.38, lat: 30.45, radiusKm: 60 },
  hormuz: { lon: 56.45, lat: 26.55, radiusKm: 70 },
  bab: { lon: 43.35, lat: 12.75, radiusKm: 120 },
  malacca: { lon: 100.9, lat: 2.5, radiusKm: 90 },
  panama: { lon: -79.7, lat: 9.15, radiusKm: 50 },
} as const;

export interface Preset {
  id: string;
  label: string;
  blurb: string;
  blockages: Omit<Blockage, "id">[];
}

export const PRESETS: Preset[] = [
  { id: "suez14", label: "Suez · 2 weeks", blurb: "Canal fully closed, expected to reopen in 14 days (the decision-engine demo)",
    blockages: [{ ...PRESET_POINTS.suez, severity: 1, durationDays: 14 }] },
  { id: "evergiven", label: "Ever Given (6 d)", blurb: "Suez blocked for six days, as in March 2021",
    blockages: [{ ...PRESET_POINTS.suez, severity: 1, durationDays: 6 }] },
  { id: "suez", label: "Suez closure", blurb: "Canal fully closed for 30 days",
    blockages: [{ ...PRESET_POINTS.suez, severity: 1, durationDays: 30 }] },
  { id: "hormuz", label: "Hormuz closure", blurb: "Strait closed for 30 days",
    blockages: [{ ...PRESET_POINTS.hormuz, severity: 1, durationDays: 30 }] },
  { id: "redsea", label: "Red Sea 2024-style", blurb: "Two-thirds of Bab el-Mandeb traffic diverts for 120 days",
    blockages: [{ ...PRESET_POINTS.bab, severity: 0.65, durationDays: 120 }] },
  { id: "malacca-hormuz", label: "Malacca + Hormuz", blurb: "Both straits closed for 21 days",
    blockages: [
      { ...PRESET_POINTS.hormuz, severity: 1, durationDays: 21 },
      { ...PRESET_POINTS.malacca, severity: 1, durationDays: 21 },
    ] },
  { id: "panama", label: "Panama drought", blurb: "40% capacity cut for 90 days",
    blockages: [{ ...PRESET_POINTS.panama, severity: 0.4, durationDays: 90 }] },
];
