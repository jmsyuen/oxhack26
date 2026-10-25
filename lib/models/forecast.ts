import { mulberry32, normals } from "./rng";
import type { ForecastModelFile, ModelData, TrafficSeries } from "./types";

/**
 * In-browser inference for the XGBoost forecaster trained in data-prep/train_forecast.py.
 * features() mirrors data-prep/forecast_features.py exactly; scripts/sanity.ts checks parity with XGBoost.
 * Comparisons use float32 features against float32 thresholds, as XGBoost does.
 */

export const MIN_ORIGIN = 90;
const DAY_MS = 86_400_000;

export function dateOf(start: string, idx: number): Date {
  return new Date(Date.parse(`${start}T00:00:00Z`) + idx * DAY_MS);
}
export function isoOf(start: string, idx: number): string {
  return dateOf(start, idx).toISOString().slice(0, 10);
}
export function indexOf(start: string, iso: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS);
}

function mean(a: number[], from: number, to: number) {
  let s = 0;
  for (let i = from; i <= to; i++) s += a[i];
  return s / (to - from + 1);
}

/** Feature vector for origin t (last observed day) and horizon h, in ForecastModelFile.features order. */
export function features(y: number[], start: string, t: number, h: number): { x: number[]; base: number } {
  const base = Math.max(mean(y, t - 27, t), 1);
  const m7 = mean(y, t - 6, t);
  const x: number[] = [];
  for (let l = 0; l < 14; l++) x.push(y[t - l] / base);
  x.push(y[t - 20] / base, y[t - 27] / base, y[t + h - 7] / base, y[t + h - 14] / base);
  let ss = 0, mn = Infinity;
  for (let i = t - 6; i <= t; i++) { ss += (y[i] - m7) ** 2; mn = Math.min(mn, y[i]); }
  x.push(mean(y, t - 2, t) / base, m7 / base, base / Math.max(mean(y, t - 90, t), 1), Math.sqrt(ss / 7) / base, mn / base);
  x.push((m7 - base) / Math.sqrt(base / 7));
  const dow = (dateOf(start, t + h).getUTCDay() + 6) % 7; // Monday = 0, as pandas
  x.push(dow, h);
  return { x, base };
}

export function predictRow(model: ForecastModelFile, x: number[]): number {
  const xf = x.map((v) => Math.fround(v));
  let s = model.baseScore;
  for (const t of model.trees) {
    let n = 0;
    while (t.l[n] !== -1) n = xf[t.f[n]] < t.c[n] ? t.l[n] : t.r[n];
    s += t.c[n];
  }
  return s;
}

export interface ForecastDay {
  idx: number;
  date: string;
  h: number;
  mean: number;
  lo80: number; hi80: number;
  lo95: number; hi95: number;
  /** observed value when the forecast is made in the past (time-travel backtest) */
  actual: number | null;
}

export interface Forecast {
  cpId: string;
  originIdx: number;
  originDate: string;
  level: number;
  days: ForecastDay[];
  weekMean: number;
  /** naive MA28 for comparison */
  ma28: number;
  ms: number;
}

/** Latest origin with a full 7-day target window available for backtesting, or the last observed day. */
export function lastOrigin(md: ModelData) {
  return md.traffic.days - 1;
}

export function forecast(md: ModelData, cpId: string, originIdx: number): Forecast {
  const t0 = performance.now();
  const s: TrafficSeries = md.traffic.series[cpId];
  const y = s.total;
  const t = Math.max(MIN_ORIGIN + 14, Math.min(originIdx, y.length - 1));
  const conf = md.model.conformalByChokepoint[cpId] ?? md.model.conformal;
  const days: ForecastDay[] = [];
  let base = 1;
  for (let h = 1; h <= md.model.horizon; h++) {
    const f = features(y, md.traffic.start, t, h);
    base = f.base;
    const m = Math.max(0, predictRow(md.model, f.x) * f.base);
    const sd = Math.sqrt(Math.max(m, 1));
    const q = conf[String(h)];
    days.push({
      idx: t + h, date: isoOf(md.traffic.start, t + h), h, mean: m,
      lo80: Math.max(0, m - q.q80 * sd), hi80: m + q.q80 * sd,
      lo95: Math.max(0, m - q.q95 * sd), hi95: m + q.q95 * sd,
      actual: t + h < y.length ? y[t + h] : null,
    });
  }
  return {
    cpId, originIdx: t, originDate: isoOf(md.traffic.start, t), level: base, days,
    weekMean: days.reduce((a, d) => a + d.mean, 0) / days.length, ma28: base, ms: performance.now() - t0,
  };
}

