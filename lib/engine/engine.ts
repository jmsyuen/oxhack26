import { ASSUMPTIONS, NM_PER_DAY } from "./assumptions";
import { bboxOf, circleMayHitBbox, distancePointToPolylineKm, type Bbox } from "./geo";
import type { Blockage, CommodityRate, CpRoute, EngineData, LonLat, RateResult, Trace } from "./types";

const EPS = 1e-9;
export const N_COMMODITIES = 8;
/** Country vector layout in RateResult.country */
export const CV = { EXP: 0, IMP: 1, EXP_STRANDED: 2, IMP_STRANDED: 3, COST: 4, STRIDE: 5 } as const;

interface Path {
  edges: Int32Array; // in travel order
  nodes: Int32Array; // in travel order, length edges+1
  nm: number;
  cost: number;
  chokepoints: Int32Array; // chokepoint indices (into data.chokepoints) on this path
}

interface SubFlow {
  exp: number;
  imp: number;
  k: number;
  v: number; // annual MUSD
  bypassExp: number; // index into bypass list or -1
  bypassImp: number;
}

interface PairGroup {
  p: number;
  q: number;
  path: Path;
  subs: SubFlow[];
  /** PortWatch ships per modelled ship-equivalent, averaged over this path's chokepoints */
  kappa: number;
}

interface BypassDef {
  frm: number;
  to: number;
  cap: Float64Array; // per commodity
}

class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    const k = this.k, v = this.v;
    k.push(key); v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const k = this.k, v = this.v;
    const top: [number, number] = [k[0], v[0]];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

interface Segment {
  edges: Int32Array;
  nodes: Int32Array;
  key: number;
}

/** Part of `alt` that differs from `base` (shared prefix/suffix trimmed, junction nodes kept). */
function divergent(base: Path, alt: Path, nNodes: number): Segment {
  const b = base.nodes, a = alt.nodes;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const n0 = Math.max(0, i - 1);
  const n1 = Math.min(a.length - 1, a.length - 1 - Math.max(0, j - 1));
  const nodes = a.slice(n0, n1 + 1);
  const edges = alt.edges.slice(n0, Math.max(n0, n1));
  return { nodes, edges, key: nodes[0] * nNodes + nodes[nodes.length - 1] + edges.length * nNodes * nNodes };
}

export class ImpactEngine {
  readonly data: EngineData;
  readonly nodeIdx = new Map<string, number>();
  readonly nNodes: number;
  readonly nEdges: number;
  readonly nCountries: number;
  readonly edgeA: Int32Array;
  readonly edgeB: Int32Array;
  readonly edgeNm: Float64Array;
  readonly edgeCost: Float64Array;
  readonly edgeBbox: Bbox[];
  readonly adj: { e: number; o: number }[][];
  readonly chokepointOfNode: Int32Array;
  readonly costShare: Float64Array;
  /** baseline annual MUSD per edge, per edge × commodity, and net direction (+ = a→b) */
  readonly edgeBase: Float64Array;
  readonly edgeBaseK: Float64Array;
  readonly edgeDir: Float64Array;
  readonly chokepointBase: Float64Array;
  readonly chokepointShipsBase: Float64Array;
  readonly shipWeight: Float64Array;
  /** PortWatch ships/day per modelled laden ship-equivalent/day, calibrated across all chokepoints */
  shipCalibration = 1;
  chokepointKappa: Float64Array = new Float64Array(0);
  readonly totalByCommodity: Float64Array;
  readonly countryBaseTrade: Float64Array;
  private groups: PairGroup[] = [];
  private bypasses: BypassDef[] = [];

