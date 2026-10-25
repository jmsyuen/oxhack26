"use client";
import maplibregl, { type ExpressionSpecification, type GeoJSONSource, type MapMouseEvent, type MapTouchEvent } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ImpactEngine } from "@/lib/engine/engine";
import { N_COMMODITIES } from "@/lib/engine/engine";
import { destination, haversineKm } from "@/lib/engine/geo";
import type { LonLat, ScenarioResult } from "@/lib/engine/types";
import { fmtPct, fmtUsd } from "@/lib/format";
import { DEFAULT_BLOCKAGE, mapBridge } from "@/lib/mapBridge";
import { useStore } from "@/lib/store";
import { useDecisionStore } from "@/lib/decisionStore";
import {
  C, DASH_SEQUENCE, blockagesGeoJSON, chokepointsGeoJSON, ghostGeoJSON, lanesGeoJSON, resolveStyle, tintOf, traceGradient,
} from "./layers";

type Hover =
  | { kind: "country"; x: number; y: number; iso3: string; name: string }
  | { kind: "lane"; x: number; y: number; edge: number }
  | { kind: "chokepoint"; x: number; y: number; idx: number }
  | { kind: "blockage"; x: number; y: number; id: string }
  | null;

interface Drag {
  kind: "move" | "resize";
  id: string;
  offset: LonLat;
  start: { x: number; y: number };
  moved: boolean;
  startRadius: number;
  startDist: number;
}

