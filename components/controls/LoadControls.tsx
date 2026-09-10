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
}

const LEVELS: LoadLevel[] = [10_000, 25_000, 50_000];

/**
 * Changes the *target size* of the sliding window (lib/buffer.ts), not the
 * data that's already there — dropping from 50k to 10k trims the buffer
 * down over the next few ticks rather than instantly discarding history,
 * and raising it lets the window grow back up to the new cap as new
 * points arrive. Stress test swaps the ingest interval from 100ms to
 * 20ms (5x the point rate) to deliberately push the pipeline harder.
 */
export default function LoadControls({ loadLevel, onLoadLevelChange, running, onStart, onPause, stressTest, onStressTestChange }: LoadControlsProps) {
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
      </div>
    </div>
  );
}
