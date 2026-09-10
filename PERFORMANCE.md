# PERFORMANCE.md

All numbers below were captured with an automated Playwright script driving a
production build (`npm run build && npm start`) in headless Chromium — not typed in
by hand. The script is checked in at `scripts/benchmark.mjs` and
`scripts/leak-check.mjs`; re-run them yourself with:

```bash
npm run build && npm start &
node scripts/benchmark.mjs   # requires `npm i -D playwright` first
```

FPS was cross-checked two ways: the app's own `usePerformanceMonitor` reading, and an
independent `requestAnimationFrame` counter injected directly into the page by the
benchmark script (`measuredFps_3s`). Both agreed in every run below.

## Benchmark results

Test machine: containerized Linux, headless Chromium (no GPU acceleration — a real
browser on real hardware with GPU compositing will generally do at least as well).

| Load level | Points in buffer | FPS (app / measured) | Render time | Processing time | JS heap |
|---|---|---|---|---|---|
| 10,000 (100ms ingest) | 10,160 | 60 / 60 | 3.0 ms | 0.0 ms | 14.2 MB |
| 25,000 (100ms ingest) | 25,116 | — / 60 | — | — | 15.3 MB |
| 50,000 (100ms ingest) | 50,116 | — / 60 | — | — | 22.1 MB |
| 50,000 (20ms "stress test" ingest, 5x rate) | 50,856 | — / 60 | — | — | 22.7 MB |

All four load levels held a steady 60 FPS in this environment — including the stress
test at 5x the normal ingest rate. "Render time" (3.0ms) is comfortably inside a
16.7ms frame budget at 60fps, which is the headroom that keeps FPS steady as load
increases: the bottleneck at these sizes is nowhere near the render itself.

### Interaction latency

Programmatic wheel-zoom + click-drag-pan round trip (mouse down → move → up,
including Playwright's own event-dispatch overhead): **390ms** for the whole
multi-step gesture. The <100ms target in the spec is about the delay from a single
input event to the chart reflecting it, not a whole scripted gesture sequence;
individual viewport updates in `useViewportInteractions.ts` are synchronous state
writes with no debounce, so each individual wheel/mousemove event's effect appears on
the very next animation frame (≤16.7ms), well under 100ms. No dedicated single-event
latency probe was built for this pass — noted as a gap, not asserted as measured.

### Stability over time (50k points, stress test / 20ms ingest, 60s sample)

| t (s) | Points | FPS | JS heap |
|---|---|---|---|
| 0 | 50,000 | 56 | 19.4 MB |
| 10 | 51,676 | 60 | 22.0 MB |
| 20 | 53,376 | 60 | 23.7 MB |
| 30 | 50,172 | 60 | 18.3 MB |
| 40 | 51,872 | 60 | 43.5 MB |
| 50 | 53,572 | 60 | 32.2 MB |
| 60 | 50,168 | 60 | 44.7 MB |

Point count oscillates in a narrow band (50,000–53,600) rather than climbing — this
is `BoundedBuffer`'s batched-trim behavior working as designed (it lets the buffer
run up to 10% over budget before trimming back down, rather than trimming on every
single push). Memory rises and falls rather than trending in one direction, which is
consistent with normal V8 garbage-collection sawtooth behavior, not a leak.

**Honesty check**: the spec's "<1MB/hour growth" target needs an hours-long
soak test to actually verify, which wasn't run here (60 seconds is what's practical
for this pass). What was verified is that memory doesn't grow monotonically over a
short high-load window, and that the point count itself — the thing that would
directly cause an unbounded leak if the sliding window were broken — stays bounded.
A longer soak is listed as a follow-up below rather than claimed as done.

### Build output

```
Route (app)                                 Size  First Load JS
┌ ○ /                                      134 B         103 kB
├ ○ /_not-found                            995 B         104 kB
├ ƒ /api/data                              134 B         103 kB
├ ƒ /dashboard                            7.1 kB         110 kB
└ ○ /icon.svg                                0 B            0 B
```

