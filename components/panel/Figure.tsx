"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAnimatedNumber } from "@/lib/hooks/useAnimatedNumber";
import { Badge } from "../ui/Badge";
import { Tip } from "../ui/Tip";

/**
 * Headline number: counts to its new value over 400 ms, then — once a burst of changes settles —
 * flashes red (worse) or green (better) and shows the delta for a few seconds.
 */
export function Figure({ label, value, format, deltaFormat, formula, sub, worseWhenUp = true, muted = false }: {
  label: string;
  value: number;
  format: (v: number) => string;
  deltaFormat: (d: number) => string;
  formula: ReactNode;
  sub: ReactNode;
  worseWhenUp?: boolean;
  muted?: boolean;
}) {
  const shown = useAnimatedNumber(value, 400);
  const [flash, setFlash] = useState<{ n: number; delta: number } | null>(null);
  const prev = useRef(value);
  const burst = useRef<{ from: number; timer: ReturnType<typeof setTimeout> | null }>({ from: value, timer: null });

  useEffect(() => {
    const b = burst.current;
    if (value === prev.current) return;
    if (!b.timer) b.from = prev.current;
    prev.current = value;
    if (b.timer) clearTimeout(b.timer);
    b.timer = setTimeout(() => {
      b.timer = null;
      const d = value - b.from;
      if (Math.abs(d) > Math.max(1e-6, Math.abs(b.from) * 0.002)) setFlash({ n: performance.now(), delta: d });
    }, 180);
  }, [value]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(t);
  }, [flash]);
  useEffect(() => () => { if (burst.current.timer) clearTimeout(burst.current.timer); }, []);

  const bad = flash ? (flash.delta > 0) === worseWhenUp : false;
  return (
    <div className="min-w-0 px-4 py-2.5">
      <div className="flex items-center gap-1.5">
        <Tip content={formula} width={300}>
          <span tabIndex={0} className="lbl cursor-help border-b border-dotted border-line-2">{label}</span>
        </Tip>
        <Badge kind="MODELLED" />
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span key={flash?.n ?? 0} className={`num text-[24px] leading-[28px] tracking-[-0.01em] ${muted ? "text-faint" : "text-ink"} ${flash ? (bad ? "flash-bad" : "flash-good") : ""}`}>
          {format(shown)}
        </span>
        <span aria-hidden className={`num text-[11px] transition-opacity duration-300 ${flash ? "opacity-100" : "opacity-0"} ${bad ? "text-red" : "text-green"}`}>
          {flash ? deltaFormat(flash.delta) : ""}
        </span>
      </div>
      <div className="mt-0.5 truncate text-[11px] text-mute">{sub}</div>
    </div>
  );
}
