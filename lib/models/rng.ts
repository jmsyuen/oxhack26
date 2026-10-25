/** Small seeded PRNG (mulberry32) + normal draws, so every result is reproducible for the same inputs. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function normals(rand: () => number, n: number): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 2) {
    const u = Math.max(1e-12, rand()), v = rand();
    const r = Math.sqrt(-2 * Math.log(u));
    out[i] = r * Math.cos(2 * Math.PI * v);
    if (i + 1 < n) out[i + 1] = r * Math.sin(2 * Math.PI * v);
  }
  return out;
}

/** Lognormal closure durations with the given mean and coefficient of variation. */
export function lognormalDurations(seed: number, n: number, mean: number, cv: number): Float64Array {
  const s2 = Math.log(1 + cv * cv);
  const mu = Math.log(Math.max(mean, 1e-6)) - s2 / 2;
  const z = normals(mulberry32(seed), n);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.exp(mu + Math.sqrt(s2) * z[i]);
  return out;
}
