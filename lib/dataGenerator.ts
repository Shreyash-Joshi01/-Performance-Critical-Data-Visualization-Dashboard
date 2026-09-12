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

/**
 * Standard normal draw (mean 0, stdev 1) from two uniform draws, via the
 * Box-Muller transform. Financial return models are built on Gaussian
 * noise, not uniform noise — using rand() directly (as the old sine-wave
 * generator did) understates how often small moves happen and overstates
 * how often medium moves happen, relative to a real returns distribution.
 */
function gaussian(rand: () => number): number {
  const u1 = Math.max(rand(), 1e-12); // avoid log(0)
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Per-tick mutable state for one instrument. A random *walk* needs memory
 * of where it was — unlike the old `value = f(timestamp)` sine formula,
 * every model here computes `nextValue = f(previousValue, randomness)`.
 * That's what makes the result an actual random walk (path-dependent,
 * non-repeating, no fixed period) instead of a deterministic wave that
 * happens to have noise sprinkled on top.
 */
interface InstrumentState {
  value: number;
  /** mean-revert only: the long-run level being reverted to — itself drifts slowly. */
  meanTarget?: number;
  /** regime-switch only: the current trend's drift, held until the next flip. */
  regimeDrift?: number;
}

type InstrumentModel =
  | { kind: "gbm"; driftPerTick: number; volPerTick: number; reversion: number }
  | { kind: "gbm-jump"; driftPerTick: number; volPerTick: number; jumpProb: number; jumpVol: number; reversion: number }
  | { kind: "mean-revert"; theta: number; meanWanderPerTick: number; volPerTick: number }
  | { kind: "regime-switch"; flipProb: number; regimeDriftMag: number; volPerTick: number; reversion: number };

interface InstrumentSpec {
  model: InstrumentModel;
  startValue: number;
  min: number;
  max: number;
}

/**
 * One stochastic model per instrument — genuinely different *shapes* of
 * randomness, not the same formula with different constants:
 *
 * - AAPL: Geometric Brownian Motion (GBM) — the textbook stock-price model.
 *   Log-returns are Gaussian; price is a smooth-ish random walk with a mild
 *   upward drift. No period, no repeating pattern.
 * - TSLA: GBM + Merton jump diffusion — the same random walk, plus a small
 *   per-tick chance of a sudden jump (up or down). Produces the
 *   volatility-clustering, occasionally-spiky look of a high-beta stock.
 * - XOM: Ornstein-Uhlenbeck mean reversion — pulled back toward a long-run
 *   level (itself drifting slowly) rather than wandering freely. Produces
 *   a range-bound, oscillating series structurally different from GBM.
 * - NVDA: regime-switching momentum — a hidden "trend" state that persists
 *   for a while, then (rarely, per-tick) flips to a new randomly-drawn
 *   trend. Produces sustained multi-minute up/down runs, unlike the other
 *   three models.
 *
 * `reversion` on the three multiplicative models (gbm, gbm-jump,
 * regime-switch) is a gentle pull back toward startValue, in log space:
 * each tick's drift gets an extra `-reversion * ln(value/startValue)` term.
 * Why it's there: a pure multiplicative random walk's log-price has
 * variance that grows with the number of ticks, without bound — over a
 * short viewport it looks like realistic drift, but accumulated over tens
 * of thousands of ticks (a long "All" time range, or the 25k/50k stress
 * presets, which regenerate a full history in one shot via
 * generateInitialDataset) it can easily wander far enough to hit the
 * min/max clamp and get *stuck* there for many consecutive ticks — a very
 * unrealistic-looking flat line pinned at exactly the boundary value, and
 * one that also breaks the shared Y-axis for whichever other instruments
 * are sharing that chart. This was caught exactly that way: NVDA pinned at
 * its $3,000 ceiling after a 50k-point regeneration. The fix mirrors how
 * XOM's mean-revert model already behaves (pulled toward a level, not free
 * to wander indefinitely) without giving up the short-term GBM-like
 * randomness the other three ticks still show tick-to-tick — the pull term
 * is negligible near startValue and only kicks in once a series has
 * drifted far enough that a real market would expect mean reversion too.
 */
