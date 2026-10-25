"use client";
import { X } from "lucide-react";
import { useStore } from "@/lib/store";

const KEYS: [string, string][] = [
  ["N", "New blockage at map centre (or place by clicking)"],
  ["Click / drag", "Drop on water · drag to move · drag handle to resize"],
  ["1–9", "Select blockage"],
  ["Arrows", "Move selected blockage (Shift = 1°) · pan map if none selected"],
  ["[  ]", "Severity −/+ 5%"],
  ["Shift + [  ]", "Duration −/+ 5 days"],
  ["−  =", "Radius −/+ 10%"],
  ["Delete", "Remove selected blockage"],
  ["Space", "Play / pause timeline"],
  ["Ctrl/⌘ + Z", "Undo · add Shift to redo"],
  ["Esc", "Deselect / cancel"],
  ["?", "This list"],
];

export default function KeyboardHelp() {
  const open = useStore((s) => s.helpOpen);
  const setOpen = useStore((s) => s.setHelpOpen);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-bg/70" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}
        className="w-[440px] rounded-sm border border-line-2 bg-panel">
        <div className="flex h-9 items-center justify-between border-b border-line px-4">
          <h2 className="lbl text-ink">Keyboard</h2>
          <button onClick={() => setOpen(false)} aria-label="Close" autoFocus className="grid h-6 w-6 place-items-center rounded-sm text-mute hover:bg-line hover:text-ink">
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
        <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-1.5 px-4 py-3 text-[12px]">
          {KEYS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="num text-ink">{k}</dt>
              <dd className="text-mute">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
