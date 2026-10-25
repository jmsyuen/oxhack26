"use client";
import { useLayoutEffect, useRef, useState } from "react";

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [s, setS] = useState({ w: 320, h: 140 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setS({ w: Math.max(40, e.contentRect.width), h: Math.max(40, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, s] as const;
}

export const lin = (d0: number, d1: number, r0: number, r1: number) => (v: number) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
export const line = (pts: [number, number][]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
export const area = (top: [number, number][], bottom: [number, number][]) =>
  top.length ? `${line(top)}L${[...bottom].reverse().map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L")}Z` : "";
export function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
export const fmtDate = (iso: string, year = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });

export function YTicks({ y, max, x0, x1, n = 3, fmt = (v: number) => String(Math.round(v)) }: {
  y: (v: number) => number; max: number; x0: number; x1: number; n?: number; fmt?: (v: number) => string;
}) {
  return (
    <g aria-hidden>
      {Array.from({ length: n + 1 }, (_, i) => (max * i) / n).map((v) => (
        <g key={v}>
          <line x1={x0} x2={x1} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
          <text x={x0 - 4} y={y(v) + 3} textAnchor="end" className="num" fontSize={9} fill="var(--color-faint)">{fmt(v)}</text>
        </g>
      ))}
    </g>
  );
}