/** On-screen minimum distance (px) between a blockage centre and its resize handle. */
const HANDLE_MIN_PX = 16;

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function MapView({ engine, result }: { engine: ImpactEngine; result: ScenarioResult | null }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [hover, setHover] = useState<Hover>(null);
  const [toast, setToast] = useState<string | null>(null);
  const resultRef = useRef<ScenarioResult | null>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const grow = useRef(new Map<string, number>());
  const labels = useRef(new Map<string, { m: maplibregl.Marker; el: HTMLDivElement }>());
  const cpLabels = useRef<maplibregl.Marker[]>([]);
  const tint = useRef(new Map<string, number>());
  const drawRef = useRef<() => void>(() => {});
  const traceKey = useRef("");
  const maxEdge = useMemo(() => {
    let x = 0;
    for (let e = 0; e < engine.nEdges; e++) x = Math.max(x, engine.edgeBase[e]);
    return x || 1;
  }, [engine]);
  resultRef.current = result;

  // ------------------------------------------------------------------ init
  useEffect(() => {
    let cancelled = false;
    let map: maplibregl.Map | null = null;
    (async () => {
      const { style, offline } = await resolveStyle();
      if (cancelled || !box.current) return;
      setOffline(offline);
      map = new maplibregl.Map({
        container: box.current,
        style,
        center: [58, 16],
        zoom: 1.9,
        minZoom: 1.2,
        maxZoom: 9,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: { compact: true },
        renderWorldCopies: true,
      });
      map.touchZoomRotate.disableRotation();
      map.keyboard.disable();
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      mapRef.current = map;
      if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug")) {
        (window as unknown as { __map?: maplibregl.Map }).__map = map;
      }
      map.on("error", (ev) => console.warn("[map]", ev.error?.message ?? ev));
      map.on("load", () => {
        if (cancelled || !map) return;
        addLayers(map, engine, offline);
        setReady(true);
      });
    })();
    return () => {
      cancelled = true;
      labels.current.forEach(({ m }) => m.remove());
      labels.current.clear();
      cpLabels.current.forEach((m) => m.remove());
      map?.remove();
      mapRef.current = null;
    };
  }, [engine]);

  // ------------------------------------------------------------------ blockage drawing (store-driven, immediate)
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const draw = () => {
      const s = useStore.getState();
      const r = resultRef.current;
      const activeIds = r && r.viewDay !== r.horizonDays ? new Set(r.activeIds) : null;
      const g = blockagesGeoJSON(s.blockages, { selectedId: s.selectedId, activeIds, grow: grow.current });
      for (const f of g.handle.features) {
        const b = s.blockages.find((x) => x.id === f.properties!.id);
        if (!b) continue;
        const c = map.project([b.lon, b.lat]);
        const h = map.project((f.geometry as GeoJSON.Point).coordinates as [number, number]);
        if (Math.hypot(h.x - c.x, h.y - c.y) < HANDLE_MIN_PX) {
          const ll = map.unproject([c.x + HANDLE_MIN_PX, c.y]);
          (f.geometry as GeoJSON.Point).coordinates = [ll.lng, ll.lat];
        }
      }
      (map.getSource("blk-fill") as GeoJSONSource).setData(g.fill);
      (map.getSource("blk-ring") as GeoJSONSource).setData(g.ring);
      (map.getSource("blk-handle") as GeoJSONSource).setData(g.handle);
      (map.getSource("blk-core") as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: s.blockages.map((b) => ({
          type: "Feature",
          properties: { id: b.id, sel: b.id === s.selectedId ? 1 : 0, active: !activeIds || activeIds.has(b.id) ? 1 : 0 },
          geometry: { type: "Point", coordinates: [b.lon, b.lat] },
        })),
      });
      // labels
      const seen = new Set<string>();
      s.blockages.forEach((b, i) => {
        seen.add(b.id);
        let L = labels.current.get(b.id);
        if (!L) {
          // MapLibre writes inline opacity on the marker element itself, so style an inner element
          const outer = document.createElement("div");
          outer.className = "pointer-events-none";
          const el = document.createElement("div");
          el.className = "num whitespace-nowrap rounded-[2px] border border-red/50 bg-bg/90 px-1 py-[1px] text-[10px] leading-tight text-ink transition-opacity duration-200";
          outer.appendChild(el);
          const m = new maplibregl.Marker({ element: outer, anchor: "bottom", offset: [0, -4] }).setLngLat([b.lon, b.lat]).addTo(map);
          L = { m, el };
          labels.current.set(b.id, L);
        }
        const gr = grow.current.get(b.id) ?? 1;
        const top = destination([b.lon, b.lat], b.radiusKm * (0.35 + 0.65 * gr), 0);
        L.m.setLngLat(top);
        const active = !activeIds || activeIds.has(b.id);
        L.el.textContent = `B${i + 1}  ${Math.round(b.severity * 100)}% · ${b.durationDays}d${active ? "" : " · ended"}`;
        L.el.style.opacity = active ? "1" : "0.45";
        L.el.style.borderColor = b.id === s.selectedId ? C.ink : "rgba(239,90,95,0.5)";
      });
      for (const [id, L] of labels.current) if (!seen.has(id)) { L.m.remove(); labels.current.delete(id); }
      engine.data.chokepoints.forEach((cp, i) => {
        const el = cpLabels.current[i]?.getElement();
        if (!el) return;
        const covered = s.blockages.some((b) => haversineKm([cp.lon, cp.lat], [b.lon, b.lat]) < b.radiusKm + 90);
        el.style.visibility = covered ? "hidden" : "visible";
      });
      map.getCanvas().style.cursor = s.mode === "add" ? "crosshair" : "";
      if (s.mode !== "add") (map.getSource("ghost") as GeoJSONSource).setData(ghostGeoJSON(null, 0));
    };
    drawRef.current = draw;
    draw();
    let zr = 0;
    const onZoom = () => { if (!zr) zr = requestAnimationFrame(() => { zr = 0; draw(); }); };
    map.on("zoom", onZoom);
    const unsub = useStore.subscribe((s, p) => {
      if (s.blockages !== p.blockages || s.selectedId !== p.selectedId || s.mode !== p.mode) draw();
    });
    return () => { unsub(); map.off("zoom", onZoom); if (zr) cancelAnimationFrame(zr); };
  }, [ready, engine]);

  // ------------------------------------------------------------------ result-driven layers
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !result) return;
    drawRef.current();
    const a = result.active;
    // lanes
    for (let e = 0; e < engine.nEdges; e++) {
      const base = engine.edgeBase[e] || 1;
      const st = a && a.any
        ? {
            cap: a.edgeCap[e],
            cut: Math.min(1, a.edgeRemoved[e] / base),
            stranded: Math.min(1, a.edgeStranded[e] / base),
            add: a.edgeAdded[e] > 1 ? Math.min(1, Math.sqrt(a.edgeAdded[e] / maxEdge)) : 0,
          }
        : { cap: 1, cut: 0, stranded: 0, add: 0 };
      map.setFeatureState({ source: "lanes", id: e }, st);
    }
    // chokepoints
    result.chokepoints.forEach((c, i) => {
      map.setFeatureState({ source: "cps", id: i }, { blocked: c.blocked, gain: !c.blocked && c.shipsPct > 5 ? 1 : 0 });
    });
    // reroute traces (animated once per new set)
    const traces = a?.traces ?? [];
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: traces.map((t) => ({ type: "Feature", properties: { v: t.value }, geometry: { type: "LineString", coordinates: t.coords } })),
    };
    (map.getSource("traces") as GeoJSONSource).setData(fc);
    const key = traces.map((t) => t.key).join(",");
    if (key && key !== traceKey.current) {
      traceKey.current = key;
      if (reduceMotion()) map.setPaintProperty("traces", "line-gradient", traceGradient(1));
      else {
        const t0 = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - t0) / 900);
          if (!mapRef.current?.getLayer("traces")) return;
          map.setPaintProperty("traces", "line-gradient", traceGradient(1 - Math.pow(1 - p, 2)));
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }
    // country tint tween (300ms)
    const target = new Map<string, number>();
    for (const c of result.countries) target.set(c.iso3, tintOf(c.pctGdp));
    const from = new Map(tint.current);
    const isos = new Set([...from.keys(), ...target.keys()]);
    const t0 = performance.now();
    const dur = reduceMotion() ? 1 : 300;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      for (const iso of isos) {
        const v = (from.get(iso) ?? 0) + ((target.get(iso) ?? 0) - (from.get(iso) ?? 0)) * e;
        tint.current.set(iso, v);
        map.setFeatureState({ source: "countries", id: iso }, { t: v });
      }
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, result, engine, maxEdge]);

  // ------------------------------------------------------------------ ambient animation: lane flow + pulse
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || reduceMotion()) return;
    let raf = 0;
    let lastStep = -1;
    const loop = (now: number) => {
      const step = Math.floor(now / 70) % DASH_SEQUENCE.length;
      if (step !== lastStep && map.getLayer("lanes-flow")) {
        map.setPaintProperty("lanes-flow", "line-dasharray", DASH_SEQUENCE[step]);
        lastStep = step;
      }
      const ph = (now % 2600) / 2600;
      if (map.getLayer("blk-pulse")) {
        map.setPaintProperty("blk-pulse", "line-opacity", ["*", ["get", "active"], 0.65 * (1 - ph)]);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  // ------------------------------------------------------------------ simulated vessels (decision engine)
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!map.getSource("vessels")) {
      map.addSource("vessels", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "vessels", type: "circle", source: "vessels", paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["case", ["==", ["get", "sel"], 1], 4.5, 1.9], 5, ["case", ["==", ["get", "sel"], 1], 6, 3.4]],
        "circle-color": ["match", ["get", "d"], "reroute", C.amber, "noalt", C.strand, C.cyan],
        "circle-opacity": 0.9,
        "circle-stroke-width": ["case", ["==", ["get", "sel"], 1], 1.5, 0],
        "circle-stroke-color": C.ink,
      } }, map.getLayer("ghost-fill") ? "ghost-fill" : undefined);
    }
    const draw = () => {
      const { result: r, vesselId } = useDecisionStore.getState();
      const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: (r?.fleet ?? []).map((v, i) => ({
        type: "Feature", properties: { id: v.id, d: !r!.mc.decisions[i].feasible ? "noalt" : r!.mc.decisions[i].wait ? "wait" : "reroute", sel: v.id === vesselId ? 1 : 0 },
        geometry: { type: "Point", coordinates: v.pos },
      })) };
      (map.getSource("vessels") as GeoJSONSource | undefined)?.setData(fc);
    };
    draw();
    const unsub = useDecisionStore.subscribe((s, p) => { if (s.result !== p.result || s.vesselId !== p.vesselId) draw(); });
    const enter = () => { map.getCanvas().style.cursor = "pointer"; };
    const leave = () => { map.getCanvas().style.cursor = ""; };
    map.on("mouseenter", "vessels", enter);
    map.on("mouseleave", "vessels", leave);
    return () => { unsub(); map.off("mouseenter", "vessels", enter); map.off("mouseleave", "vessels", leave); };
  }, [ready]);

  // ------------------------------------------------------------------ interactions
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const cps = engine.data.chokepoints;

    const nearChokepoint = (c: LonLat, km: number) => {
      let best: { i: number; d: number } | null = null;
      cps.forEach((cp, i) => {
        const d = haversineKm(c, [cp.lon, cp.lat]);
        if (d < km && (!best || d < best.d)) best = { i, d };
      });
      return best as { i: number; d: number } | null;
    };
    const isWaterAt = (pt: maplibregl.PointLike, c: LonLat) => {
      const feats = map.queryRenderedFeatures(pt, { layers: ["countries-fill", "lanes-hit"] });
      if (feats.some((f) => f.layer.id === "lanes-hit")) return true;
      if (!feats.some((f) => f.layer.id === "countries-fill")) return true;
      return !!nearChokepoint(c, 120);
    };
    const showToast = (m: string) => {
      setToast(m);
      window.clearTimeout((showToast as unknown as { t?: number }).t);
      (showToast as unknown as { t?: number }).t = window.setTimeout(() => setToast(null), 2200);
    };

    mapBridge.center = () => { const c = map.getCenter(); return [c.lng, c.lat]; };
    mapBridge.isWater = (c) => isWaterAt(map.project(c), c);
    mapBridge.panBy = (dx, dy) => map.panBy([dx, dy], { duration: 150 });
    mapBridge.toast = showToast;
    mapBridge.focus = (bs) => {
      if (!bs.length) return;
      const b = new maplibregl.LngLatBounds();
      for (const x of bs) {
        const dLat = (x.radiusKm * 3) / 111;
        const dLon = dLat / Math.max(0.2, Math.cos((x.lat * Math.PI) / 180));
        b.extend([x.lon - dLon, x.lat - dLat]);
        b.extend([x.lon + dLon, x.lat + dLat]);
      }
      const z = Math.min(map.getZoom(), 3.2);
      const cam = map.cameraForBounds(b, { padding: 120, maxZoom: Math.max(2.2, z) });
      if (cam) map.easeTo({ ...cam, zoom: Math.min(cam.zoom ?? z, 3.6), duration: reduceMotion() ? 0 : 650 });
    };
    mapBridge.animateEntry = (ids) => {
      if (reduceMotion()) return;
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / 450);
        const e = 1 - Math.pow(1 - p, 3);
        ids.forEach((id) => grow.current.set(id, e));
        drawRef.current();
        if (p < 1) requestAnimationFrame(step);
        else { ids.forEach((id) => grow.current.delete(id)); drawRef.current(); }
      };
      requestAnimationFrame(step);
    };

    const hitBlockage = (pt: maplibregl.PointLike) => {
      const f = map.queryRenderedFeatures(pt, { layers: ["blk-core", "blk-handle", "blk-fill"] });
      const core = f.find((x) => x.layer.id === "blk-core");
      if (core) return { kind: "move" as const, id: String(core.properties!.id) };
      const h = f.find((x) => x.layer.id === "blk-handle");
      if (h) return { kind: "resize" as const, id: String(h.properties!.id) };
      const b = f.find((x) => x.layer.id === "blk-fill");
      if (b) return { kind: "move" as const, id: String(b.properties!.id) };
      return null;
    };

    const onDown = (e: MapMouseEvent | MapTouchEvent) => {
      if ("originalEvent" in e && (e.originalEvent as MouseEvent).button > 0) return;
      const s = useStore.getState();
      if (s.mode === "add") return;
      const hit = hitBlockage(e.point);
      if (!hit) return;
      e.preventDefault();
      const b = s.blockages.find((x) => x.id === hit.id)!;
      s.select(hit.id);
      s.beginEdit();
      drag.current = {
        kind: hit.kind, id: hit.id,
        offset: [b.lon - e.lngLat.lng, b.lat - e.lngLat.lat],
        start: { x: e.point.x, y: e.point.y }, moved: false,
        startRadius: b.radiusKm,
        startDist: haversineKm([b.lon, b.lat], [e.lngLat.lng, e.lngLat.lat]),
      };
      map.getCanvas().style.cursor = hit.kind === "resize" ? "ew-resize" : "grabbing";
    };

    let hoverRaf = 0;
    const onMove = (e: MapMouseEvent | MapTouchEvent) => {
      const s = useStore.getState();
      const d = drag.current;
      if (d) {
        if (!d.moved && Math.hypot(e.point.x - d.start.x, e.point.y - d.start.y) > 2) d.moved = true;
        if (!d.moved) return;
        const b = s.blockages.find((x) => x.id === d.id);
        if (!b) return;
        if (d.kind === "move") s.updateBlockage(d.id, { lon: e.lngLat.lng + d.offset[0], lat: e.lngLat.lat + d.offset[1] });
        else s.updateBlockage(d.id, { radiusKm: d.startRadius + haversineKm([b.lon, b.lat], [e.lngLat.lng, e.lngLat.lat]) - d.startDist });
        setHover(null);
        return;
      }
      if (s.mode === "add") {
        (map.getSource("ghost") as GeoJSONSource).setData(ghostGeoJSON([e.lngLat.lng, e.lngLat.lat], DEFAULT_BLOCKAGE.radiusKm));
        setHover(null);
        return;
      }
      if (hoverRaf) return;
      const { x, y } = e.point;
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = 0;
        const f = map.queryRenderedFeatures([x, y], { layers: ["blk-core", "blk-handle", "blk-fill", "cp-dots", "lanes-hit", "countries-fill"] });
        const top = f[0];
        const canvas = map.getCanvas();
        if (!top) { setHover(null); canvas.style.cursor = ""; return; }
        const id = top.layer.id;
        if (id === "blk-handle") { canvas.style.cursor = "ew-resize"; setHover(null); return; }
        if (id === "blk-fill" || id === "blk-core") { canvas.style.cursor = "move"; setHover({ kind: "blockage", x, y, id: String(top.properties!.id) }); return; }
        canvas.style.cursor = "";
        if (id === "cp-dots") setHover({ kind: "chokepoint", x, y, idx: Number(top.properties!.idx) });
        else if (id === "lanes-hit") setHover({ kind: "lane", x, y, edge: Number(top.properties!.id) });
        else setHover({ kind: "country", x, y, iso3: String(top.properties!.iso3), name: String(top.properties!.name) });
      });
    };

    const onUp = () => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      useStore.getState().commitEdit();
      suppressClick.current = d.moved;
      // MapLibre fires no click after a real drag; clear the flag once any click from this gesture has passed
      window.setTimeout(() => { suppressClick.current = false; }, 0);
      map.getCanvas().style.cursor = "";
    };

    const onClick = (e: MapMouseEvent) => {
      if (suppressClick.current) { suppressClick.current = false; return; }
      const vHit = map.getLayer("vessels") ? map.queryRenderedFeatures(e.point, { layers: ["vessels"] })[0] : undefined;
      if (vHit && useStore.getState().mode !== "add") { useDecisionStore.getState().openPanel("fleet", String(vHit.properties!.id)); return; }
      const s = useStore.getState();
      const c: LonLat = [e.lngLat.lng, e.lngLat.lat];
      if (s.mode !== "add") {
        const hit = hitBlockage(e.point);
        if (hit) { s.select(hit.id); return; }
        if (s.selectedId) { s.select(null); return; }
      }
      const cpHit = map.queryRenderedFeatures(e.point, { layers: ["cp-dots"] })[0];
      if (cpHit) {
        const cp = cps[Number(cpHit.properties!.idx)];
        s.addBlockage({ ...DEFAULT_BLOCKAGE, lon: cp.lon, lat: cp.lat, radiusKm: 80 });
        return;
      }
      if (!isWaterAt(e.point, c)) {
        showToast("That’s land. Drop blockages on open water or a sea lane.");
        return;
      }
      s.addBlockage({ ...DEFAULT_BLOCKAGE, lon: c[0], lat: c[1] });
    };

    const onLeave = () => setHover(null);

    map.on("mousedown", onDown);
    map.on("touchstart", onDown);
    map.on("mousemove", onMove);
    map.on("touchmove", onMove);
    map.on("click", onClick);
    map.on("mouseout", onLeave);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      map.off("mousedown", onDown);
      map.off("touchstart", onDown);
      map.off("mousemove", onMove);
      map.off("touchmove", onMove);
      map.off("click", onClick);
      map.off("mouseout", onLeave);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, [ready, engine]);

  // chokepoint name labels
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    cpLabels.current = engine.data.chokepoints.map((c) => {
      const el = document.createElement("div");
      el.className = "pointer-events-none text-[10px] font-medium tracking-[0.06em] uppercase text-mute whitespace-nowrap";
      el.style.textShadow = "0 0 3px #070B12, 0 0 3px #070B12";
      el.textContent = c.name.replace("Strait of ", "").replace(" Strait", "").replace(" Canal", "");
      return new maplibregl.Marker({ element: el, anchor: "left", offset: [7, 0] }).setLngLat([c.lon, c.lat]).addTo(map);
    });
  }, [ready, engine]);

  const blockages = useStore((s) => s.blockages);
  const mode = useStore((s) => s.mode);

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <div ref={box} className="h-full w-full" aria-label="Interactive world map. Press N to add a blockage, arrow keys to move the selected one." role="application" />
      </div>
      {!ready && (
        <div className="absolute inset-0 grid place-items-center text-mute">
          <span className="lbl">Loading map</span>
        </div>
      )}
      {ready && blockages.length === 0 && mode === "idle" && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-sm border border-line bg-panel/90 px-3 py-1.5 text-[12px] text-ink">
          Click anywhere on the ocean to drop a blockage
        </div>
      )}
      {mode === "add" && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-sm border border-red/50 bg-panel/90 px-3 py-1.5 text-[12px] text-ink">
          Click on water to place the blockage · <span className="text-mute">Esc to cancel</span>
        </div>
      )}
      {toast && (
        <div role="status" className="pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 rounded-sm border border-line-2 bg-raised px-3 py-1.5 text-[12px] text-ink">
          {toast}
        </div>
      )}
      <Legend offline={offline && ready} />
      {hover && <HoverCard hover={hover} engine={engine} result={result} width={box.current?.clientWidth ?? 1200} height={box.current?.clientHeight ?? 800} />}
    </div>
  );
}

