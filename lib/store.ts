"use client";
import { create } from "zustand";
import type { Blockage } from "./engine/types";
import { PRESETS } from "./presets";

export type Mode = "idle" | "add";

interface State {
  blockages: Blockage[];
  selectedId: string | null;
  mode: Mode;
  /** null = whole scenario; otherwise the scrubbed day */
  viewDay: number | null;
  playing: boolean;
  autoNarrate: boolean;
  activePreset: string | null;
  past: Blockage[][];
  future: Blockage[][];
  editSnapshot: Blockage[] | null;
  /** bumps whenever an edit is committed (drives narration / announcements) */
  commitSeq: number;
  helpOpen: boolean;

  addBlockage: (b: Omit<Blockage, "id">) => string;
  updateBlockage: (id: string, patch: Partial<Blockage>, opts?: { record?: boolean }) => void;
  removeBlockage: (id: string) => void;
  clearAll: () => void;
  select: (id: string | null) => void;
  setMode: (m: Mode) => void;
  setViewDay: (d: number | null) => void;
  setPlaying: (p: boolean) => void;
  setAutoNarrate: (v: boolean) => void;
  setHelpOpen: (v: boolean) => void;
  applyPreset: (presetId: string) => Blockage[];
  setBlockages: (bs: Blockage[], opts?: { record?: boolean }) => void;
  beginEdit: () => void;
  commitEdit: () => void;
  undo: () => void;
  redo: () => void;
}

let seq = 0;
export const newId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

const HISTORY_LIMIT = 80;
const same = (a: Blockage[], b: Blockage[]) => JSON.stringify(a) === JSON.stringify(b);

export const clampBlockage = (b: Blockage): Blockage => ({
  ...b,
  lat: Math.max(-75, Math.min(78, b.lat)),
  radiusKm: Math.max(10, Math.min(1000, b.radiusKm)),
  severity: Math.max(0, Math.min(1, b.severity)),
  durationDays: Math.max(1, Math.min(180, Math.round(b.durationDays))),
});

export const useStore = create<State>((set, get) => {
  const record = (next: Blockage[], extra: Partial<State> = {}) => {
    const { blockages, past } = get();
    if (same(blockages, next)) return set(extra as State);
    set({
      ...extra,
      blockages: next,
      past: [...past, blockages].slice(-HISTORY_LIMIT),
      future: [],
      commitSeq: get().commitSeq + 1,
    } as State);
  };

  return {
    blockages: [],
    selectedId: null,
    mode: "idle",
    viewDay: null,
    playing: false,
    autoNarrate: false,
    activePreset: null,
    past: [],
    future: [],
    editSnapshot: null,
    commitSeq: 0,
    helpOpen: false,

    addBlockage: (b) => {
      const id = newId();
      record([...get().blockages, clampBlockage({ ...b, id })], { selectedId: id, mode: "idle", activePreset: null });
      return id;
    },
    updateBlockage: (id, patch, opts) => {
      const next = get().blockages.map((b) => (b.id === id ? clampBlockage({ ...b, ...patch }) : b));
      if (opts?.record) record(next, { activePreset: null });
      else set({ blockages: next, activePreset: null });
    },
    removeBlockage: (id) => {
      const next = get().blockages.filter((b) => b.id !== id);
      record(next, { selectedId: get().selectedId === id ? null : get().selectedId, activePreset: null });
    },
    clearAll: () => record([], { selectedId: null, activePreset: null, viewDay: null, playing: false }),
    select: (id) => set({ selectedId: id }),
    setMode: (m) => set({ mode: m }),
    setViewDay: (d) => set({ viewDay: d }),
    setPlaying: (p) => set({ playing: p }),
    setAutoNarrate: (v) => set({ autoNarrate: v }),
    setHelpOpen: (v) => set({ helpOpen: v }),
    applyPreset: (presetId) => {
      const p = PRESETS.find((x) => x.id === presetId);
      if (!p) return get().blockages;
      const next = p.blockages.map((b) => clampBlockage({ ...b, id: newId() }));
      record(next, { selectedId: next[0]?.id ?? null, activePreset: presetId, viewDay: null, playing: false });
      return next;
    },
    setBlockages: (bs, opts) => {
      if (opts?.record) record(bs);
      else set({ blockages: bs });
    },
    beginEdit: () => set({ editSnapshot: get().blockages }),
    commitEdit: () => {
      const snap = get().editSnapshot;
      const cur = get().blockages;
      if (!snap) return;
      if (same(snap, cur)) return set({ editSnapshot: null });
      set({
        past: [...get().past, snap].slice(-HISTORY_LIMIT),
        future: [],
        editSnapshot: null,
        commitSeq: get().commitSeq + 1,
      });
    },
    undo: () => {
      const { past, blockages, future, selectedId } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      set({
        blockages: prev,
        past: past.slice(0, -1),
        future: [blockages, ...future],
        selectedId: prev.some((b) => b.id === selectedId) ? selectedId : null,
        commitSeq: get().commitSeq + 1,
        activePreset: null,
      });
    },
    redo: () => {
      const { past, blockages, future, selectedId } = get();
      if (!future.length) return;
      const next = future[0];
      set({
        blockages: next,
        past: [...past, blockages],
        future: future.slice(1),
        selectedId: next.some((b) => b.id === selectedId) ? selectedId : null,
        commitSeq: get().commitSeq + 1,
        activePreset: null,
      });
    },
  };
});
