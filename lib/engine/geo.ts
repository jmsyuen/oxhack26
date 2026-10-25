import type { LonLat } from "./types";

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_EQ = 111.32;

export function wrapLonDelta(d: number): number {
  let x = d;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

export function haversineKm(a: LonLat, b: LonLat): number {
  const R = 6371.0088;
  const p1 = (a[1] * Math.PI) / 180;
  const p2 = (b[1] * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = (wrapLonDelta(b[0] - a[0]) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Bbox {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

export function bboxOf(coords: LonLat[]): Bbox {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [x, y] of coords) {
    if (x < minLon) minLon = x;
    if (x > maxLon) maxLon = x;
    if (y < minLat) minLat = y;
    if (y > maxLat) maxLat = y;
  }
  return { minLon, maxLon, minLat, maxLat };
}

/** Cheap rejection test: could a circle (center, radiusKm) touch this bbox? Handles unwrapped longitudes. */
export function circleMayHitBbox(center: LonLat, radiusKm: number, b: Bbox): boolean {
  const dLat = radiusKm / KM_PER_DEG_LAT;
  if (center[1] + dLat < b.minLat || center[1] - dLat > b.maxLat) return false;
  const lat = Math.min(89, Math.abs(center[1]) + dLat);
  const dLon = radiusKm / (KM_PER_DEG_LON_EQ * Math.cos((lat * Math.PI) / 180));
  for (const shift of [0, 360, -360]) {
    const x = center[0] + shift;
    if (x + dLon >= b.minLon && x - dLon <= b.maxLon) return true;
  }
  return false;
}

/**
 * Minimum distance (km) from a point to a polyline, using a local equirectangular projection
 * centred on the point. Accurate to a few % for distances below ~1,500 km, which covers blockage radii.
 */
export function distancePointToPolylineKm(center: LonLat, coords: LonLat[]): number {
  const cosLat = Math.cos((center[1] * Math.PI) / 180);
  const px = (lon: number) => wrapLonDelta(lon - center[0]) * KM_PER_DEG_LON_EQ * cosLat;
  const py = (lat: number) => (lat - center[1]) * KM_PER_DEG_LAT;
  let best = Infinity;
  let ax = px(coords[0][0]);
  let ay = py(coords[0][1]);
  if (coords.length === 1) return Math.hypot(ax, ay);
  for (let i = 1; i < coords.length; i++) {
    const bx = px(coords[i][0]);
    const by = py(coords[i][1]);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = Math.hypot(cx, cy);
    if (d < best) best = d;
    ax = bx;
    ay = by;
  }
  return best;
}

/** Geodesic circle polygon ring (closed) for rendering. */
export function circleRing(center: LonLat, radiusKm: number, steps = 72): LonLat[] {
  const R = 6371.0088;
  const lat1 = (center[1] * Math.PI) / 180;
  const lon1 = (center[0] * Math.PI) / 180;
  const d = radiusKm / R;
  const ring: LonLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const brg = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg));
    const lon2 =
      lon1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    let lon = (lon2 * 180) / Math.PI;
    // keep ring continuous around the centre longitude
    lon = center[0] + wrapLonDelta(lon - center[0]);
    ring.push([lon, (lat2 * 180) / Math.PI]);
  }
  return ring;
}

/** Point at a bearing/distance (used for the resize handle). */
export function destination(center: LonLat, radiusKm: number, bearingDeg: number): LonLat {
  const R = 6371.0088;
  const lat1 = (center[1] * Math.PI) / 180;
  const lon1 = (center[0] * Math.PI) / 180;
  const d = radiusKm / R;
  const brg = (bearingDeg * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg));
  const lon2 =
    lon1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [center[0] + wrapLonDelta((lon2 * 180) / Math.PI - center[0]), (lat2 * 180) / Math.PI];
}