/** Rolling-origin backtest at a fixed horizon, computed in the browser (used by the model info chart). */
export function backtest(md: ModelData, cpId: string, fromIdx: number, toIdx: number, h: number) {
  const y = md.traffic.series[cpId].total;
  const conf = (md.model.conformalByChokepoint[cpId] ?? md.model.conformal)[String(h)];
  const out: { idx: number; date: string; actual: number; pred: number; lo: number; hi: number; ma28: number }[] = [];
  for (let t = Math.max(MIN_ORIGIN + 14, fromIdx - h); t + h <= Math.min(toIdx, y.length - 1); t++) {
    const f = features(y, md.traffic.start, t, h);
    const p = Math.max(0, predictRow(md.model, f.x) * f.base);
    const sd = Math.sqrt(Math.max(p, 1));
    out.push({ idx: t + h, date: isoOf(md.traffic.start, t + h), actual: y[t + h], pred: p, lo: Math.max(0, p - conf.q80 * sd), hi: p + conf.q80 * sd, ma28: f.base });
  }
  return out;
}

/** Observed 28-day vessel-type mix ending at the origin (drives the synthetic fleet's composition). */
export function typeMix(md: ModelData, cpId: string, originIdx: number) {
  const s = md.traffic.series[cpId];
  const keys = ["container", "tanker", "dry_bulk", "general_cargo", "roro"] as const;
  const sums = keys.map((k) => { let a = 0; for (let i = originIdx - 27; i <= originIdx; i++) a += s[k][i]; return a; });
  const tot = Math.max(1, sums.reduce((a, b) => a + b, 0));
  return Object.fromEntries(keys.map((k, i) => [k, sums[i] / tot])) as Record<(typeof keys)[number], number>;
}

// ---------------------------------------------------------------- Monte Carlo of the forecast

export interface ForecastPaths {
  /** n simulated 7-day paths of daily transits */
  paths: number[][];
  p10: number[]; p50: number[]; p90: number[];
  /** distribution of the 7-day total (ships arriving in the week) */
  week: { p10: number; p50: number; p90: number; mean: number };
  /** shared level-noise sd (log scale) used on top of Poisson day-to-day noise */
  sigma: number;
  n: number;
}

function poisson(rand: () => number, lam: number, z: number): number {
  if (lam <= 0) return 0;
  if (lam < 30) {
    const L = Math.exp(-lam);
    let k = 0, p = 1;
    do { k++; p *= rand(); } while (p > L);
    return k - 1;
  }
  return Math.max(0, Math.round(lam + Math.sqrt(lam) * z));
}

/**
 * Simulated weeks of traffic. Each path draws one level shock (shared across its 7 days, so a busy week stays busy)
 * and then Poisson day-to-day noise around the XGBoost mean. The level-shock size is set so the simulated day-1
 * 80% range matches the split-conformal interval validated on held-out data: with a Poisson half-width of
 * 1.2816·√λ, the extra variance is ((q80 / 1.2816)² − 1)·λ, i.e. σ² = ((q80 / 1.2816)² − 1) / λ on the log scale.
 */
export function simulateForecast(md: ModelData, fc: Forecast, n = 1000, seed = 1): ForecastPaths {
  const conf = (md.model.conformalByChokepoint[fc.cpId] ?? md.model.conformal)["1"];
  const lam1 = Math.max(1, fc.days[0].mean);
  const sigma = Math.sqrt(Math.max(0, ((conf.q80 / 1.2816) ** 2 - 1) / lam1));
  const rand = mulberry32(seed * 2654435761 + fc.originIdx);
  const shocks = normals(rand, n);
  const dz = normals(rand, n * fc.days.length);
  const paths: number[][] = [];
  const totals: number[] = [];
  for (let i = 0; i < n; i++) {
    const mult = Math.exp(sigma * shocks[i] - (sigma * sigma) / 2);
    const p = fc.days.map((d, h) => poisson(rand, d.mean * mult, dz[i * fc.days.length + h]));
    paths.push(p);
    totals.push(p.reduce((a, b) => a + b, 0));
  }
  const q = (a: number[], x: number) => { const s = [...a].sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.max(0, Math.round(x * (s.length - 1))))]; };
  const col = (h: number) => paths.map((p) => p[h]);
  return {
    paths, n, sigma,
    p10: fc.days.map((_, h) => q(col(h), 0.1)), p50: fc.days.map((_, h) => q(col(h), 0.5)), p90: fc.days.map((_, h) => q(col(h), 0.9)),
    week: { p10: q(totals, 0.1), p50: q(totals, 0.5), p90: q(totals, 0.9), mean: totals.reduce((a, b) => a + b, 0) / n },
  };
}
