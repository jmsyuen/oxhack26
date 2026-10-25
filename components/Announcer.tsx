"use client";
import { useEffect, useRef, useState } from "react";
import { narrate } from "@/lib/brief";
import type { ScenarioResult } from "@/lib/engine/types";
import { sayUsd } from "@/lib/format";
import { useStore } from "@/lib/store";

/** Screen-reader announcement (and optional spoken narration) of the headline change after each edit. */
export default function Announcer({ result }: { result: ScenarioResult | null }) {
  const commitSeq = useStore((s) => s.commitSeq);
  const [msg, setMsg] = useState("");
  const latest = useRef(result);
  latest.current = result;
  const prev = useRef<number | null>(null);

  useEffect(() => {
    if (commitSeq === 0) return;
    const t = setTimeout(() => {
      const r = latest.current;
      if (!r) return;
      const s = useStore.getState();
      let text: string;
      if (!s.blockages.length) text = "No blockages. No trade disrupted.";
      else if (!r.any) text = "The blockage doesn't touch any sea lane, so no trade is disrupted.";
      else {
        const d = r.disruptedUsd;
        const p = prev.current;
        const change = p !== null && Math.abs(d - p) > Math.max(1e8, p * 0.01)
          ? `, ${d > p ? "up" : "down"} ${sayUsd(Math.abs(d - p))}` : "";
        text = `Trade disrupted ${sayUsd(d)}${change}. Stranded ${sayUsd(r.strandedUsd)}.` +
          (r.price.oilPct >= 3 ? ` Oil price pressure ${Math.round(r.price.oilPct)} percent.` : "");
      }
      prev.current = r.any ? r.disruptedUsd : 0;
      setMsg(text);
      if (s.autoNarrate) narrate(text);
    }, 650);
    return () => clearTimeout(t);
  }, [commitSeq]);

  return <div aria-live="polite" role="status" className="sr-only">{msg}</div>;
}
