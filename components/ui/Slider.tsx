"use client";
import { useStore } from "@/lib/store";

/** Range input that updates live while dragging and records one undo step per drag. */
export function Slider({ label, value, min, max, step = 1, onChange, format, color, id }: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; format: (v: number) => string; color?: string; id: string;
}) {
  const beginEdit = useStore((s) => s.beginEdit);
  const commitEdit = useStore((s) => s.commitEdit);
  const p = ((value - min) / (max - min)) * 100;
  return (
    <div className="grid grid-cols-[72px_1fr_56px] items-center gap-2">
      <label htmlFor={id} className="lbl !text-[10px]">{label}</label>
      <input
        id={id}
        type="range"
        className="rng"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ["--p" as string]: `${p}%`, ["--fill" as string]: color ?? "var(--color-cyan)" }}
        onPointerDown={beginEdit}
        onPointerUp={commitEdit}
        onKeyDown={(e) => { if (!e.repeat) beginEdit(); }}
        onKeyUp={commitEdit}
        onBlur={commitEdit}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="num text-right text-[12px] text-ink">{format(value)}</span>
    </div>
  );
}