function addLayers(map: maplibregl.Map, engine: ImpactEngine, offline: boolean) {
  const style = map.getStyle();
  const firstSymbol = style.layers?.find((l) => l.type === "symbol")?.id;
  const before = offline ? undefined : firstSymbol;

  map.addSource("countries", { type: "geojson", data: new URL("/data/countries.geojson", window.location.href).href, promoteId: "iso3" });
  if (offline) {
    map.addLayer({ id: "countries-land", type: "fill", source: "countries", paint: { "fill-color": "#111a28" } });
    map.addLayer({ id: "countries-border", type: "line", source: "countries", paint: { "line-color": "#1E2A3C", "line-width": 0.6 } });
  }
  map.addLayer({
    id: "countries-fill", type: "fill", source: "countries",
    paint: {
      "fill-color": ["interpolate", ["linear"], ["coalesce", ["feature-state", "t"], 0],
        0, "rgba(239,90,95,0)", 0.02, "rgba(239,90,95,0.06)", 0.5, "rgba(239,90,95,0.34)", 1, "rgba(239,90,95,0.62)"],
    },
  }, before);

  map.addSource("lanes", { type: "geojson", data: lanesGeoJSON(engine) });
  const width = (k: number, add = 0): ExpressionSpecification =>
    ["interpolate", ["linear"], ["zoom"], 1, ["+", 0.35 + add, ["*", 2.0 * k, ["get", "w"]]], 5, ["+", 0.8 + add, ["*", 5.0 * k, ["get", "w"]]]];
  const cutFade: ExpressionSpecification = ["-", 1, ["*", 0.85, ["coalesce", ["feature-state", "cut"], 0]]];
  map.addLayer({ id: "lanes-base", type: "line", source: "lanes", layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": C.cyan, "line-width": width(1), "line-opacity": ["*", 0.22, cutFade] } }, before);
  map.addLayer({ id: "lanes-flow", type: "line", source: "lanes", layout: { "line-join": "round" },
    paint: { "line-color": C.cyan, "line-width": width(0.8), "line-opacity": ["*", 0.75, cutFade], "line-dasharray": DASH_SEQUENCE[0] } }, before);
  map.addLayer({ id: "lanes-stranded", type: "line", source: "lanes",
    paint: { "line-color": C.strand, "line-dasharray": [1.2, 1.6],
      "line-width": ["+", 1, ["*", 3, ["coalesce", ["feature-state", "stranded"], 0]]],
      "line-opacity": ["case", [">=", ["coalesce", ["feature-state", "stranded"], 0], 0.05], ["+", 0.45, ["*", 0.5, ["coalesce", ["feature-state", "stranded"], 0]]], 0] } }, before);
  map.addLayer({ id: "lanes-reroute", type: "line", source: "lanes", layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": C.amber,
      "line-width": ["interpolate", ["linear"], ["zoom"], 1, ["+", 0.6, ["*", 3, ["coalesce", ["feature-state", "add"], 0]]], 5, ["+", 1.2, ["*", 7, ["coalesce", ["feature-state", "add"], 0]]]],
      "line-opacity": ["case", [">", ["coalesce", ["feature-state", "add"], 0], 0], 0.55, 0] } }, before);
  map.addLayer({ id: "lanes-blocked", type: "line", source: "lanes", layout: { "line-cap": "round" },
    paint: { "line-color": C.red, "line-width": width(1, 1.2),
      "line-opacity": ["case", ["<", ["coalesce", ["feature-state", "cap"], 1], 0.999], ["-", 1, ["*", 0.5, ["coalesce", ["feature-state", "cap"], 1]]], 0] } }, before);
  map.addSource("traces", { type: "geojson", lineMetrics: true, data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "traces", type: "line", source: "traces", layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.4, 5, 2.6], "line-gradient": traceGradient(1) } }, before);
  map.addLayer({ id: "lanes-hit", type: "line", source: "lanes", paint: { "line-color": "#000", "line-opacity": 0, "line-width": 9 } });

  map.addSource("cps", { type: "geojson", data: chokepointsGeoJSON(engine) });
  map.addLayer({ id: "cp-dots", type: "circle", source: "cps",
    paint: {
      "circle-radius": 3.6,
      "circle-color": ["case", ["boolean", ["feature-state", "blocked"], false], C.red, ["==", ["coalesce", ["feature-state", "gain"], 0], 1], C.green, C.bg],
      "circle-stroke-color": ["case", ["boolean", ["feature-state", "blocked"], false], C.red, ["==", ["coalesce", ["feature-state", "gain"], 0], 1], C.green, C.ink],
      "circle-stroke-width": 1.2,
    } });

  const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
  map.addSource("ghost", { type: "geojson", data: empty });
  map.addLayer({ id: "ghost-fill", type: "fill", source: "ghost", paint: { "fill-color": C.red, "fill-opacity": 0.12 } });
  map.addLayer({ id: "ghost-line", type: "line", source: "ghost", paint: { "line-color": C.red, "line-width": 1, "line-dasharray": [2, 2], "line-opacity": 0.8 } });
  map.addSource("blk-fill", { type: "geojson", data: empty });
  map.addSource("blk-ring", { type: "geojson", data: empty });
  map.addSource("blk-handle", { type: "geojson", data: empty });
  map.addLayer({ id: "blk-fill", type: "fill", source: "blk-fill",
    paint: { "fill-color": C.red, "fill-opacity": ["*", ["+", 0.35, ["*", 0.65, ["get", "active"]]], ["+", 0.06, ["*", 0.42, ["get", "sev"]]]] } });
  map.addLayer({ id: "blk-line", type: "line", source: "blk-fill",
    paint: { "line-color": ["case", ["==", ["get", "sel"], 1], C.ink, C.red],
      "line-width": ["case", ["==", ["get", "sel"], 1], 1.4, 1], "line-opacity": ["+", 0.4, ["*", 0.6, ["get", "active"]]] } });
  map.addLayer({ id: "blk-pulse", type: "line", source: "blk-ring", paint: { "line-color": C.red, "line-width": 1, "line-opacity": 0.4 } });
  map.addSource("blk-core", { type: "geojson", data: empty });
  map.addLayer({ id: "blk-core", type: "circle", source: "blk-core",
    paint: {
      "circle-radius": ["case", ["==", ["get", "sel"], 1], 4.5, 3.5],
      "circle-color": C.red,
      "circle-opacity": ["+", 0.4, ["*", 0.6, ["get", "active"]]],
      "circle-stroke-color": ["case", ["==", ["get", "sel"], 1], C.ink, C.bg],
      "circle-stroke-width": 1.2,
    } });
  map.addLayer({ id: "blk-handle", type: "circle", source: "blk-handle",
    paint: { "circle-radius": 5, "circle-color": C.bg, "circle-stroke-color": C.ink, "circle-stroke-width": 1.5 } });
}

