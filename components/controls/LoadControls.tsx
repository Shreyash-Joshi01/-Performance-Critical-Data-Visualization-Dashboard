"use client";

import { LoadLevel } from "@/lib/types";

interface LoadControlsProps {
  loadLevel: LoadLevel;
  onLoadLevelChange: (level: LoadLevel) => void;
  running: boolean;
  onStart: () => void;
  onPause: () => void;
  stressTest: boolean;
  onStressTestChange: (on: boolean) => void;
  /** Server Action-backed reseed (app/actions.ts) — optional so this control still works in isolation/tests. */
  onRandomize?: () => void;
  randomizing?: boolean;
}

const LEVELS: LoadLevel[] = [10_000, 25_000, 50_000, 100_000];

/**
 * Changes the *target size* of the sliding window (lib/buffer.ts), not the
 * data that's already there — dropping from 100k to 10k trims the buffer
 * down over the next few ticks rather than instantly discarding history,
 * and raising it lets the window grow back up to the new cap as new
 * points arrive. Stress test swaps the ingest interval from 100ms to
 * 20ms (5x the point rate) to deliberately push the pipeline harder.
 * 100k is CLAUDE.md's stretch target (15fps+ usable, not the 60fps target
 * that applies at 10k/25k/50k) — see PERFORMANCE.md for the measured numbers.
 */
export default function LoadControls({
  loadLevel,
  onLoadLevelChange,
  running,
  onStart,
  onPause,
  stressTest,
  onStressTestChange,
  onRandomize,
  randomizing,
}: LoadControlsProps) {
  return (
    <div className="control-group">
      <span className="control-label">Load</span>
      <div className="control-row">
        {LEVELS.map((level) => (
          <button key={level} className={`btn ${loadLevel === level ? "btn-active" : ""}`} onClick={() => onLoadLevelChange(level)}>
            {level / 1000}k
          </button>
        ))}
        <button className={`btn ${running ? "btn-active" : ""}`} onClick={running ? onPause : onStart}>
          {running ? "Pause" : "Start"}
        </button>
        <button className={`btn ${stressTest ? "btn-warn" : ""}`} onClick={() => onStressTestChange(!stressTest)}>
          {stressTest ? "Stress: ON (20ms)" : "Stress Test"}
        </button>
        {onRandomize && (
          // Reseeds via a Server Action (app/actions.ts) instead of a client
          // computation — see that file's doc comment for why this one
          // specifically is worth a server round-trip. Disabled while the
          // round-trip is in flight since, unlike every other button here,
          // this one has real network latency to wait on.
          <button className="btn" onClick={onRandomize} disabled={randomizing} title="Reseed the simulation from the server with a fresh random seed">
            {randomizing ? "Randomizing…" : "🎲 Randomize"}
          </button>
        )}
      </div>
    </div>
  );
}