const INSTRUMENTS: Record<Category, InstrumentSpec> = {
  AAPL: {
    startValue: 180,
    min: 20,
    max: 2000,
    model: { kind: "gbm", driftPerTick: 0.000008, volPerTick: 0.0009, reversion: 0.0006 },
  },
  TSLA: {
    startValue: 250,
    min: 20,
    max: 3000,
    // jumpProb lowered from an earlier 0.003 (which produced a jump every
    // few seconds under stress test — constant, not "occasional news event"
    // like Merton jump-diffusion is supposed to model) to something that
    // reads as a rare, notable event even over a long/stress-test session.
    model: { kind: "gbm-jump", driftPerTick: 0.00001, volPerTick: 0.0017, jumpProb: 0.0003, jumpVol: 0.02, reversion: 0.0008 },
  },
  XOM: {
    startValue: 115,
    min: 20,
    max: 500,
    model: { kind: "mean-revert", theta: 0.02, meanWanderPerTick: 0.06, volPerTick: 0.32 },
  },
  NVDA: {
    startValue: 130,
    min: 10,
    max: 3000,
    // regimeDriftMag lowered from an earlier 0.0016: a regime persists for
    // ~1/flipProb ≈ 667 ticks on average, so the old value let a single
    // lucky (or unlucky) regime alone move the price ~3x — compounded
    // across ~19 regimes in a 12,500-tick history, that's what walked NVDA
    // straight up into its max clamp and stuck it there.
    model: { kind: "regime-switch", flipProb: 0.0015, regimeDriftMag: 0.00035, volPerTick: 0.0011, reversion: 0.0008 },
  },
};

/** Fresh starting state for one instrument (used on mount and whenever the buffer is reseeded at a new load level). */
export function createInstrumentState(category: Category): InstrumentState {
  return { value: INSTRUMENTS[category].startValue };
}

/** Continue an instrument's random walk from wherever it currently is (used to seed live streaming from the last known price). */
export function resumeInstrumentState(currentValue: number): InstrumentState {
  return { value: currentValue };
}

/** Advances one instrument's state by exactly one 100ms tick and returns the new price. Mutates `state` in place — this is a random *walk*, so state IS the point. */
export function stepInstrument(category: Category, state: InstrumentState, rand: () => number): number {
  const spec = INSTRUMENTS[category];
  const m = spec.model;

  switch (m.kind) {
    case "gbm": {
      const z = gaussian(rand);
      const pull = -m.reversion * Math.log(state.value / spec.startValue);
      state.value *= Math.exp(m.driftPerTick + pull - 0.5 * m.volPerTick ** 2 + m.volPerTick * z);
      break;
    }
    case "gbm-jump": {
      const z = gaussian(rand);
      const pull = -m.reversion * Math.log(state.value / spec.startValue);
      state.value *= Math.exp(m.driftPerTick + pull - 0.5 * m.volPerTick ** 2 + m.volPerTick * z);
      if (rand() < m.jumpProb) {
        state.value *= Math.exp(gaussian(rand) * m.jumpVol);
      }
      break;
    }
    case "mean-revert": {
      if (state.meanTarget === undefined) state.meanTarget = spec.startValue;
      // The long-run level itself wanders slowly, so the series doesn't look
      // pinned to a perfectly static line over a long session.
      state.meanTarget += (rand() - 0.5) * 2 * m.meanWanderPerTick;
      const z = gaussian(rand);
      state.value += m.theta * (state.meanTarget - state.value) + m.volPerTick * z;
      break;
    }
    case "regime-switch": {
      if (state.regimeDrift === undefined) state.regimeDrift = 0;
      if (rand() < m.flipProb) {
        state.regimeDrift = (rand() - 0.5) * 2 * m.regimeDriftMag;
      }
      const z = gaussian(rand);
      const pull = -m.reversion * Math.log(state.value / spec.startValue);
      state.value *= Math.exp(state.regimeDrift + pull - 0.5 * m.volPerTick ** 2 + m.volPerTick * z);
      break;
    }
  }

  state.value = clamp(state.value, spec.min, spec.max);
  return state.value;
}

/**
 * Builds the initial dataset: `count` points per instrument, spaced 100ms
 * apart, ending at `endTime` (default now), by walking each instrument's
 * model forward tick-by-tick from a fresh starting state. This is what the
 * Server Component calls so the client never has to wait on an empty chart.
 */
export function generateInitialDataset(count: number, endTime: number = Date.now(), seed = 42): DataPoint[] {
  const rand = mulberry32(seed);
  const points: DataPoint[] = [];
  const stepMs = 100;
  const startTime = endTime - count * stepMs;

  for (const category of CATEGORIES) {
    const state = createInstrumentState(category);
    for (let i = 0; i < count; i++) {
      const timestamp = startTime + i * stepMs;
      points.push({ timestamp, value: stepInstrument(category, state, rand), category });
    }
  }

  // Keep the buffer's invariant (ascending timestamp) true from the start.
  points.sort((a, b) => a.timestamp - b.timestamp);
  return points;
}

/** One fresh tick (one new point per instrument), advancing the given per-instrument states — used by the live stream. */
export function generateTick(timestamp: number, rand: () => number, states: Record<Category, InstrumentState>): DataPoint[] {
  return CATEGORIES.map((category) => ({
    timestamp,
    value: stepInstrument(category, states[category], rand),
    category,
  }));
}

export type { InstrumentState };