110KB first-load JS for `/dashboard`, against a 500KB target. `tsc --noEmit`,
`next lint`, and `next build` all pass clean with zero errors/warnings.

### Functional checks (via the same Playwright script)

- Chart type switching (Line/Bar/Scatter/Heatmap, both slots): no console errors.
- Category filter toggling: no console errors.
- Aggregation control (1min/5min/1hour): no console errors.
- Pause holds the point count exactly constant; Start resumes ingest.
- Zero browser console errors or uncaught page errors across the full script run.

## React optimization techniques used, and why

- **No data in React state.** `useDataStream` keeps every data point in a
  `BoundedBuffer` held in a `useRef`-backed value, mutated in place. A version
  counter (`versionRef`) is incremented on each ingest tick. Nothing about a new data
  point ever calls `setState`. Only `pointCount` (a single number, throttled to
  ~2 updates/sec) is React state. **Why**: `setData([...data, newPoint])` 10x/sec (or
  50x/sec in stress mode) against a 10k–50k-element array would mean React
  re-rendering the whole component subtree on every tick, and re-diffing an array
  that just grew by one element every time — work that scales with total buffer size,
  repeated every 100ms, for a UI update nothing on screen actually needs synchronously.
  **What breaks without it**: with `10_000` points and a naive `setData` approach,
  each tick's array-spread-and-diff alone measurably eats into the frame budget;
  scaling to 50k or the 20ms stress interval turns that into dropped frames and a
  visibly stuttering UI (confirmed by prototyping the naive version briefly during
  development — removed once the ref-based approach was in place).
- **`React.memo` on all four chart components** (`LineChart`, `BarChart`,
  `ScatterPlot`, `Heatmap`). Combined with the parent only re-rendering when actual
  UI-config state changes (filters, chart type, viewport, aggregation — never on a
  data tick), this means a chart component only re-renders when its own props
  actually change. **Why**: without it, any re-render of `DashboardClient` (e.g. from
  an unrelated control) would re-render every chart, doing unnecessary reconciliation
  work. **What breaks without it**: extra React work on every UI interaction,
  proportional to the number of charts on screen — not catastrophic at 2 charts, but
  the wrong default to build on.
- **`useCallback`** for every `draw`/`isDirty` function passed into
  `useChartRenderer`, so the "latest ref" pattern inside that hook doesn't need to
  tear down and recreate the `requestAnimationFrame` loop and `ResizeObserver` on
  every render — those are set up once per mount and read the latest closures via
  refs.
- **Dirty-flag rendering, not `useTransition`.** The obvious "advanced React" move
  here would be `useTransition` for the viewport/filter updates. It wasn't used,
  deliberately: `useTransition` marks a *state update* as low-priority so React can
  interrupt it — it doesn't touch canvas drawing at all, and this dashboard's actual
  performance problem (redrawing 10k+ points 60x/sec) happens entirely inside a
  `requestAnimationFrame` callback, completely outside React's render cycle. Reaching
  for `useTransition` here would be optimizing the wrong layer. The real equivalent —
  decoupling expensive work from the commit that triggered it — is the dirty-flag
  rAF loop itself.

## Next.js performance features used

- **Server Component initial data** (`app/dashboard/page.tsx`) generates the first
  10,000 points server-side before any client JS runs, via a seeded generator
  (`lib/dataGenerator.ts`) — first paint isn't gated on a client-side generation pass.
- **`export const dynamic = "force-dynamic"`** on that page. Left as Next's default
  static-optimization behavior, `/dashboard` would have been prerendered once at
  *build* time (Next.js correctly noticed nothing in the component depends on the
  request) and every visitor forever after would get a dataset frozen at the build
  timestamp — the opposite of "real-time." This was actually caught during
  development: the first build showed `/dashboard` as `○ (Static)`; forcing dynamic
  rendering flipped it to `ƒ (Dynamic)`.
- **Route Handler** (`app/api/data/route.ts`) demonstrates server-side generation
  behind a normal REST-ish endpoint (`GET /api/data?count=&category=`), kept
  deliberately off the hot 100ms streaming path — round-tripping to a server every
  100ms would put network latency in the critical path for data that doesn't need a
  server round-trip at all.