  constructor(data: EngineData) {
    this.data = data;
    const { nodes, edges } = data.network;
    nodes.forEach((n, i) => this.nodeIdx.set(n.id, i));
    this.nNodes = nodes.length;
    this.nEdges = edges.length;
    this.nCountries = data.flows.countries.length;
    this.edgeA = new Int32Array(this.nEdges);
    this.edgeB = new Int32Array(this.nEdges);
    this.edgeNm = new Float64Array(this.nEdges);
    this.edgeCost = new Float64Array(this.nEdges);
    this.edgeBbox = [];
    this.adj = nodes.map(() => []);
    const canal = new Set(["CP_SUEZ", "CP_PANAMA"]);
    edges.forEach((e, i) => {
      const a = this.nodeIdx.get(e.a)!, b = this.nodeIdx.get(e.b)!;
      this.edgeA[i] = a;
      this.edgeB[i] = b;
      this.edgeNm[i] = e.nm;
      this.edgeCost[i] = e.nm + (canal.has(e.a) || canal.has(e.b) ? ASSUMPTIONS.canalPenaltyNm / 2 : 0);
      this.edgeBbox.push(bboxOf(e.coords));
      this.adj[a].push({ e: i, o: b });
      this.adj[b].push({ e: i, o: a });
    });
    this.chokepointOfNode = new Int32Array(this.nNodes).fill(-1);
    data.chokepoints.forEach((c, i) => {
      const n = this.nodeIdx.get(c.node);
      if (n !== undefined) this.chokepointOfNode[n] = i;
    });
    this.costShare = Float64Array.from(data.flows.commodities.map((c) => c.costPerDayShare));
    this.shipWeight = Float64Array.from(data.flows.commodities.map((c) => 1 / c.cargoMusdPerShip));
    this.chokepointShipsBase = new Float64Array(data.chokepoints.length);
    this.edgeBase = new Float64Array(this.nEdges);
    this.edgeBaseK = new Float64Array(this.nEdges * N_COMMODITIES);
    this.edgeDir = new Float64Array(this.nEdges);
    this.chokepointBase = new Float64Array(data.chokepoints.length);
    this.totalByCommodity = new Float64Array(N_COMMODITIES);
    this.countryBaseTrade = new Float64Array(this.nCountries);
    this.buildBaseline();
  }

  // ---------------------------------------------------------------- routing
  private dijkstra(src: number, allowed: Uint8Array | null): { dist: Float64Array; prevE: Int32Array } {
    const dist = new Float64Array(this.nNodes).fill(Infinity);
    const prevE = new Int32Array(this.nNodes).fill(-1);
    const done = new Uint8Array(this.nNodes);
    const h = new MinHeap();
    dist[src] = 0;
    h.push(0, src);
    while (h.size) {
      const [d, u] = h.pop();
      if (done[u]) continue;
      done[u] = 1;
      for (const { e, o } of this.adj[u]) {
        if (allowed && !allowed[e]) continue;
        const nd = d + this.edgeCost[e];
        if (nd < dist[o]) {
          dist[o] = nd;
          prevE[o] = e;
          h.push(nd, o);
        }
      }
    }
    return { dist, prevE };
  }

  private extractPath(src: number, dst: number, tree: { dist: Float64Array; prevE: Int32Array }): Path | null {
    if (!isFinite(tree.dist[dst])) return null;
    const es: number[] = [];
    const ns: number[] = [dst];
    let cur = dst;
    let nm = 0;
    while (cur !== src) {
      const e = tree.prevE[cur];
      if (e < 0) return null;
      es.push(e);
      nm += this.edgeNm[e];
      cur = this.edgeA[e] === cur ? this.edgeB[e] : this.edgeA[e];
      ns.push(cur);
    }
    es.reverse();
    ns.reverse();
    const cps: number[] = [];
    for (const n of ns) if (this.chokepointOfNode[n] >= 0) cps.push(this.chokepointOfNode[n]);
    return { edges: Int32Array.from(es), nodes: Int32Array.from(ns), nm, cost: tree.dist[dst], chokepoints: Int32Array.from(cps) };
  }

  // ---------------------------------------------------------------- baseline
  private portWeights(ci: number, k: number): [number, number][] {
    const c = this.data.countries[ci];
    let w: Record<string, number> = c.ports;
    if (this.data.flows.energy.includes(k) && c.eports) w = c.eports;
    else if (this.data.flows.bulk.includes(k) && c.bports) w = c.bports;
    const out: [number, number][] = [];
    let tot = 0;
    for (const [id, x] of Object.entries(w)) tot += x;
    for (const [id, x] of Object.entries(w)) out.push([this.nodeIdx.get(id)!, x / tot]);
    return out;
  }

