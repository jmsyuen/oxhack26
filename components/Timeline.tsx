"use client";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { ScenarioResult } from "@/lib/engine/types";
import { fmtUsd } from "@/lib/format";
import { useStore } from "@/lib/store";

export default function Timeline({ result }: { result: ScenarioResult | null }) {
  const viewDay = useStore((s) => s.viewDay);
  const playing = useStore((s) => s.playing);
  const setViewDay = useStore((s) => s.setViewDay);
  const setPlaying = useStore((s) => s.setPlaying);
  const H = result?.horizonDays ?? 0;
  const day = viewDay === null ? H : Math.min(viewDay, H);
  const dayRef = useRef(day);
  dayRef.current = day;

  // play: animate day 0 → horizon over 4–9 s
  useEffect(() => {
    if (!playing || H <= 0) return;
    let raf = 0;
    let last = performance.now();
    let d = viewDay === null || viewDay >= H ? 0 : viewDay;
    const total = Math.max(4000, Math.min(9000, (H / 30) * 4000));
    setViewDay(d);
    const tick = (now: number) => {
      d += ((now - last) / total) * H;
      last = now;
      if (d >= H) { setViewDay(H); setPlaying(false); return; }
      setViewDay(d);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, H]);

  useEffect(() => { if (H === 0 && (viewDay !== null || playing)) { setViewDay(null); setPlaying(false); } }, [H, viewDay, playing, setViewDay, setPlaying]);

  const data = result?.timeline ?? [];
  const max = data.length ? data[data.length - 1].disrupted : 0;
  const disabled = H <= 0;
  return (
    <div className="grid h-full grid-cols-[auto_112px_1fr_150px] items-center gap-3 border-t border-line bg-panel px-3">
      <button
        onClick={() => setPlaying(!playing)}
        disabled={disabled}
        aria-label={playing ? "Pause timeline" : "Play timeline"}
        className="grid h-8 w-8 place-items-center rounded-sm border border-line-2 text-ink hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
      >
        {playing ? <Pause size={14} strokeWidth={1.5} /> : <Play size={14} strokeWidth={1.5} />}
      </button>
      <div className="leading-tight">
        <div className="lbl !text-[10px]">Scenario day</div>
        <div className="num text-[16px] text-ink">
          {disabled ? "—" : Math.round(day)}<span className="text-[12px] text-faint"> / {disabled ? "—" : H}</span>
        </div>
      </div>
      <div className="relative h-[46px] min-w-0">
        {disabled ? (
          <div className="flex h-full items-center text-[12px] text-faint">The timeline fills in once a blockage touches a sea lane.</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={34}>
              <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="day" type="number" domain={[0, H]} hide />
                <YAxis hide domain={[0, Math.max(1, max)]} />
                <Area type="linear" dataKey="disrupted" stroke="#EF5A5F" strokeWidth={1} fill="#EF5A5F" fillOpacity={0.16} isAnimationActive={false} />
                <Area type="linear" dataKey="stranded" stroke="#8C96A8" strokeWidth={1} fill="#8C96A8" fillOpacity={0.25} isAnimationActive={false} />
                <ReferenceLine x={day} stroke="#E6EDF5" strokeWidth={1} ifOverflow="extendDomain" />
              </AreaChart>
            </ResponsiveContainer>
            <div className="num mt-[1px] flex justify-between text-[10px] text-faint" aria-hidden>
              <span>0</span><span>{Math.round(H / 2)}</span><span>{H} d</span>
            </div>
            <input
              type="range"
              aria-label="Scenario day"
              min={0}
              max={H}
              step={1}
              value={Math.round(day)}
              onChange={(e) => { setPlaying(false); setViewDay(Number(e.target.value)); }}
              className="absolute inset-0 h-[34px] w-full cursor-ew-resize opacity-0"
            />
          </>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 leading-tight">
        <div className="text-right">
          <div className="lbl !text-[10px]">Cumulative</div>
          <div className="num text-[13px] text-ink">{fmtUsd(result?.disruptedUsd ?? 0)}</div>
        </div>
        {viewDay !== null && !disabled && (
          <button onClick={() => { setPlaying(false); setViewDay(null); }}
            className="rounded-sm border border-line-2 px-1.5 py-0.5 text-[11px] text-mute hover:text-ink">Full</button>
        )}
      </div>
    </div>
  );
}
