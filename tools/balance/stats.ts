// Small statistics helpers for the balance and validation reports.

export function mean(xs: number[]): number {
  if (!xs.length) return NaN
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

export function sd(xs: number[]): number {
  if (xs.length < 2) return NaN
  const m = mean(xs)
  let s = 0
  for (const x of xs) s += (x - m) * (x - m)
  return Math.sqrt(s / (xs.length - 1))
}

// Linear interpolation between order statistics (type 7, the R and NumPy default).
export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN
  const a = [...xs].sort((x, y) => x - y)
  const h = (a.length - 1) * q
  const lo = Math.floor(h)
  const hi = Math.min(a.length - 1, lo + 1)
  return a[lo] + (h - lo) * (a[hi] - a[lo])
}

export function median(xs: number[]): number {
  return quantile(xs, 0.5)
}

export function pearson(x: number[], y: number[]): number {
  const mx = mean(x), my = mean(y)
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my)
    sxx += (x[i] - mx) * (x[i] - mx)
    syy += (y[i] - my) * (y[i] - my)
  }
  return sxy / Math.sqrt(sxx * syy)
}

// Average ranks, ties shared.
export function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as [number, number]).sort((a, b) => a[0] - b[0])
  const r = new Array<number>(xs.length)
  let i = 0
  while (i < idx.length) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg
    i = j + 1
  }
  return r
}

export function spearman(x: number[], y: number[]): number {
  return pearson(ranks(x), ranks(y))
}

// Seeded generator for resampling, so reports are reproducible.
export function rng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffled<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}

// Two-sided permutation p-value for a correlation statistic.
export function permutationP(x: number[], y: number[], stat: (a: number[], b: number[]) => number, n = 10000, seed = 1): number {
  const obs = Math.abs(stat(x, y))
  const rand = rng(seed)
  let hits = 0
  for (let k = 0; k < n; k++) if (Math.abs(stat(x, shuffled(y, rand))) >= obs - 1e-12) hits++
  return (hits + 1) / (n + 1)
}

export function olsFit(x: number[], y: number[]): { a: number; b: number } {
  const mx = mean(x), my = mean(y)
  let sxy = 0, sxx = 0
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx) }
  const b = sxy / sxx
  return { a: my - b * mx, b }
}

// Theil-Sen: median of pairwise slopes, intercept the median of y - b x.
export function theilSen(x: number[], y: number[]): { a: number; b: number } {
  const slopes: number[] = []
  for (let i = 0; i < x.length; i++) for (let j = i + 1; j < x.length; j++) if (x[j] !== x[i]) slopes.push((y[j] - y[i]) / (x[j] - x[i]))
  const b = median(slopes)
  return { a: median(y.map((v, i) => v - b * x[i])), b }
}

// Percentile bootstrap interval for the mean.
export function bootstrapMeanCI(xs: number[], n = 2000, seed = 7, level = 0.95): [number, number] {
  const rand = rng(seed)
  const means: number[] = []
  for (let k = 0; k < n; k++) {
    let s = 0
    for (let i = 0; i < xs.length; i++) s += xs[Math.floor(rand() * xs.length)]
    means.push(s / xs.length)
  }
  return [quantile(means, (1 - level) / 2), quantile(means, 1 - (1 - level) / 2)]
}
