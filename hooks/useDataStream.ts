"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CATEGORIES, Category, DataPoint, LoadLevel } from "@/lib/types";
import { BoundedBuffer } from "@/lib/buffer";
import { generateInitialDataset, generateTick, mulberry32, resumeInstrumentState, InstrumentState } from "@/lib/dataGenerator";
import { regenerateDataset } from "@/app/actions";

export interface DataStreamHandle {
  /** Live, mutable per-category buffers. Renderers read these directly every frame — never copied into React state. */
  buffers: Record<Category, BoundedBuffer<DataPoint>>;
  /** Bumped on every ingested tick. Renderers compare this against the version they last drew to decide whether a redraw is even needed. */
  versionRef: React.MutableRefObject<number>;
  pointCount: number;
  running: boolean;
  loadLevel: LoadLevel;
  stressTest: boolean;
  start: () => void;
  pause: () => void;
  setLoadLevel: (level: LoadLevel) => void;
  setStressTest: (on: boolean) => void;
  /** True while a Server Action round-trip for `randomize()` is in flight. */
  randomizing: boolean;
  /** Server Action-backed reseed — see app/actions.ts's regenerateDataset. */
  randomize: () => Promise<void>;
}

function buildBuffers(initialData: DataPoint[], perCategoryMax: number): Record<Category, BoundedBuffer<DataPoint>> {
  const buffers = {} as Record<Category, BoundedBuffer<DataPoint>>;
  for (const category of CATEGORIES) {
    const buf = new BoundedBuffer<DataPoint>(perCategoryMax);
    buf.seed(initialData.filter((p) => p.category === category));
    buffers[category] = buf;
  }
  return buffers;
}

/**
 * Each instrument is a random *walk*, so the live stream can't just call a
 * stateless formula — it has to pick up exactly where the last buffered
 * point left off, or there'd be a visible price jump the instant streaming
 * takes over from the server-generated initial dataset.
 */
function resumeStatesFromBuffers(buffers: Record<Category, BoundedBuffer<DataPoint>>): Record<Category, InstrumentState> {
  const states = {} as Record<Category, InstrumentState>;
  for (const category of CATEGORIES) {
    const snap = buffers[category].snapshot();
    const last = snap[snap.length - 1];
    states[category] = resumeInstrumentState(last ? last.value : 0);
  }
  return states;
}

const BASE_INTERVAL_MS = 100;
const STRESS_INTERVAL_MS = 20; // 5x the normal ingest rate, for the "stress test" control

/**
 * Owns the live data buffer and the 100ms ingest loop.
 *
 * This is the seam CLAUDE.md's architecture diagram calls "data generation
 * -> bounded data buffer": it runs independently of React's render cycle.
 * New points are written straight into the BoundedBuffer refs and a version
 * counter is incremented — there is deliberately no `setData([...data, x])`
 * here. That pattern (spreading a growing array into state 10x/sec) would
 * force React to diff and re-render the whole component tree 10 times a
 * second regardless of whether anything visible changed, which is exactly
 * the main-thread stall this dashboard exists to avoid. `pointCount` is the
 * one piece of state this hook keeps, and it's updated on a throttle, not
 * every tick, purely to drive the on-screen counter.
 */
