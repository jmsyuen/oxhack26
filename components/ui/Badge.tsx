import type { DatasetMeta } from "@/lib/engine/types";

type Kind = DatasetMeta["status"] | "LIVE" | "REFERENCE" | "FORECAST" | "SIMULATED";

const COLORS: Record<Kind, string> = {
  OBSERVED: "text-ink border-line-2",
  MODELLED: "text-mute border-line-2",
  SEED: "text-amber/90 border-amber/40",
  LIVE: "text-ink border-line-2",
  REFERENCE: "text-mute border-line-2",
  FORECAST: "text-cyan border-cyan/40",
  SIMULATED: "text-amber/90 border-amber/40",
};

/** Tiny outlined provenance badge. */
export function Badge({ kind, title }: { kind: Kind; title?: string }) {
  return (
    <span
      title={title}
      className={`num inline-flex h-[15px] items-center rounded-[2px] border px-1 text-[9px] leading-none tracking-[0.06em] ${COLORS[kind]}`}
    >
      {kind}
    </span>
  );
}