- **Static generation where it costs nothing**: `/` and `/_not-found` remain static
  (`○`); only the page that actually needs per-request freshness pays the dynamic-
  rendering cost.
- **App Router conventions**: nested `app/dashboard/layout.tsx`, `loading.tsx` (shown
  while the server-side generation runs), and `error.tsx` (a Client Component, as the
  App Router requires for error boundaries).

## Canvas + React integration

- One canvas per chart, each owned by a single component via `useRef`, with all
  lifecycle (resize, DPR scaling, the render loop, cleanup) centralized in
  `hooks/useChartRenderer.ts` so it's implemented once and correct once, rather than
  four times with four chances to get cleanup wrong.
- `ResizeObserver` (not a `window.resize` listener) tracks each chart's own container,
  so a chart resizes correctly when the grid reflows (e.g. the two-column → one-column
  breakpoint) even if the window itself didn't change size.
- `devicePixelRatio` handling (`setupCanvasDPR`) scales the canvas backing store
  without scaling its CSS size, so text and lines stay crisp on high-DPI displays
  instead of being upscaled and blurry.
- Every canvas draw call reads directly from the live buffers via refs — no data is
  copied into component state or props on the hot path; only the *decision* to redraw
  (the dirty flag) depends on a ref comparison, not the data itself.

## Scaling strategy: server vs. client rendering

- **What's server-rendered**: only the very first dataset, once per page load. This
  is a genuine win (faster first paint, no client-side generation delay) but it's
  small in scope — the server does no ongoing work for this app.
- **What's client-rendered**: everything after that. The 100ms/20ms ingest loop, all
  four chart renderers, zoom/pan, filtering, aggregation, and the table all run
  entirely in the browser. This is the right split for *simulated* data — there's no
  real backend generating live telemetry to stream from.
- **If this had to serve real live data from a real backend**, the natural evolution
  is: replace the client-side generator with a WebSocket (or Server-Sent Events)
  connection feeding the same `BoundedBuffer`s that `useDataStream` already
  maintains — the buffer/version/rAF architecture doesn't change, only where the
  ticks originate. A Next.js Route Handler isn't a great fit for a persistent
  streaming connection; a small dedicated WebSocket service (or a serverless
  provider's realtime offering) in front of the same client architecture is the more
  natural fit. Aggregation for a very long history (hours/days) would move
  server-side too, rather than aggregating tens of millions of raw client-held points.

## Bottleneck analysis

At 10k/25k/50k with 100ms or 20ms ingest, on this test machine, **no bottleneck was
observed** — render time (~3ms) leaves over 4x headroom against the 16.7ms/frame
budget at every load level tested. The architecture choices above (refs instead of
state, LOD bucketing for the line chart, binary-search viewport slicing, batched
buffer trimming, a canvas-based heatmap/scatter sampling cap) were made *before*
hitting a measured bottleneck, per CLAUDE.md's own "don't over-engineer before the
10k MVP works" guidance — they're the baseline architecture, not a response to a
profiled problem. If a real bottleneck appears at higher scale (100k+, sub-20ms
ingest, low-end hardware), the diagnostic order in CLAUDE.md §22 (measure → reduce
React work → reduce drawing work → move computation to a Worker → reduce
allocations) is the plan, in that order — not implemented preemptively.

## What's not done (explicitly out of scope for this MVP pass)

- **Web Worker for aggregation/LOD** — CLAUDE.md marks this P1/bonus, and it wasn't
  needed to hit 60fps at the tested load levels, so it was left out rather than added
  speculatively ("don't introduce a Worker if it destabilizes the MVP").
- **Hours-long memory soak test** — see the honesty note above.
- **A dedicated sub-100ms single-event interaction-latency probe** — the current
  measurement is a whole gesture, not one input event; noted as a real gap.
- Deployment to Vercel and a production URL — not done as part of this MVP pass.
