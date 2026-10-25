"use client";
import { useEffect } from "react";
import { DEFAULT_BLOCKAGE, mapBridge } from "../mapBridge";
import { useStore } from "../store";

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable || (tag === "INPUT" && (el as HTMLInputElement).type !== "range");
};
const isRange = (t: EventTarget | null) => (t as HTMLElement | null)?.tagName === "INPUT" && (t as HTMLInputElement).type === "range";
const isButton = (t: EventTarget | null) => ["BUTTON", "A", "SUMMARY"].includes((t as HTMLElement | null)?.tagName ?? "");

/**
 * Global shortcuts. N new · Delete remove · [ ] severity · Shift+[ ] duration · - = radius
 * arrows move (pan when nothing selected) · 1–9 select · Esc deselect · Space play · ⌘/Ctrl+Z undo · ? help
 */
export function useKeyboard() {
  useEffect(() => {
    let moving = false;
    const onDown = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (isTyping(e.target) && e.key !== "Escape") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.code === "KeyZ") { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return; }
      if (mod && e.code === "KeyY") { e.preventDefault(); s.redo(); return; }
      if (mod || e.altKey) return;
      const sel = s.blockages.find((b) => b.id === s.selectedId);

      switch (e.code) {
        case "Escape":
          if (s.helpOpen) s.setHelpOpen(false);
          else if (s.mode === "add") s.setMode("idle");
          else s.select(null);
          return;
        case "KeyN": {
          e.preventDefault();
          const c = mapBridge.center();
          if (c && mapBridge.isWater(c)) s.addBlockage({ ...DEFAULT_BLOCKAGE, lon: c[0], lat: c[1] });
          else { s.setMode("add"); mapBridge.toast("Map centre is on land. Click on water to place the blockage."); }
          return;
        }
        case "Delete":
        case "Backspace":
          if (sel) { e.preventDefault(); s.removeBlockage(sel.id); }
          return;
        case "BracketLeft":
        case "BracketRight": {
          if (!sel) return;
          e.preventDefault();
          const dir = e.code === "BracketRight" ? 1 : -1;
          if (e.shiftKey) s.updateBlockage(sel.id, { durationDays: sel.durationDays + dir * 5 }, { record: true });
          else s.updateBlockage(sel.id, { severity: Math.round((sel.severity + dir * 0.05) * 100) / 100 }, { record: true });
          return;
        }
        case "Minus":
        case "Equal":
          if (!sel) return;
          e.preventDefault();
          s.updateBlockage(sel.id, { radiusKm: sel.radiusKm * (e.code === "Equal" ? 1.1 : 1 / 1.1) }, { record: true });
          return;
        case "ArrowUp":
        case "ArrowDown":
        case "ArrowLeft":
        case "ArrowRight": {
          if (isRange(e.target)) return;
          e.preventDefault();
          const step = e.shiftKey ? 1 : 0.25;
          const [dx, dy] = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.code]!;
          if (!sel) { mapBridge.panBy(dx * 120, -dy * 120); return; }
          if (!moving) { s.beginEdit(); moving = true; }
          s.updateBlockage(sel.id, { lon: sel.lon + dx * step, lat: sel.lat + dy * step });
          return;
        }
        case "Space":
          if (isButton(e.target) || isRange(e.target)) return;
          e.preventDefault();
          if (s.blockages.length) s.setPlaying(!s.playing);
          return;
        case "Slash":
          if (e.shiftKey) { e.preventDefault(); s.setHelpOpen(!s.helpOpen); }
          return;
        default:
          if (/^Digit[1-9]$/.test(e.code)) {
            const b = s.blockages[Number(e.code.slice(5)) - 1];
            if (b) s.select(b.id);
          }
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (moving && e.code.startsWith("Arrow")) { moving = false; useStore.getState().commitEdit(); }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, []);
}
