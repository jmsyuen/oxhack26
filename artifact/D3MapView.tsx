"use client";
/**
 * Single-file map for the standalone artifact build: d3-geo (Mercator) + SVG, no tiles or workers, so it runs
 * under a strict content-security policy. Same interactions as components/map/MapView.tsx: click water to add a
 * blockage, drag to move, drag the white handle to resize, click a vessel for its decision.
 */
import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { C, tintOf } from "@/components/map/layers";
import { loadCountriesGeo } from "@/lib/data/load";
import { useDecisionStore } from "@/lib/decisionStore";
import type { ImpactEngine } from "@/lib/engine/engine";
import { destination, haversineKm } from "@/lib/engine/geo";
import type { Blockage, LonLat, ScenarioResult } from "@/lib/engine/types";
import { fmtPct, fmtUsd } from "@/lib/format";
import { DEFAULT_BLOCKAGE, mapBridge } from "@/lib/mapBridge";
import { VESSEL_SPECS } from "@/lib/models/assumptions";
import { useStore } from "@/lib/store";

declare const d3: typeof import("d3");
type Drag = { kind: "move" | "resize"; id: string; moved: boolean };

export default function D3MapView({ engine, result }: { engine: ImpactEngine; result: ScenarioResult | null }) {
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const drag = useRef<Drag | null>(null);
  const [size, setSize] = useState({ w: 900, h: 520 });
  const [k, setK] = useState(2);
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  const [ghost, setGhost] = useState<LonLat | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const blockages = useStore((s) => s.blockages);
  const selectedId = useStore((s) => s.selectedId);
  const mode = useStore((s) => s.mode);
  const decision = useDecisionStore((s) => s.result);
  const vesselId = useDecisionStore((s) => s.vesselId);

  useEffect(() => { loadCountriesGeo().then((g) => setGeo({ ...g, features: g.features.filter((f) => (f.properties as { iso3?: string })?.iso3 !== "ATA") })); }, []);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(200, e.contentRect.width), h: Math.max(200, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const projection = useMemo(() => d3.geoMercator().fitExtent([[0, 0], [size.w, size.h]],
    { type: "Feature", properties: {}, geometry: { type: "MultiPoint", coordinates: [[-180, -58], [180, 78]] } }), [size]);
  const path = useMemo(() => d3.geoPath(projection), [projection]);
  const countryD = useMemo(() => (geo?.features ?? []).map((f) => ({ iso: String((f.properties as { iso3?: string }).iso3), name: String((f.properties as { name?: string }).name ?? ""), d: path(f) ?? "" })), [geo, path]);
  const laneD = useMemo(() => engine.data.network.edges.map((e) => path({ type: "LineString", coordinates: e.coords }) ?? ""), [engine, path]);
  const maxEdge = useMemo(() => Math.max(1, ...Array.from(engine.edgeBase)), [engine]);

  const toLonLat = (cx: number, cy: number): LonLat | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const t = d3.zoomTransform(svg);
    const [px, py] = t.invert([cx - r.left, cy - r.top]);
    const ll = projection.invert?.([px, py]);
    return ll ? [ll[0], ll[1]] : null;
  };
  const isWater = (c: LonLat) => {
    if (engine.data.chokepoints.some((cp) => haversineKm(c, [cp.lon, cp.lat]) < 120)) return true;
    return !(geo?.features ?? []).some((f) => d3.geoContains(f, c));
  };
  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2200); };

  // zoom + pan
  useEffect(() => {
    const svg = svgRef.current, g = gRef.current;
    if (!svg || !g) return;
    let raf = 0;
    const z = d3.zoom<SVGSVGElement, unknown>().scaleExtent([1, 28])
      .filter((ev: Event & { button?: number; target: EventTarget | null }) => !(ev.target as Element)?.closest?.(".nozoom") && !(ev as MouseEvent).button)
      .on("zoom", (ev: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.setAttribute("transform", ev.transform.toString());
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; setK(ev.transform.k); });
      });
    zoomRef.current = z;
    const sel = d3.select(svg);
    sel.call(z).on("dblclick.zoom", null);
    const [cx, cy] = projection([44, 20]) ?? [0, 0];
    sel.call(z.transform, d3.zoomIdentity.translate(size.w / 2, size.h / 2).scale(2.3).translate(-cx, -cy));
    return () => { sel.on(".zoom", null); cancelAnimationFrame(raf); };
  }, [projection, size]);

  // bridge for keyboard, presets and panel
  useEffect(() => {
    const svg = svgRef.current;
    mapBridge.center = () => { const r = svg?.getBoundingClientRect(); return r ? toLonLat(r.left + r.width / 2, r.top + r.height / 2) : null; };
    mapBridge.isWater = isWater;
    mapBridge.toast = showToast;
    mapBridge.panBy = (dx, dy) => { if (svg && zoomRef.current) d3.select(svg).transition().duration(150).call(zoomRef.current.translateBy, -dx / k, -dy / k); };
    mapBridge.animateEntry = () => {};
    mapBridge.focus = (bs: Blockage[]) => {
      if (!svg || !zoomRef.current || !bs.length) return;
      const pts = bs.map((b) => projection([b.lon, b.lat]) ?? [0, 0]);
      const [x, y] = [d3.mean(pts, (p) => p[0])!, d3.mean(pts, (p) => p[1])!];
      d3.select(svg).transition().duration(600).call(zoomRef.current.transform, d3.zoomIdentity.translate(size.w / 2, size.h / 2).scale(Math.max(2.3, k)).translate(-x, -y));
    };
  });

  // ------------------------------------------------------------------ pointer interactions
  const onPointerDown = (e: React.PointerEvent, kind: Drag["kind"], id: string) => {
    e.stopPropagation();
    useStore.getState().select(id);
    useStore.getState().beginEdit();
    drag.current = { kind, id, moved: false };
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const ll = toLonLat(e.clientX, e.clientY);
    if (d && ll) {
      d.moved = true;
      const b = useStore.getState().blockages.find((x) => x.id === d.id);
      if (!b) return;
      if (d.kind === "move") useStore.getState().updateBlockage(d.id, { lon: ll[0], lat: ll[1] });
      else useStore.getState().updateBlockage(d.id, { radiusKm: haversineKm([b.lon, b.lat], ll) });
      return;
    }
    if (mode === "add") setGhost(ll);
    const t = (e.target as Element).closest?.("[data-tip]") as HTMLElement | SVGElement | null;
    if (!t) { if (hover) setHover(null); return; }
    const r = wrap.current!.getBoundingClientRect();
    setHover({ x: e.clientX - r.left, y: e.clientY - r.top, body: tipFor(t.getAttribute("data-tip")!) });
  };
  const onPointerUp = () => {
    if (drag.current) { useStore.getState().commitEdit(); window.setTimeout(() => { drag.current = null; }, 0); }
  };
  const onClick = (e: React.MouseEvent) => {
    if (drag.current?.moved) return;
    const target = e.target as Element;
    const s = useStore.getState();
    const v = target.closest?.("[data-vessel]");
    if (v && s.mode !== "add") { useDecisionStore.getState().openPanel("fleet", v.getAttribute("data-vessel")); return; }
    if (target.closest?.(".blk") && s.mode !== "add") return;
    const cp = target.closest?.("[data-cp]");
    if (cp) { const c = engine.data.chokepoints[Number(cp.getAttribute("data-cp"))]; s.addBlockage({ ...DEFAULT_BLOCKAGE, lon: c.lon, lat: c.lat, radiusKm: 80 }); return; }
    if (s.selectedId && s.mode !== "add") { s.select(null); return; }
    const ll = toLonLat(e.clientX, e.clientY);
    if (!ll) return;
    if (!isWater(ll)) { showToast("That’s land. Drop blockages on open water or a sea lane."); return; }
    s.addBlockage({ ...DEFAULT_BLOCKAGE, lon: ll[0], lat: ll[1] });
    setGhost(null);
  };
  const zoomBy = (f: number) => { if (svgRef.current && zoomRef.current) d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, f); };

  // ------------------------------------------------------------------ tooltips
  const countryByIso = useMemo(() => new Map((result?.countries ?? []).map((c) => [c.iso3, c])), [result]);
  const tipFor = (key: string): ReactNode => {
    const [kind, id] = key.split(":");
    if (kind === "c") {
      const c = countryByIso.get(id);
      const name = countryD.find((x) => x.iso === id)?.name ?? id;
      if (!c || c.totalUsd <= 0) return <span className="text-ink">{name}<span className="block text-mute">No modelled exposure</span></span>;
      return <span className="block space-y-0.5"><span className="block text-ink">{name}</span><span className="num block text-mute">{fmtUsd(c.totalUsd)} forced off route · {fmtPct(c.pctGdp, 2)} of GDP</span><span className="block text-mute">Top: {engine.data.flows.commodities[c.topCommodity].label}</span></span>;
    }
    if (kind === "l") {
      const e = Number(id);
      const a = result?.active;
      return <span className="num block text-mute"><span className="block font-sans text-ink">Sea lane · {engine.data.network.edges[e].nm.toFixed(0)} nm</span>Baseline {fmtUsd(engine.edgeBase[e] * 1e6)}/yr{a?.any && a.edgeAdded[e] > 1 ? ` · +${fmtUsd(a.edgeAdded[e] * 1e6)}/yr rerouted here` : ""}{a?.any && a.edgeCap[e] < 1 ? ` · capacity ${Math.round(a.edgeCap[e] * 100)}%` : ""}</span>;
    }
    if (kind === "v" && decision) {
      const i = decision.fleet.findIndex((v) => v.id === id);
      const v = decision.fleet[i], d = decision.mc.decisions[i];
      if (!v) return null;
      return <span className="block space-y-0.5"><span className="block text-ink"><span className="num">{v.id}</span> · {VESSEL_SPECS[v.type].label} · <span className={d.wait ? "text-cyan" : "text-amber"}>{d.wait ? "wait" : "reroute"}</span></span><span className="block text-mute">{v.from} → {v.to}</span><span className="num block text-mute">due in {v.arrival.toFixed(1)} d · wait {fmtUsd(d.costWaitMean)} vs reroute {isFinite(d.costReroute) ? fmtUsd(d.costReroute) : "n/a"}</span><span className="block text-faint">Click for the full breakdown</span></span>;
    }
    if (kind === "p") {
      const c = result?.chokepoints[Number(id)];
      const cp = engine.data.chokepoints[Number(id)];
      return <span className="num block text-mute"><span className="block font-sans text-ink">{cp.name}</span>{Math.round(cp.shipsPerDay)} ships/day normal{c && Math.abs(c.shipsPct) >= 1 ? ` → ${Math.round(c.shipsNew)} (${fmtPct(c.shipsPct, 0, true)})` : ""}<span className="block font-sans text-faint">Click to block</span></span>;
    }
    return null;
  };

  // ------------------------------------------------------------------ render
  const a = result?.active;
  const px = (n: number) => n / k;
  return (
    <div ref={wrap} className="absolute inset-0 overflow-hidden bg-[#060a10]" style={{ cursor: mode === "add" ? "crosshair" : undefined }}>
      <svg ref={svgRef} width={size.w} height={size.h} className="block touch-none select-none" role="application" aria-label="Interactive world map. Click open water to add a blockage."
        onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => { setHover(null); setGhost(null); }} onClick={onClick}>
        <g ref={gRef}>
          {countryD.map((c) => (
            <g key={c.iso} data-tip={`c:${c.iso}`}>
              <path d={c.d} fill="#111a28" stroke="#1E2A3C" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
              <path d={c.d} fill={C.red} style={{ transition: "fill-opacity 300ms ease-out" }} fillOpacity={0.62 * tintOf(countryByIso.get(c.iso)?.pctGdp ?? 0)} pointerEvents="none" />
            </g>
          ))}
          {laneD.map((d, e) => {
            const base = engine.edgeBase[e] || 1;
            const wv = 0.5 + 2.6 * Math.sqrt(base / maxEdge);
            const cut = a?.any ? Math.min(1, a.edgeRemoved[e] / base) : 0;
            const blocked = a?.any ? a.edgeCap[e] < 1 - 1e-9 : false;
            const add = a?.any && a.edgeAdded[e] > 1 ? Math.min(1, Math.sqrt(a.edgeAdded[e] / maxEdge)) : 0;
            const str = a?.any ? Math.min(1, a.edgeStranded[e] / base) : 0;
            return (
              <g key={e} data-tip={`l:${e}`}>
                <path d={d} fill="none" stroke="transparent" strokeWidth={9} vectorEffect="non-scaling-stroke" />
                <path d={d} fill="none" stroke={C.cyan} strokeOpacity={0.24 * (1 - 0.85 * cut)} strokeWidth={wv} vectorEffect="non-scaling-stroke" strokeLinecap="round" pointerEvents="none" />
                {cut < 0.5 && base > maxEdge * 0.02 && <path d={d} className={`lane-flow ${engine.edgeDir[e] < 0 ? "rev" : ""}`} fill="none" stroke={C.cyan} strokeOpacity={0.55} strokeWidth={Math.max(0.8, wv * 0.6)} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
                {add > 0 && <path d={d} fill="none" stroke={C.amber} strokeOpacity={0.85} strokeWidth={0.8 + 3 * add} vectorEffect="non-scaling-stroke" strokeLinecap="round" pointerEvents="none" />}
                {str > 0.05 && <path d={d} fill="none" stroke={C.strand} strokeOpacity={0.8} strokeWidth={1.2} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
                {blocked && <path d={d} fill="none" stroke={C.red} strokeOpacity={0.9} strokeWidth={wv + 0.6} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
              </g>
            );
          })}
          {(a?.traces ?? []).map((t) => (
            <path key={t.key} d={path({ type: "LineString", coordinates: t.coords }) ?? ""} pathLength={1} className="trace-draw" fill="none" stroke={C.amber} strokeWidth={px(2.2)} strokeLinecap="round" pointerEvents="none" />
          ))}
          {(decision?.fleet ?? []).map((v, i) => {
            const d = decision!.mc.decisions[i];
            const p = projection(v.pos);
            if (!p) return null;
            const sel = v.id === vesselId;
            return <circle key={v.id} data-vessel={v.id} data-tip={`v:${v.id}`} className="nozoom cursor-pointer" cx={p[0]} cy={p[1]} r={px(sel ? 5 : 2.3)}
              fill={!d.feasible ? C.strand : d.wait ? C.cyan : C.amber} fillOpacity={0.9} stroke={sel ? C.ink : "none"} strokeWidth={px(1.5)} />;
          })}
          {engine.data.chokepoints.map((cp, i) => {
            const p = projection([cp.lon, cp.lat]);
            const c = result?.chokepoints[i];
            if (!p) return null;
            const fill = c?.blocked ? C.red : c && c.shipsPct > 5 ? C.green : C.ink;
            const covered = blockages.some((b) => haversineKm([cp.lon, cp.lat], [b.lon, b.lat]) < b.radiusKm + 90);
            return (
              <g key={cp.id} data-cp={i} data-tip={`p:${i}`} className="cursor-pointer">
                <circle cx={p[0]} cy={p[1]} r={px(7)} fill="transparent" />
                <circle cx={p[0]} cy={p[1]} r={px(2.8)} fill={fill} stroke={C.bg} strokeWidth={px(1)} />
                {!covered && <text x={p[0] + px(6)} y={p[1] + px(3)} fontSize={px(10)} fill={C.ink} fillOpacity={0.75} pointerEvents="none">{cp.name.replace(/^Strait of /, "")}</text>}
              </g>
            );
          })}
          {blockages.map((b, i) => {
            const circle = path(d3.geoCircle().center([b.lon, b.lat]).radius(b.radiusKm / 111.195)()) ?? "";
            const c = projection([b.lon, b.lat]) ?? [0, 0];
            const hp = projection(destination([b.lon, b.lat], b.radiusKm, 90)) ?? c;
            const minPx = px(16);
            const hx = Math.max(hp[0], c[0] + minPx);
            const top = projection(destination([b.lon, b.lat], b.radiusKm, 0)) ?? c;
            const sel = b.id === selectedId;
            const active = !result || result.viewDay >= result.horizonDays || result.activeIds.includes(b.id);
            return (
              <g key={b.id} className="blk nozoom" opacity={active ? 1 : 0.45}>
                <path d={circle} fill={C.red} fillOpacity={0.1 + 0.25 * b.severity} stroke={sel ? C.ink : C.red} strokeWidth={sel ? 1.4 : 1} vectorEffect="non-scaling-stroke"
                  className="cursor-move" onPointerDown={(e) => onPointerDown(e, "move", b.id)} />
                <path d={circle} className="blk-pulse" fill="none" stroke={C.red} strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                <circle cx={c[0]} cy={c[1]} r={px(4)} fill={C.red} stroke={C.ink} strokeWidth={px(1)} className="cursor-move" onPointerDown={(e) => onPointerDown(e, "move", b.id)} />
                <circle cx={hx} cy={hp[1]} r={px(4.5)} fill={C.ink} stroke={C.bg} strokeWidth={px(1)} className="cursor-ew-resize" onPointerDown={(e) => onPointerDown(e, "resize", b.id)} />
                <g transform={`translate(${c[0]},${Math.min(top[1], c[1] - minPx) - px(6)})`} pointerEvents="none">
                  <rect x={px(-46)} y={px(-12)} width={px(92)} height={px(14)} rx={px(2)} fill={C.bg} fillOpacity={0.9} stroke={sel ? C.ink : C.red} strokeOpacity={0.6} strokeWidth={px(1)} />
                  <text textAnchor="middle" y={px(-2)} fontSize={px(10)} fill={C.ink} className="num">{`B${i + 1}  ${Math.round(b.severity * 100)}% · ${b.durationDays}d`}</text>
                </g>
              </g>
            );
          })}
          {mode === "add" && ghost && (
            <path d={path(d3.geoCircle().center(ghost).radius(DEFAULT_BLOCKAGE.radiusKm / 111.195)()) ?? ""} fill={C.red} fillOpacity={0.12} stroke={C.red} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          )}
        </g>
      </svg>
      {hover?.body && (
        <div className="pointer-events-none absolute z-10 max-w-[260px] rounded-sm border border-line-2 bg-raised px-2.5 py-1.5 text-[12px] leading-snug"
          style={{ left: Math.min(hover.x + 14, size.w - 270), top: Math.max(8, hover.y - 10) }}>{hover.body}</div>
      )}
      <div className="absolute left-3 top-3 space-y-0.5 rounded-sm border border-line bg-bg/85 px-2 py-1.5 text-[10px] text-mute">
        <div className="flex items-center gap-1.5"><i className="inline-block h-[2px] w-3 bg-cyan" />Sea lane, normal</div>
        <div className="flex items-center gap-1.5"><i className="inline-block h-[2px] w-3 bg-amber" />Rerouted trade</div>
        <div className="flex items-center gap-1.5"><i className="inline-block h-[6px] w-[6px] rounded-full bg-cyan" />Vessel: wait <i className="ml-1 inline-block h-[6px] w-[6px] rounded-full bg-amber" />reroute</div>
        <div className="flex items-center gap-1.5"><i className="inline-block h-2 w-3 bg-red/50" />Exposure, % of GDP</div>
      </div>
      {!blockages.length && <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-sm border border-line bg-bg/85 px-3 py-1.5 text-[12px] text-mute">Click anywhere on the ocean to drop a blockage</div>}
      {toast && <div role="status" className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-sm border border-line-2 bg-raised px-3 py-1.5 text-[12px] text-ink">{toast}</div>}
      <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-sm border border-line bg-panel">
        <button aria-label="Zoom in" onClick={() => zoomBy(1.6)} className="grid h-[26px] w-[26px] place-items-center text-mute hover:text-ink"><Plus size={14} /></button>
        <button aria-label="Zoom out" onClick={() => zoomBy(1 / 1.6)} className="grid h-[26px] w-[26px] place-items-center border-t border-line text-mute hover:text-ink"><Minus size={14} /></button>
      </div>
      <div className="pointer-events-none absolute bottom-1 left-2 text-[9px] text-faint">Natural Earth · IMF PortWatch · offline vector map</div>
    </div>
  );
}