export function useDataStream(initialData: DataPoint[], initialLoadLevel: LoadLevel = 10_000): DataStreamHandle {
  const perCategoryMax = initialLoadLevel / CATEGORIES.length;
  const [buffers] = useState(() => buildBuffers(initialData, perCategoryMax));
  const versionRef = useRef(0);
  const randRef = useRef(mulberry32(Date.now() & 0xffffffff));
  // Per-instrument random-walk state for the live stream, resumed from
  // wherever the server-generated initial dataset left each price.
  const statesRef = useRef<Record<Category, InstrumentState> | null>(null);
  if (statesRef.current === null) {
    statesRef.current = resumeStatesFromBuffers(buffers);
  }

  const [running, setRunning] = useState(true);
  const [loadLevel, setLoadLevelState] = useState<LoadLevel>(initialLoadLevel);
  const [stressTest, setStressTest] = useState(false);
  const [pointCount, setPointCount] = useState(initialData.length);
  const [randomizing, setRandomizing] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickCountRef = useRef(0);

  const isFirstLoadLevelRun = useRef(true);

  useEffect(() => {
    const perCategoryCap = loadLevel / CATEGORIES.length;

    // On mount, the buffers are already seeded from the server-generated
    // initialData — just apply the cap, don't touch the contents.
    if (isFirstLoadLevelRun.current) {
      isFirstLoadLevelRun.current = false;
      for (const category of CATEGORIES) buffers[category].setMaxSize(perCategoryCap);
      return;
    }

    // The load buttons exist so you can immediately see how the renderer
    // behaves at 10k/25k/50k — raising the cap alone would only grow the
    // buffer organically as new 100ms ticks arrive (minutes to fill 12.5k
    // points/category), which defeats the point of a load *test*. So a
    // level change regenerates a fresh dataset at the new size right away,
    // ending "now", the same way the server-rendered initial load did.
    const freshData = generateInitialDataset(perCategoryCap, Date.now());
    let total = 0;
    for (const category of CATEGORIES) {
      const buf = buffers[category];
      buf.setMaxSize(perCategoryCap);
      buf.seed(freshData.filter((p) => p.category === category));
      total += buf.length;
    }
    // The regenerated buffer ends at a new price per instrument — resume the
    // live random walk from there too, or the very next streamed tick would
    // jump back to wherever the old walk happened to be.
    statesRef.current = resumeStatesFromBuffers(buffers);
    versionRef.current += 1;
    setPointCount(total);
  }, [loadLevel, buffers]);

  useEffect(() => {
    if (!running) return;

    const intervalMs = stressTest ? STRESS_INTERVAL_MS : BASE_INTERVAL_MS;

    const tick = () => {
      const points = generateTick(Date.now(), randRef.current, statesRef.current!);
      for (const p of points) {
        buffers[p.category].push(p);
      }
      versionRef.current += 1;
      tickCountRef.current += 1;

      // Throttle the React-visible point count to ~2x/sec instead of every tick.
      if (tickCountRef.current % Math.max(1, Math.round(500 / intervalMs)) === 0) {
        let total = 0;
        for (const category of CATEGORIES) total += buffers[category].length;
        setPointCount(total);
      }

      timeoutRef.current = setTimeout(tick, intervalMs);
    };

    timeoutRef.current = setTimeout(tick, intervalMs);

    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, [running, stressTest, buffers]);

  const start = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);
  const setLoadLevel = useCallback((level: LoadLevel) => setLoadLevelState(level), []);

  // Same buffer-reseeding shape as the load-level effect above, except the
  // fresh dataset comes from a Server Action (app/actions.ts) instead of
  // being computed inline — so this one is async and has a real (if usually
  // small) network round-trip, unlike everything else in this hook.
  const randomize = useCallback(async () => {
    setRandomizing(true);
    try {
      const freshData = await regenerateDataset(loadLevel);
      const perCategoryCap = loadLevel / CATEGORIES.length;
      let total = 0;
      for (const category of CATEGORIES) {
        const buf = buffers[category];
        buf.setMaxSize(perCategoryCap);
        buf.seed(freshData.filter((p) => p.category === category));
        total += buf.length;
      }
      statesRef.current = resumeStatesFromBuffers(buffers);
      versionRef.current += 1;
      setPointCount(total);
    } finally {
      setRandomizing(false);
    }
  }, [loadLevel, buffers]);

  return {
    buffers,
    versionRef,
    pointCount,
    running,
    loadLevel,
    stressTest,
    start,
    pause,
    setLoadLevel,
    setStressTest,
    randomizing,
    randomize,
  };
}
