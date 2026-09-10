import { CATEGORIES, Category, DataPoint } from "./types";

/**
 * Deterministic PRNG (mulberry32) so the same seed always produces the same
 * dataset. Needed for benchmark repeatability — Math.random() alone would
 * make "generate 10k points" produce a different graph shape on every run,
 * which makes before/after performance comparisons meaningless.
 */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per-category baseline/range so "CPU" and "Temperature" don't look identical. */
const PROFILE: Record<Category, { base: number; amplitude: number; noise: number; min: number; max: number; period: number }> = {
  CPU: { base: 45, amplitude: 25, noise: 4, min: 0, max: 100, period: 60_000 },
  Memory: { base: 60, amplitude: 15, noise: 2, min: 0, max: 100, period: 120_000 },
  Network: { base: 30, amplitude: 28, noise: 8, min: 0, max: 100, period: 20_000 },
  Temperature: { base: 55, amplitude: 10, noise: 1.5, min: 20, max: 90, period: 90_000 },
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Generates one realistic point for a category at a given timestamp:
 * a smooth periodic trend (sine wave on that category's own period) plus
 * small random noise, with a low-probability spike/anomaly layered on top.
 * This is what makes the chart look like real telemetry instead of static.
 */
export function generatePointValue(category: Category, timestamp: number, rand: () => number): number {
  const p = PROFILE[category];
  const trend = p.base + p.amplitude * Math.sin((2 * Math.PI * timestamp) / p.period);
  const noise = (rand() - 0.5) * 2 * p.noise;
  let value = trend + noise;

  // Occasional anomaly/spike (~0.5% of points) — real systems aren't smooth sine waves.
  if (rand() < 0.005) {
    value += (rand() > 0.5 ? 1 : -1) * p.amplitude * (1.5 + rand());
  }

  return clamp(value, p.min, p.max);
}

/**
 * Builds the initial dataset: `count` points per category, spaced 100ms
 * apart, ending at `endTime` (default now). This is what the Server
 * Component calls so the client never has to wait on an empty chart.
 */
export function generateInitialDataset(count: number, endTime: number = Date.now(), seed = 42): DataPoint[] {
  const rand = mulberry32(seed);
  const points: DataPoint[] = [];
  const stepMs = 100;
  const startTime = endTime - count * stepMs;

  for (const category of CATEGORIES) {
    for (let i = 0; i < count; i++) {
      const timestamp = startTime + i * stepMs;
      points.push({ timestamp, value: generatePointValue(category, timestamp, rand), category });
    }
  }

  // Keep the buffer's invariant (ascending timestamp) true from the start.
  points.sort((a, b) => a.timestamp - b.timestamp);
  return points;
}

/** One fresh point per category for the given tick — used by the live stream. */
export function generateTick(timestamp: number, rand: () => number): DataPoint[] {
  return CATEGORIES.map((category) => ({
    timestamp,
    value: generatePointValue(category, timestamp, rand),
    category,
  }));
}
