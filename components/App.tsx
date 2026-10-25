"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { loadEngineData, loadModelData } from "@/lib/data/load";
import { useDecision } from "@/lib/hooks/useDecision";
import type { ModelData } from "@/lib/models/types";
import { useStore } from "@/lib/store";
import AnalystPanel from "./analyst/AnalystPanel";
import DecisionStrip from "./decision/DecisionStrip";
import Panels from "./decision/Panels";
import Tour from "./Tour";
import { startTour, tourSeen } from "@/lib/tour";
import { ImpactEngine } from "@/lib/engine/engine";
import type { EngineData } from "@/lib/engine/types";
import { useKeyboard } from "@/lib/hooks/useKeyboard";
import { useScenario } from "@/lib/hooks/useScenario";
import Announcer from "./Announcer";
import BriefPanel from "./BriefPanel";
import KeyboardHelp from "./KeyboardHelp";
import SidePanel from "./panel/SidePanel";
import Timeline from "./Timeline";
import TopBar from "./TopBar";

const MapView = dynamic(() => import("./map/MapView"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center"><span className="lbl">Loading map</span></div>,
});

export default function App() {
  const [data, setData] = useState<EngineData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [md, setMd] = useState<ModelData | null>(null);
  useEffect(() => {
    loadEngineData().then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    loadModelData().then(setMd).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  const engine = useMemo(() => {
    if (!data) return null;
    try {
      return new ImpactEngine(data);
    } catch (e) {
      setError(`The trade engine could not start: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }, [data]);
  const result = useScenario(engine);
  useDecision(engine, md);
  useKeyboard();
  // open on the headline scenario: a two-week Suez closure
  useEffect(() => {
    if (engine && !useStore.getState().blockages.length && !useStore.getState().past.length) useStore.getState().applyPreset("suez14");
  }, [engine]);
  // first visit: start the guided tour once the map and models are ready
  useEffect(() => {
    if (!engine || !md || tourSeen()) return;
    const t = setTimeout(startTour, 1200);
    return () => clearTimeout(t);
  }, [engine, md]);

  return (
    <div className="grid h-screen grid-cols-1 grid-rows-[44px_minmax(420px,1fr)_auto] overflow-y-auto lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[44px_minmax(0,1fr)] lg:overflow-hidden 2xl:grid-cols-[minmax(0,1fr)_460px]">
      <div className="lg:col-span-2"><TopBar engine={engine} result={result} /></div>
      <main className="relative grid min-h-0 min-w-0 grid-rows-[minmax(260px,1fr)_52px_auto] overflow-hidden">
        <div data-tour="map" className="relative min-h-0">
          {error ? (
            <div className="grid h-full place-items-center px-6 text-center">
              <div>
                <p className="lbl mb-2 text-red">Data failed to load</p>
                <p className="max-w-md text-[13px] text-mute">{error}</p>
              </div>
            </div>
          ) : engine ? (
            <MapView engine={engine} result={result} />
          ) : (
            <div className="grid h-full place-items-center"><span className="lbl">Building sea-lane network</span></div>
          )}
          <BriefPanel />
        </div>
        <div data-tour="timeline" className="min-h-0"><Timeline result={result} /></div>
        {md ? <div data-tour="decision" className="h-[352px] min-h-0 min-w-0"><DecisionStrip md={md} /></div> : <div className="h-[352px] border-t border-line bg-panel" />}
      </main>
      {engine ? <SidePanel engine={engine} result={result} /> : <aside className="border-l border-line bg-panel" />}
      <KeyboardHelp />
      {md && <Panels md={md} />}
      <Tour />
      {engine && md && <AnalystPanel engine={engine} md={md} trade={result} />}
      <Announcer result={result} />
    </div>
  );
}
