# Performance-Critical Data Visualization Dashboard

A real-time dashboard that streams 10,000–50,000+ simulated time-series points and
renders line, bar, scatter and heatmap charts on `<canvas>` at 60 FPS, built with
Next.js 14+ (App Router) and TypeScript. No charting library (no D3, no Chart.js) —
every renderer is hand-written canvas code.

![Dashboard screenshot](screenshots/desktop.png)

## Setup

```bash
npm install
npm run dev       # http://localhost:3000 -> redirects to /dashboard
```

Production build (this is the mode the performance numbers below were measured in):

```bash
npm run build
npm start
```

Other scripts:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
```

## What's in the dashboard

- **4 categories** of synthetic telemetry (CPU, Memory, Network, Temperature), each a
  smooth periodic trend + noise + occasional anomaly spikes (`lib/dataGenerator.ts`).
- **4 chart types** — Line, Bar, Scatter, Heatmap — pick any two to show at once via
  the "Main Chart" / "Secondary Chart" selectors (all four are exercised by switching).
- **Live streaming**: a new point per category every 100ms (20ms in Stress Test mode).
- **Load controls**: 10k / 25k / 50k total points, Start/Pause, Stress Test.
- **Interaction**: mouse-wheel zoom and click-drag pan directly on the Line/Scatter
  charts; Time Range presets (1min/5min/15min/All); category Filters; 1min/5min/1hour
  Aggregation (drives the Bar chart's bucket size).
- **Virtualized table** over the entire live buffer (up to 50k rows) — only visible
  rows become real DOM nodes.
- **Performance monitor**: live FPS, render time, processing time, point count, and
  JS heap size (Chrome only) — all measured, never hardcoded.

## Performance testing instructions

1. `npm run build && npm start` (dev mode has extra instrumentation overhead and isn't
   representative — always benchmark the production build).
2. Open `/dashboard`, watch the **FPS** tile in the header for ~10s at the default 10k
   load.
3. Click **25k**, then **50k** — the dataset regenerates immediately at that size so you
   can see the renderer under load without waiting for the stream to fill up.
4. Click **Stress Test** to push the ingest rate to 20ms (5x normal) at whatever load
   level is selected.
5. Try zoom (scroll wheel over a chart) and pan (click-drag) on the Line or Scatter
   chart — the chart should track the cursor with no visible lag.
6. Leave it running for a few minutes and confirm **Points** plateaus (doesn't climb
   forever) and **Memory** doesn't trend strictly upward.

See `PERFORMANCE.md` for actual measured results (via an automated headless-Chromium
benchmark, not manual eyeballing) and the reasoning behind the architecture.

## Browser compatibility

- Built and tested against Chromium (via Playwright, see `PERFORMANCE.md`).
- Uses only standard Canvas 2D, `ResizeObserver`, and `requestAnimationFrame` — no
  Chromium-only APIs in the rendering path, so it's expected to work in current
  Firefox/Safari too.
- The **Memory** tile uses `performance.memory`, a non-standard Chrome API. It shows
  "n/a" in browsers that don't expose it (Firefox, Safari) — this is a display
  limitation only, not a functional one.

## Feature overview

| Area | What it demonstrates |
|---|---|
| `lib/dataGenerator.ts` | Seeded PRNG, realistic per-category signals, anomaly spikes |
| `lib/buffer.ts` | Bounded sliding-window buffer (the "no unbounded growth" rule) |
| `hooks/useDataStream.ts` | 100ms ingest loop decoupled from React state/rendering |
| `hooks/useChartRenderer.ts` | Shared rAF loop + dirty-flag + DPR-aware resize for all 4 charts |
| `lib/search.ts` | Binary search for O(log n) viewport slicing of sorted buffers |
| `lib/lod.ts` | Level-of-detail bucketing for the line chart |
| `lib/aggregation.ts` | 1min/5min/1hour bucketing for the bar chart |
| `hooks/useVirtualization.ts` + `components/ui/DataTable.tsx` | Row virtualization |
| `app/dashboard/page.tsx` | Server Component generating the initial dataset |
| `app/api/data/route.ts` | Route Handler demonstrating server-side data generation |

## Next.js-specific optimizations used

- **Server Component for initial data** (`app/dashboard/page.tsx`): the first 10,000
  points exist before any client JS runs, generated with `export const dynamic =
  "force-dynamic"` so every request gets a fresh dataset instead of one frozen at
  build time.
- **Client Component boundary** kept as low as practical: only `DashboardClient.tsx`
  and the interactive leaves (`"use client"`) opt into client-side JS; layout/loading/
  error boundaries are server-rendered where possible.
- **`loading.tsx` / `error.tsx`** route-level boundaries for the `/dashboard` segment.
- Bundle stays well under the 500KB gzipped target — first load JS is ~110KB
  (see `PERFORMANCE.md`).

## Known, deliberate deviations from a literal reading of the spec

- **Axis tick labels are drawn on the canvas itself**, not as separate SVG/DOM
  elements. Axis labels have to repaint in lockstep with the chart during a 60fps
  pan/zoom drag; doing that through React-rendered SVG text would mean updating
  React state on every drag event, which reintroduces the per-frame React re-render
  this architecture exists to avoid. Legends, controls, and the table are HTML, as
  specified.
- One dependency version deviates from a literal "Next.js 14+": pinned to **Next.js
  15.5.25** instead of a 14.x release. Every 14.x release (and 15.x releases before
  15.5.24) carries a stack of disclosed CVEs with no available 14.x backport;
  15.5.25 is the newest patched release on a branch I have real familiarity with
  (Next 16 is a very recent major with API surface I can't vouch for). Full reasoning
  in `PERFORMANCE.md`.
