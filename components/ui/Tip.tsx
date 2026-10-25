"use client";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Hover/focus tooltip rendered in a fixed-position portal so scroll containers never clip it. */
export function Tip({ content, children, className = "", width = 280 }: {
  content: ReactNode; children: ReactNode; className?: string; width?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const show = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.max(8, Math.min(window.innerWidth - width - 8, r.left + r.width / 2 - width / 2));
    const below = r.top < 140;
    setPos({ x, y: below ? r.bottom + 6 : r.top - 6, below });
  }, [width]);
  const hide = useCallback(() => setPos(null), []);
  return (
    <span ref={ref} className={className} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos && typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            style={{ left: pos.x, top: pos.y, width, transform: pos.below ? "none" : "translateY(-100%)" }}
            className="pointer-events-none fixed z-[100] rounded-sm border border-line-2 bg-raised px-2.5 py-2 text-[12px] leading-snug text-ink"
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}
