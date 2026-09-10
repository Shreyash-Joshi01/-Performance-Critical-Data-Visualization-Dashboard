/**
 * Sizes a canvas's backing store for the device's pixel ratio while keeping
 * its CSS size unchanged. Without this, canvases look blurry on any
 * display with devicePixelRatio > 1 (basically all modern laptops/phones),
 * because the canvas would render at CSS-pixel resolution and get upscaled.
 */
export function setupCanvasDPR(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixel units from here on
  return ctx;
}

export interface TimeRange {
  startTime: number;
  endTime: number;
}

export interface ValueRange {
  min: number;
  max: number;
}

/**
 * Centralizes timestamp/value -> pixel conversion. Every chart uses these
 * two functions so zoom/pan (which only mutate the time range) and
 * per-frame Y auto-fit automatically apply everywhere, instead of each
 * chart re-deriving its own math. Deliberately narrow parameter types
 * (not the full Viewport) so a chart's locally-computed Y range can be
 * passed straight in without constructing a fake Viewport around it.
 */
export function timeToX(timestamp: number, range: TimeRange, width: number): number {
  const span = range.endTime - range.startTime || 1;
  return ((timestamp - range.startTime) / span) * width;
}

export function valueToY(value: number, range: ValueRange, height: number): number {
  const span = range.max - range.min || 1;
  return height - ((value - range.min) / span) * height;
}

export function xToTime(x: number, range: TimeRange, width: number): number {
  const span = range.endTime - range.startTime;
  return range.startTime + (x / width) * span;
}

export function clearCanvas(ctx: CanvasRenderingContext2D, width: number, height: number, color = "#12151c"): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Auto-fits the Y axis to whatever data is actually visible right now,
 * with a little padding so lines/bars don't touch the chart edges.
 * Computed fresh per frame from the current slice rather than stored in
 * shared viewport state — it's a rendering concern, not something zoom/pan
 * needs to persist or that other charts need to share.
 */
export function computeValueRange(values: readonly number[], padRatio = 0.1): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 100 };
  // Safe: the length === 0 check above already returned.
  let min = values[0]!;
  let max = values[0]!;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  const pad = span * padRatio;
  return { min: min - pad, max: max + pad };
}

/** Draws light horizontal gridlines + Y-axis value labels directly on the canvas. */
export function drawYAxis(ctx: CanvasRenderingContext2D, width: number, height: number, min: number, max: number, ticks = 4): void {
  ctx.save();
  ctx.strokeStyle = "#232833";
  ctx.fillStyle = "#8b93a3";
  ctx.font = "10px -apple-system, sans-serif";
  ctx.lineWidth = 1;
  for (let i = 0; i <= ticks; i++) {
    const value = min + ((max - min) * i) / ticks;
    const y = height - (i / ticks) * height;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(width, Math.round(y) + 0.5);
    ctx.stroke();
    // Skip the bottom-most label (i === 0): drawTimeAxis renders start/end
    // time text in that same bottom-left corner, and the two would overlap.
    if (i > 0) ctx.fillText(value.toFixed(1), 4, Math.max(10, y - 2));
  }
  ctx.restore();
}

/** Draws start/end time labels at the bottom of the chart. */
export function drawTimeAxis(ctx: CanvasRenderingContext2D, width: number, height: number, startTime: number, endTime: number): void {
  ctx.save();
  ctx.fillStyle = "#8b93a3";
  ctx.font = "10px -apple-system, sans-serif";
  const fmt = (t: number) => new Date(t).toLocaleTimeString();
  ctx.textAlign = "left";
  ctx.fillText(fmt(startTime), 4, height - 4);
  ctx.textAlign = "right";
  ctx.fillText(fmt(endTime), width - 4, height - 4);
  ctx.restore();
}