// ------------------------------------------------------------------ hover card
function HoverCard({ hover, engine, result, width, height }: {
  hover: NonNullable<Hover>; engine: ImpactEngine; result: ScenarioResult | null; width: number; height: number;
}) {
  const style = {
    left: hover.x + 254 > width ? hover.x - 254 : hover.x + 14,
    top: hover.y + 170 > height ? Math.max(8, hover.y - 160) : hover.y + 14,
  };
  const labels = engine.data.flows.commodities;
  let body: React.ReactNode = null;
  if (hover.kind === "country") {
    const c = result?.countries.find((x) => x.iso3 === hover.iso3);
    const meta = engine.data.countries.find((x) => x.iso3 === hover.iso3);
    body = !meta ? (
      <><div className="text-ink">{hover.name}</div><div className="text-mute">Not in the modelled set of 49 economies.</div></>
    ) : (
      <>
        <div className="mb-1 flex items-baseline justify-between gap-4"><span className="text-ink">{meta.name}</span><span className="num text-[10px] text-faint">{meta.iso3}</span></div>
        <Row k="Trade exposed" v={fmtUsd(c?.totalUsd ?? 0)} />
        <Row k="Share of GDP" v={fmtPct(c?.pctGdp ?? 0, 2)} />
        <Row k="Stranded" v={fmtUsd(c?.strandedUsd ?? 0)} />
        <Row k="Top cargo hit" v={c && c.totalUsd > 0 ? labels[c.topCommodity].label : "—"} text />
      </>
    );
  } else if (hover.kind === "lane") {
    const e = hover.edge;
    const E = engine.data.network.edges[e];
    const nodes = engine.data.network.nodes;
    const name = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
    const ks = Array.from({ length: N_COMMODITIES }, (_, k) => ({ k, v: engine.edgeBaseK[e * N_COMMODITIES + k] }))
      .sort((a, b) => b.v - a.v).slice(0, 3);
    const a = result?.active;
    body = (
      <>
        <div className="mb-1 text-ink">{name(E.a)} – {name(E.b)}</div>
        <Row k="Baseline trade" v={`${fmtUsd(engine.edgeBase[e] * 1e6)}/yr`} />
        {ks.filter((x) => x.v > 0).map((x) => <Row key={x.k} k={labels[x.k].label} v={fmtUsd(x.v * 1e6)} />)}
        <Row k="Length" v={`${Math.round(E.nm).toLocaleString()} nm`} />
        {a && a.any && a.edgeCap[e] < 0.999 && <Row k="Capacity left" v={fmtPct(a.edgeCap[e] * 100, 0)} tone="text-red" />}
        {a && a.any && a.edgeAdded[e] > 1 && <Row k="Diverted onto lane" v={`${fmtUsd(a.edgeAdded[e] * 1e6)}/yr`} tone="text-amber" />}
      </>
    );
  } else if (hover.kind === "chokepoint") {
    const cp = engine.data.chokepoints[hover.idx];
    const s = result?.chokepoints[hover.idx];
    body = (
      <>
        <div className="mb-1 text-ink">{cp.name}</div>
        <Row k="Normal transits" v={`${cp.shipsPerDay} ships/day`} />
        <Row k="Modelled now" v={`${Math.round(s?.shipsNew ?? cp.shipsPerDay)} ships/day`} tone={s && s.shipsPct < -1 ? "text-red" : s && s.shipsPct > 1 ? "text-green" : undefined} />
        <Row k="Trade value / yr" v={fmtUsd(engine.chokepointBase[hover.idx] * 1e6)} />
        <div className="mt-1 text-[11px] text-faint">Transit baseline is SEED until PortWatch is loaded. Click to block.</div>
      </>
    );
  } else if (hover.kind === "blockage") {
    const s = useStore.getState();
    const i = s.blockages.findIndex((b) => b.id === hover.id);
    const b = s.blockages[i];
    if (!b) return null;
    body = (
      <>
        <div className="mb-1 text-ink">Blockage B{i + 1}</div>
        <Row k="Severity" v={fmtPct(b.severity * 100, 0)} />
        <Row k="Duration" v={`${b.durationDays} days`} />
        <Row k="Radius" v={`${Math.round(b.radiusKm)} km`} />
        <div className="mt-1 text-[11px] text-faint">Drag to move · drag the handle to resize</div>
      </>
    );
  }
  return (
    <div style={style} className="pointer-events-none absolute z-20 w-[240px] rounded-sm border border-line-2 bg-panel/95 px-2.5 py-2 text-[12px]">
      {body}
    </div>
  );
}

