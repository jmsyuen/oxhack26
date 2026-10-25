import type { Blockage, LonLat } from "./engine/types";

/** Functions the map registers so the keyboard layer, presets and panel can talk to it. */
export const mapBridge: {
  center: () => LonLat | null;
  isWater: (c: LonLat) => boolean;
  animateEntry: (ids: string[]) => void;
  focus: (bs: Blockage[]) => void;
  panBy: (dx: number, dy: number) => void;
  toast: (msg: string) => void;
} = {
  center: () => null,
  isWater: () => true,
  animateEntry: () => {},
  focus: () => {},
  panBy: () => {},
  toast: () => {},
};

export const DEFAULT_BLOCKAGE = { radiusKm: 150, severity: 1, durationDays: 30 };