  private buildBaseline() {
    const { flows, countries } = this.data;
    const cidx = new Map(countries.map((c, i) => [c.iso3, i]));
    const order = flows.countries.map((iso) => cidx.get(iso)!);
    if (order.some((x) => x === undefined)) throw new Error("countries.json and flows.json disagree");

    // bypass definitions: per country, keyed by from-node
    const bypassByCountryNode = new Map<string, number>();
    countries.forEach((c, ci) => {
      for (const b of c.bypass ?? []) {
        const cap = new Float64Array(N_COMMODITIES);
        flows.commodities.forEach((cm, k) => (cap[k] = b.cap[cm.id] ?? b.cap["*"] ?? 0));
        bypassByCountryNode.set(`${ci}:${b.frm}`, this.bypasses.length);
        this.bypasses.push({ frm: this.nodeIdx.get(b.frm)!, to: this.nodeIdx.get(b.to)!, cap });
      }
    });

    const groupMap = new Map<number, PairGroup>();
    const trees = new Map<number, { dist: Float64Array; prevE: Int32Array }>();
    const tree = (p: number) => {
      let t = trees.get(p);
      if (!t) { t = this.dijkstra(p, null); trees.set(p, t); }
      return t;
    };

    for (const [ei, ii, k, v] of flows.flows) {
      const exp = order[ei], imp = order[ii];
      this.totalByCommodity[k] += v;
      this.countryBaseTrade[ei] += v;
      this.countryBaseTrade[ii] += v;
      for (const [p, wp] of this.portWeights(exp, k)) {
        for (const [q, wq] of this.portWeights(imp, k)) {
          if (p === q) continue;
          const key = p * this.nNodes + q;
          let g = groupMap.get(key);
          if (!g) {
            const path = this.extractPath(p, q, tree(p));
            if (!path) continue;
            g = { p, q, path, subs: [], kappa: 1 };
            groupMap.set(key, g);
          }
          const pid = this.data.network.nodes[p].id, qid = this.data.network.nodes[q].id;
          g.subs.push({
            exp: ei, imp: ii, k, v: v * wp * wq,
            bypassExp: bypassByCountryNode.get(`${exp}:${pid}`) ?? -1,
            bypassImp: bypassByCountryNode.get(`${imp}:${qid}`) ?? -1,
          });
        }
      }
    }
    this.groups = [...groupMap.values()];

    for (const g of this.groups) {
      let tot = 0;
      const byK = new Float64Array(N_COMMODITIES);
      for (const s of g.subs) { tot += s.v; byK[s.k] += s.v; }
      const { edges, nodes } = g.path;
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        this.edgeBase[e] += tot;
        for (let k = 0; k < N_COMMODITIES; k++) this.edgeBaseK[e * N_COMMODITIES + k] += byK[k];
        this.edgeDir[e] += this.edgeA[e] === nodes[i] ? tot : -tot;
      }
      let ships = 0;
      for (let k = 0; k < N_COMMODITIES; k++) ships += byK[k] * this.shipWeight[k];
      for (const c of g.path.chokepoints) {
        this.chokepointBase[c] += tot;
        this.chokepointShipsBase[c] += ships;
      }
    }
    let pw = 0, model = 0;
    this.data.chokepoints.forEach((c, i) => { pw += c.shipsPerDay; model += this.chokepointShipsBase[i] / 365; });
    this.shipCalibration = model > 0 ? pw / model : 1;
    this.chokepointKappa = Float64Array.from(this.data.chokepoints.map((c, i) =>
      this.chokepointShipsBase[i] > 0 ? c.shipsPerDay / (this.chokepointShipsBase[i] / 365) : this.shipCalibration));
    for (const g of this.groups) {
      const cps = g.path.chokepoints;
      g.kappa = cps.length ? Math.min(...Array.from(cps, (c) => this.chokepointKappa[c])) : this.shipCalibration;
    }
  }

  /** Which lanes does each blockage touch, and the combined remaining capacity per lane. */
  edgeCapacity(blockages: Blockage[]): Float64Array {
    const cap = new Float64Array(this.nEdges).fill(1);
    const coords = this.data.network.edges;
    for (const b of blockages) {
      if (b.severity <= 0 || b.radiusKm <= 0) continue;
      const c: LonLat = [b.lon, b.lat];
      for (let e = 0; e < this.nEdges; e++) {
        if (!circleMayHitBbox(c, b.radiusKm, this.edgeBbox[e])) continue;
        if (distancePointToPolylineKm(c, coords[e].coords) <= b.radiusKm) cap[e] *= 1 - Math.min(1, b.severity);
      }
    }
    return cap;
  }

  /** Number of sea lanes a single blockage touches (for the inspector). */
  lanesTouched(b: Blockage): number {
    const cap = this.edgeCapacity([{ ...b, severity: Math.max(b.severity, 0.5) }]);
    let n = 0;
    for (let e = 0; e < this.nEdges; e++) if (cap[e] < 1 - EPS) n++;
    return n;
  }

  private pathCoords(path: { edges: Int32Array; nodes: Int32Array }): LonLat[] {
    const out: LonLat[] = [];
    const E = this.data.network.edges;
    for (let i = 0; i < path.edges.length; i++) {
      const e = path.edges[i];
      const forward = this.edgeA[e] === path.nodes[i];
      const cs = forward ? E[e].coords : [...E[e].coords].reverse();
      const start = out.length ? 1 : 0;
      let prevLon = out.length ? out[out.length - 1][0] : cs[0][0];
      for (let j = start; j < cs.length; j++) {
        let lon = cs[j][0];
        while (lon - prevLon > 180) lon -= 360;
        while (lon - prevLon < -180) lon += 360;
        out.push([lon, cs[j][1]]);
        prevLon = lon;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- vessel-level routes (decision engine)
  /**
   * The busiest port-to-port routes through chokepoint `cpIdx`, with the alternative that avoids every lane the
   * blockages touch. Used by lib/models/fleet.ts to place synthetic vessels and price a reroute.
   * Distances are along the network; `divergeNm` is how far before the chokepoint the alternative splits off.
   */
  routesThrough(cpIdx: number, blockages: Blockage[], k = 14): CpRoute[] {
    const cpNode = this.data.chokepoints[cpIdx] ? this.nodeIdx.get(this.data.chokepoints[cpIdx].node) : undefined;
    if (cpNode === undefined) return [];
    const cap = this.edgeCapacity(blockages);
    const allowed = new Uint8Array(this.nEdges);
    for (let e = 0; e < this.nEdges; e++) allowed[e] = cap[e] >= 1 - EPS ? 1 : 0;
    const cand = this.groups
      .filter((g) => Array.prototype.includes.call(g.path.chokepoints, cpIdx))
      .map((g) => {
        const ships = new Float64Array(N_COMMODITIES);
        for (const s of g.subs) ships[s.k] += s.v * this.shipWeight[s.k];
        let tot = 0;
        for (let i = 0; i < N_COMMODITIES; i++) tot += ships[i];
        return { g, ships, tot };
      })
      .sort((a, b) => b.tot - a.tot)
      .slice(0, k);
    const nodes = this.data.network.nodes;
    /** nm to `q` from every node along the cost-optimal tree that avoids blocked lanes (one Dijkstra per destination) */
    const toDest = new Map<number, Float64Array>();
    const nmTo = (q: number) => {
      let out = toDest.get(q);
      if (out) return out;
      const t = this.dijkstra(q, allowed);
      out = new Float64Array(this.nNodes).fill(Infinity);
      out[q] = 0;
      const order = Array.from({ length: this.nNodes }, (_, i) => i).filter((i) => isFinite(t.dist[i])).sort((a, b) => t.dist[a] - t.dist[b]);
      for (const n of order) {
        if (n === q) continue;
        const e = t.prevE[n];
        const parent = this.edgeA[e] === n ? this.edgeB[e] : this.edgeA[e];
        out[n] = out[parent] + this.edgeNm[e];
      }
      toDest.set(q, out);
      return out;
    };
    return cand.map(({ g, ships, tot }) => {
      const base = g.path;
      const cum: number[] = [0];
      for (const e of base.edges) cum.push(cum[cum.length - 1] + this.edgeNm[e]);
      const cpPos = Array.prototype.indexOf.call(base.nodes, cpNode) as number;
      const nmToCp = cum[cpPos];
      let blockedOnPath = false;
      for (const e of base.edges) if (!allowed[e]) blockedOnPath = true;
      const nodeCum = cum.slice(0, cpPos + 1);
      let altFrom: number[] = nodeCum.map((c) => base.nm - c);
      let altNm: number | null = base.nm, divergeNm = 0, altCoords: LonLat[] = [];
      if (blockedOnPath) {
        const d = nmTo(g.q);
        altFrom = nodeCum.map((_, j) => d[base.nodes[j]]);
        if (!isFinite(altFrom[0])) altNm = null;
        else {
          altNm = altFrom[0];
          const t = this.dijkstra(g.p, allowed);
          const alt = this.extractPath(g.p, g.q, t);
          if (alt) {
            let i = 0;
            while (i < alt.nodes.length && i < base.nodes.length && alt.nodes[i] === base.nodes[i]) i++;
            divergeNm = Math.max(0, nmToCp - cum[Math.min(Math.max(0, i - 1), cpPos)]);
            const seg = divergent(base, alt, this.nNodes);
            altCoords = this.pathCoords({ edges: seg.edges, nodes: seg.nodes });
          }
        }
      }
      const coords = this.pathCoords(base);
      return {
        key: `${g.p}-${g.q}`,
        from: nodes[g.p].name, to: nodes[g.q].name,
        shipsPerYear: tot * this.chokepointKappa[cpIdx],
        shipsByCommodity: Array.from(ships, (x) => x * this.chokepointKappa[cpIdx]),
        baseNm: base.nm, nmToCp, altNm, divergeNm, nodeCum, altFrom,
        coords, cumNm: this.coordCumNm(coords),
        altCoords,
      };
    });
  }

  /** Cumulative great-circle nm along a coordinate list (for placing vessels at a distance along a route). */
  private coordCumNm(cs: LonLat[]): number[] {
    const out = [0];
    for (let i = 1; i < cs.length; i++) {
      const [lo1, la1] = cs[i - 1], [lo2, la2] = cs[i];
      const r = Math.PI / 180;
      const d = 2 * Math.asin(Math.sqrt(Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2));
      out.push(out[i - 1] + d * 3440.065);
    }
    return out;
  }

  // ---------------------------------------------------------------- run
  run(blockages: Blockage[]): RateResult {
    const nC = this.nCountries;
    const res: RateResult = {
      any: false, affected: 0, disrupted: 0, rerouted: 0, stranded: 0, congested: 0, valueDays: 0, extraCost: 0,
      byCommodity: Array.from({ length: N_COMMODITIES }, (): CommodityRate => ({
        disrupted: 0, rerouted: 0, stranded: 0, congested: 0, extraCost: 0, valueDays: 0,
      })),
      country: new Float64Array(nC * CV.STRIDE),
      countryCommodity: new Float64Array(nC * N_COMMODITIES),
      edgeCap: this.edgeCapacity(blockages),
      edgeRemoved: new Float64Array(this.nEdges),
      edgeAdded: new Float64Array(this.nEdges),
      edgeStranded: new Float64Array(this.nEdges),
      chokepointNew: Float64Array.from(this.chokepointBase),
      chokepointShipsNew: new Float64Array(this.chokepointShipsBase.length),
      traces: [],
      supplyShare: { oil: 0, gas: 0, food: 0 },
    };
    const cap = res.edgeCap;
    const allowed = new Uint8Array(this.nEdges);
    let anyAffected = false;
    for (let e = 0; e < this.nEdges; e++) {
      if (cap[e] < 1 - EPS) anyAffected = true;
      else allowed[e] = 1;
    }
    if (!anyAffected) return res;
    res.any = true;

    const altTrees = new Map<number, { dist: Float64Array; prevE: Int32Array }>();
    const altTree = (p: number) => {
      let t = altTrees.get(p);
      if (!t) { t = this.dijkstra(p, allowed); altTrees.set(p, t); }
      return t;
    };
    const altPathCache = new Map<number, Path | null>();
    const altPath = (p: number, q: number): Path | null => {
      const key = p * this.nNodes + q;
      if (altPathCache.has(key)) return altPathCache.get(key)!;
      const path = this.extractPath(p, q, altTree(p));
      altPathCache.set(key, path);
      return path;
    };
    const traceAcc = new Map<number, { seg: Segment; value: number; valueDays: number }>();
    const edgeSets = new WeakMap<Path, Set<number>>();
    const setOf = (p: Path) => {
      let x = edgeSets.get(p);
      if (!x) { x = new Set(p.edges); edgeSets.set(p, x); }
      return x;
    };
    const cpSetOf = (p: Path) => new Set(p.chokepoints);
    const congDays = ASSUMPTIONS.congestionDaysAtFull;

    type Opt = { path: Path; capShare: number };
    type OptAcc = { vol: number; ships: number; valueDays: number };
    for (const g of this.groups) {
      const { path } = g;
      let cP = 1;
      for (const e of path.edges) if (cap[e] < cP) cP = cap[e];
      if (cP >= 1 - EPS) continue;
      const moveShare = 1 - cP; // must leave the original path
      const delay = cP > EPS ? congDays * (1 - cP) : 0;
      const normal = altPath(g.p, g.q);
      // ships that divert are the ships that used the blocked chokepoint(s) on this route
      let kSum = 0, kN = 0;
      for (let i = 0; i < path.edges.length; i++) {
        if (cap[path.edges[i]] >= 1 - EPS) continue;
        for (const n of [path.nodes[i], path.nodes[i + 1]]) {
          const c = this.chokepointOfNode[n];
          if (c >= 0) { kSum += this.chokepointKappa[c]; kN++; }
        }
      }
      const kappa = kN ? kSum / kN : g.kappa;
      const accs = new Map<Path, OptAcc>();
      let strandedTot = 0, strandedShips = 0;
      const baseOpts: Opt[] = normal ? [{ path: normal, capShare: 1 }] : [];

      for (const s of g.subs) {
        let opts = baseOpts;
        if (s.bypassExp >= 0 || s.bypassImp >= 0) {
          opts = [...baseOpts];
          if (s.bypassExp >= 0) {
            const b = this.bypasses[s.bypassExp];
            const bp = b.cap[s.k] > 0 ? altPath(b.to, g.q) : null;
            if (bp) opts.push({ path: bp, capShare: b.cap[s.k] });
          }
          if (s.bypassImp >= 0) {
            const b = this.bypasses[s.bypassImp];
            const bp = b.cap[s.k] > 0 ? altPath(g.p, b.to) : null;
            if (bp) opts.push({ path: bp, capShare: b.cap[s.k] });
          }
          opts.sort((a, b) => a.path.cost - b.path.cost);
        }
        let remaining = moveShare;
        let rerouted = 0;
        let valueDays = 0;
        const w = this.shipWeight[s.k];
        for (const o of opts) {
          if (remaining <= EPS) break;
          const take = Math.min(remaining, o.capShare * moveShare);
          if (take <= EPS) continue;
          remaining -= take;
          const vol = s.v * take;
          const vd = vol * (Math.max(0, o.path.nm - path.nm) / NM_PER_DAY);
          rerouted += vol;
          valueDays += vd;
          const a = accs.get(o.path);
          if (a) { a.vol += vol; a.ships += vol * w; a.valueDays += vd; }
          else accs.set(o.path, { vol, ships: vol * w, valueDays: vd });
        }
        const stranded = s.v * Math.max(0, remaining);
        strandedTot += stranded;
        strandedShips += stranded * w;
        const congested = s.v * cP;
        valueDays += congested * delay;
        const extraCost = valueDays * this.costShare[s.k];
        const moved = s.v * moveShare;

        res.affected += s.v;
        res.disrupted += moved;
        res.rerouted += rerouted;
        res.stranded += stranded;
        res.congested += congested;
        res.valueDays += valueDays;
        res.extraCost += extraCost;
        const bc = res.byCommodity[s.k];
        bc.disrupted += moved; bc.rerouted += rerouted; bc.stranded += stranded;
        bc.congested += congested; bc.extraCost += extraCost; bc.valueDays += valueDays;
        const ce = s.exp * CV.STRIDE, ci = s.imp * CV.STRIDE;
        res.country[ce + CV.EXP] += moved;
        res.country[ci + CV.IMP] += moved;
        res.country[ce + CV.EXP_STRANDED] += stranded;
        res.country[ci + CV.IMP_STRANDED] += stranded;
        // extra cost is split evenly between the trading partners
        res.country[ce + CV.COST] += extraCost / 2;
        res.country[ci + CV.COST] += extraCost / 2;
        res.countryCommodity[s.exp * N_COMMODITIES + s.k] += moved;
        res.countryCommodity[s.imp * N_COMMODITIES + s.k] += moved;
      }

      // lanes and chokepoints change only where the new route differs from the old one
      const baseEdges = setOf(path);
      const baseCps = cpSetOf(path);
      for (const [alt, a] of accs) {
        const altEdges = setOf(alt);
        for (const e of alt.edges) if (!baseEdges.has(e)) res.edgeAdded[e] += a.vol;
        for (const e of path.edges) if (!altEdges.has(e)) res.edgeRemoved[e] += a.vol;
        const altCps = cpSetOf(alt);
        for (const c of alt.chokepoints) {
          if (baseCps.has(c)) continue;
          res.chokepointNew[c] += a.vol;
          res.chokepointShipsNew[c] += a.ships * kappa;
        }
        for (const c of path.chokepoints) {
          if (altCps.has(c)) continue;
          res.chokepointNew[c] -= a.vol;
          res.chokepointShipsNew[c] -= a.ships * this.chokepointKappa[c];
        }
        const seg = divergent(path, alt, this.nNodes);
        if (seg.edges.length) {
          const t = traceAcc.get(seg.key);
          if (t) { t.value += a.vol; t.valueDays += a.valueDays; }
          else traceAcc.set(seg.key, { seg, value: a.vol, valueDays: a.valueDays });
        }
      }
      if (strandedTot > 0) {
        for (const e of path.edges) {
          res.edgeRemoved[e] += strandedTot;
          res.edgeStranded[e] += strandedTot;
        }
        for (const c of path.chokepoints) {
          res.chokepointNew[c] -= strandedTot;
          res.chokepointShipsNew[c] -= strandedShips * this.chokepointKappa[c];
        }
      }
    }

    const top = [...traceAcc.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 12);
    res.traces = top.map(([k, t]): Trace => ({
      key: String(k), value: t.value, extraDays: t.value > 0 ? t.valueDays / t.value : 0,
      coords: this.pathCoords({ edges: t.seg.edges, nodes: t.seg.nodes }),
    }));

    const A = ASSUMPTIONS;
    const lost = (k: number) => {
      const c = res.byCommodity[k];
      return c.stranded + A.reroutedSupplyWeight * c.rerouted + A.congestedSupplyWeight * c.congested;
    };
    const tot = this.totalByCommodity;
    res.supplyShare = {
      oil: (lost(0) + lost(2)) / Math.max(EPS, tot[0] + tot[2]),
      gas: lost(1) / Math.max(EPS, tot[1]),
      food: lost(3) / Math.max(EPS, tot[3]),
    };
    return res;
  }
}