function Row({ k, v, tone, text }: { k: string; v: string; tone?: string; text?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 leading-[18px]">
      <span className="shrink-0 text-mute">{k}</span>
      <span className={`${text ? "truncate text-right" : "num"} ${tone ?? "text-ink"}`}>{v}</span>
    </div>
  );
}

function Legend({ offline }: { offline: boolean }) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 w-[208px] rounded-sm border border-line bg-panel px-2.5 py-2 text-[11px]">
      <div className="space-y-[3px]">
        <LegendLine color={C.cyan} label="Sea lane · width = trade" />
        <LegendLine color={C.red} label="Blocked lane" />
        <LegendLine color={C.amber} label="Rerouted traffic" />
        <LegendLine color={C.strand} label="Stranded (no route)" dashed />
      </div>
      <div className="mt-2">
        <div className="mb-1 text-mute">Exposure, % of GDP</div>
        <div className="h-[6px] rounded-[1px]" style={{ background: "linear-gradient(to right, rgba(239,90,95,0.04), rgba(239,90,95,0.34) 50%, rgba(239,90,95,0.62))" }} />
        <div className="num mt-[2px] flex justify-between text-[10px] text-faint"><span>0</span><span>0.6</span><span>1.5+</span></div>
      </div>
      <div className="mt-2 border-t border-line pt-1.5 text-[10px] leading-snug text-faint">
        Hypothetical scenarios. Impacts are modelled, not observed events.
        {offline && <span className="mt-1 block text-mute">Basemap offline: showing bundled coastlines.</span>}
      </div>
    </div>
  );
}

function LegendLine({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="22" height="6" aria-hidden><line x1="0" y1="3" x2="22" y2="3" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "3 3" : undefined} /></svg>
      <span className="text-mute">{label}</span>
    </div>
  );
}
