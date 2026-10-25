export function fmtUsd(v: number, opts: { sign?: boolean; digits?: number } = {}): string {
  const s = opts.sign && v > 0 ? "+" : v < 0 ? "−" : "";
  const a = Math.abs(v);
  const d = opts.digits;
  if (a >= 1e12) return `${s}$${(a / 1e12).toFixed(d ?? 2)}tn`;
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(d ?? (a >= 1e11 ? 0 : 1))}bn`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(d ?? 0)}m`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}k`;
  return `${s}$${a.toFixed(0)}`;
}

export function fmtPct(v: number, digits = 1, sign = false): string {
  const s = sign && v > 0 ? "+" : v < 0 ? "−" : "";
  return `${s}${Math.abs(v).toFixed(digits)}%`;
}

export function fmtDays(v: number, sign = false): string {
  const s = sign && v > 0 ? "+" : v < 0 ? "−" : "";
  return `${s}${Math.abs(v).toFixed(1)} d`;
}

export function fmtCoord(lon: number, lat: number): string {
  const L = ((((lon + 180) % 360) + 360) % 360) - 180;
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"} ${Math.abs(L).toFixed(2)}°${L >= 0 ? "E" : "W"}`;
}

/** Spoken form, e.g. "246 billion dollars". */
export function sayUsd(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e12) return `${(a / 1e12).toFixed(1)} trillion dollars`;
  if (a >= 1e9) return `${(a / 1e9).toFixed(a >= 1e11 ? 0 : 1)} billion dollars`;
  if (a >= 1e6) return `${(a / 1e6).toFixed(0)} million dollars`;
  return `${a.toFixed(0)} dollars`;
}

/** Money with enough precision for per-vessel figures ($1.05m, $12.3m, $658m). */
export function fmtMoney(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6 && a < 1e7) return fmtUsd(v, { digits: 2 });
  if (a >= 1e7 && a < 1e8) return fmtUsd(v, { digits: 1 });
  return fmtUsd(v);
}
