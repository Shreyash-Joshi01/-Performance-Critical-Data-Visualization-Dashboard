# CLAUDE.md — Performance-Critical Data Visualization Dashboard

## 1. Mission

Build and ship the **MVP of the Performance-Critical Data Visualization Dashboard today**.

The authoritative assignment requires a high-performance real-time dashboard using:

- Next.js 14+ App Router
- TypeScript
- React
- Canvas + SVG hybrid rendering
- No Chart.js or D3
- Simulated realistic time-series data
- 10,000+ data points
- New data every 100ms
- Target: 60 FPS
- Target: <100ms interaction response
- Stable memory usage
- Line, bar, scatter, and heatmap charts
- Filtering, zoom, pan, time range selection
- 1min / 5min / 1hour aggregation
- Virtualized data table
- Responsive UI
- FPS and memory monitoring
- Stress/load controls
- README.md and PERFORMANCE.md

The assignment also contains a separate Vue 3 version. **For this project, use the Next.js version unless the user explicitly changes the target stack. Do not mix React/Next.js and Vue implementations.**

---

# 2. Non-Negotiable Engineering Principles

## Performance first

Never sacrifice the performance architecture for visual polish.

The primary performance path is:

Data generation
→ bounded data buffer
→ processing
→ render-ready data
→ Canvas
→ requestAnimationFrame

React should manage UI state and component structure, not thousands of individual visualization DOM nodes.

## Never render 10,000+ points as individual DOM/SVG elements

Use Canvas for dense visualization.

Use SVG/HTML for:

- axes
- labels
- legends
- tooltips
- controls
- interaction overlays where appropriate

## Never allow unbounded data growth

Use a bounded/sliding window.

Example:

```ts
MAX_POINTS = 50_000
```

New points enter the buffer while old points are evicted.

## Separate data frequency from render frequency

Data arrives every 100ms.

Rendering should be driven by `requestAnimationFrame`.

Do NOT force a complete React render every time a data point arrives.

## Keep expensive computation off the main thread when practical

Web Worker is preferred for expensive:

- filtering
- aggregation
- level-of-detail calculations
- transformations

But **do not introduce a Worker if it destabilizes the MVP**. A stable MVP is more important than a broken bonus feature.

## Measure instead of guessing

Every performance claim must be backed by an actual measurement.

Track:

- FPS
- render time
- processing time
- point count
- memory when supported
- dropped frames / frame timing where practical
- interaction latency where measurable

Do not fake metrics.

---

# 3. MVP Definition — MUST BE DONE TODAY

The MVP is complete only when all of the following work together:

### Data

- [ ] Realistic synthetic time-series generator
- [ ] At least 10,000 initial points
- [ ] Continuous simulated updates every 100ms
- [ ] Bounded/sliding data buffer
- [ ] Configurable load: 10k / 25k / 50k where feasible

### Rendering

- [ ] Canvas rendering engine
- [ ] Line chart
- [ ] Bar chart
- [ ] Scatter plot
- [ ] Heatmap
- [ ] requestAnimationFrame rendering
- [ ] Responsive canvas sizing
- [ ] devicePixelRatio handling

### Interaction

- [ ] Zoom
- [ ] Pan
- [ ] Category/data filtering
- [ ] Time range selection
- [ ] 1min / 5min / 1hour aggregation

### Table

- [ ] Data table
- [ ] Virtual scrolling / virtualization

### Performance UI

- [ ] Live FPS counter
- [ ] Memory usage display where browser API permits
- [ ] Render time
- [ ] Processing time
- [ ] Current point count
- [ ] Start/pause controls
- [ ] Load/stress controls

### React/Next.js

- [ ] App Router
- [ ] Correct Server/Client component split
- [ ] TypeScript
- [ ] useRef for canvas/high-frequency mutable state where appropriate
- [ ] memoization only where it prevents meaningful work
- [ ] proper effect cleanup
- [ ] loading/error boundaries if practical

### Quality

- [ ] No console errors
- [ ] No obvious memory leak
- [ ] No chart library
- [ ] No D3
- [ ] Production build succeeds

---

# 4. MVP Architecture

Use this architecture unless a measured bottleneck proves another design is better:

```text
                    Next.js App Router
                           |
              +------------+-------------+
              |                          |
       Server Component            Client Dashboard
       Initial config/data                 |
                                      +----+----+
                                      |         |
                                  UI State   Data Engine
                                                |
                                          Data Buffer
                                                |
                                           Processing
                                                |
                                      +---------+---------+
                                      |         |         |
                                    Filter  Aggregate    LOD
                                      |         |         |
                                      +---------+---------+
                                                |
                                         Render Buffer
                                                |
                                      requestAnimationFrame
                                                |
                                      +---------+---------+
                                      |                   |
                                   Canvas              SVG/HTML
                                  Charts             Axes/UI/etc.
```

Preferred later enhancement:

```text
Data Buffer
    |
    v
Web Worker
    |
    +--> filtering
    +--> aggregation
    +--> LOD
    |
    v
Render-ready data
```

---

# 5. Recommended Project Structure

```text
performance-dashboard/
├── app/
│   ├── dashboard/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   ├── loading.tsx
│   │   └── error.tsx
│   ├── api/
│   │   └── data/
│   │       └── route.ts
│   ├── layout.tsx
│   └── globals.css
│
├── components/
│   ├── charts/
│   │   ├── LineChart.tsx
│   │   ├── BarChart.tsx
│   │   ├── ScatterPlot.tsx
│   │   ├── Heatmap.tsx
│   │   └── ChartContainer.tsx
│   ├── controls/
│   │   ├── FilterPanel.tsx
│   │   ├── TimeRangeSelector.tsx
│   │   └── LoadControls.tsx
│   ├── ui/
│   │   ├── DataTable.tsx
│   │   ├── PerformanceMonitor.tsx
│   │   └── DashboardHeader.tsx
│   └── providers/
│       └── DataProvider.tsx
│
├── hooks/
│   ├── useDataStream.ts
│   ├── useChartRenderer.ts
│   ├── usePerformanceMonitor.ts
│   └── useVirtualization.ts
│
├── workers/
│   └── dataProcessor.worker.ts
│
├── lib/
│   ├── dataGenerator.ts
│   ├── performanceUtils.ts
│   ├── canvasUtils.ts
│   ├── aggregation.ts
│   ├── lod.ts
│   └── types.ts
│
├── public/
├── README.md
├── PERFORMANCE.md
├── package.json
├── next.config.js
└── tsconfig.json
```

Do not create files simply to match this tree if they are unnecessary. Keep the implementation maintainable.

---

# 6. Data Model

Use a strongly typed model similar to:

```ts
interface DataPoint {
  timestamp: number;
  value: number;
  category: string;
  metadata?: Record<string, unknown>;
}
```

Useful additional types:

```ts
type ChartType = 'line' | 'bar' | 'scatter' | 'heatmap';

type AggregationInterval = '1m' | '5m' | '1h';

interface Viewport {
  startTime: number;
  endTime: number;
  minValue: number;
  maxValue: number;
}

interface PerformanceMetrics {
  fps: number;
  memoryUsage?: number;
  renderTime: number;
  dataProcessingTime: number;
}
```

Prefer `unknown` over `any` unless `any` is genuinely necessary.

---

# 7. Data Generation Strategy

Do NOT generate meaningless random noise.

Generate realistic synthetic signals with:

- smooth trends
- controlled noise
- periodic behavior
- occasional spikes/anomalies
- multiple categories

Suggested categories:

- CPU
- Memory
- Network
- Temperature

The generator must support deterministic/randomized generation as useful for benchmarking.

It must support configurable dataset sizes.

---

# 8. Rendering Rules

## Canvas

Canvas owns dense visual rendering.

Use:

- `useRef<HTMLCanvasElement>`
- 2D canvas context
- `requestAnimationFrame`
- explicit resize handling
- `devicePixelRatio`

Do not redraw because React happened to render.

## Render loop

Prefer:

```text
requestAnimationFrame
    ↓
check whether rendering is needed
    ↓
render
    ↓
schedule next frame
```

Use a dirty flag or equivalent strategy where appropriate.

## Coordinate system

Centralize coordinate conversion:

```text
timestamp/value
      ↓
viewport transform
      ↓
pixel coordinates
```

Zoom and pan should modify the viewport, not mutate the underlying dataset.

---

# 9. Level of Detail

If many data points map to the same screen pixels, aggregate them for rendering.

For line charts, a practical bucket can preserve:

- min
- max
- average
- representative points

The goal is not to throw away the actual dataset. It is to reduce the number of draw operations.

Do not over-engineer LOD before the 10k MVP works.

---

# 10. React Performance Rules

Avoid:

```tsx
setData([...data, newPoint])
```

for high-frequency large datasets.

Avoid passing a giant mutable array through many components unnecessarily.

Prefer:

- refs/mutable buffers for high-frequency data
- state for low-frequency UI configuration
- `React.memo` for genuinely expensive stable components
- `useMemo` for genuinely expensive derived calculations
- `useCallback` when stable callback identity matters
- `useTransition` for expensive non-urgent UI state transitions

Do not add memoization everywhere without evidence.

---

# 11. Worker Rules

Worker is a bonus/optimization layer.

Move expensive CPU work there when useful.

Main thread should remain responsible for:

- UI
- user interaction
- Canvas presentation
- lightweight coordination

Worker can handle:

- filtering
- aggregation
- LOD
- data transformations

Always terminate workers during cleanup.

---

# 12. Virtualization Rules

The table must not create thousands of DOM rows unnecessarily.

Only render rows visible in the viewport plus a small overscan.

If implementing custom virtualization:

```text
scrollTop
    ↓
firstVisibleIndex
    ↓
visibleRows
    ↓
render only visible rows
```

Keep row height predictable where possible.

---

# 13. Memory Safety

Every long-lived resource must have cleanup:

- `setInterval` / `setTimeout`
- `requestAnimationFrame`
- event listeners
- `ResizeObserver`
- Web Worker
- WebSocket if introduced

Every `useEffect` that creates a resource should return cleanup.

Never retain obsolete large arrays.

Never let the live data buffer grow indefinitely.

---

# 14. No Unnecessary Backend

The MVP does NOT require a database.

The assignment asks for simulated realistic time-series data.

Do not add:

- PostgreSQL
- MongoDB
- MySQL
- Redis
- authentication
- persistent history

unless requirements change.

A Next.js route handler may be included if useful for demonstrating the required architecture, but the primary real-time simulation can run client-side.

Do not build a persistent 24/7 backend for the MVP.

---

# 15. UI Requirements

Build a professional but simple dashboard.

Recommended layout:

```text
+-------------------------------------------------------+
| Dashboard                  LIVE ●                     |
+-------------------------------------------------------+
| Points | FPS | Render | Processing | Memory          |
+-------------------------------------------------------+
| Load: 10k  25k  50k   Update: 100ms   Stress Test    |
+-------------------------------------------------------+
| Filters | Time Range | Aggregation | Chart Type      |
+-------------------------------------------------------+
|                                                       |
|                    Main Chart                         |
|                                                       |
+-------------------------------------------------------+
|                                                       |
|                    Secondary Chart                    |
|                                                       |
+-------------------------------------------------------+
|                    Virtual Table                     |
+-------------------------------------------------------+
```

Responsive behavior matters, but do not spend excessive time on decorative styling.

---

# 16. Performance Acceptance Criteria

The assignment target is:

```text
10,000+ points → 60 FPS target
```

Also target:

```text
interaction response < 100ms
memory growth < 1MB/hour target
```

Treat these as measured goals, not guarantees.

For stretch testing:

```text
50,000 → 30 FPS minimum target
100,000 → 15 FPS+ usable target
```

Performance varies by browser/device.

Never fabricate benchmark results.

---

# 17. Development Schedule — TODAY

Assume approximately **6–8 focused hours** available.

## Task 0 — Project bootstrap
**Time: 20–30 min**

- Initialize Next.js
- TypeScript
- App Router
- Clean default files
- Verify `npm run dev`

**Checkpoint:** app starts successfully.

---

## Task 1 — Types + data generator
**Time: 45–60 min**

Build:

- `DataPoint`
- chart types
- viewport
- metrics
- realistic generator
- configurable point count

**Checkpoint:** generate 10k points and inspect them.

---

## Task 2 — Bounded data buffer + stream
**Time: 45–60 min**

Build:

- initial 10k dataset
- 100ms update simulation
- sliding window
- start/pause
- load control

**Checkpoint:** live data changes without unbounded growth.

---

## Task 3 — Canvas rendering engine
**Time: 60–90 min**

Build:

- Canvas setup
- resize
- devicePixelRatio
- coordinate transforms
- requestAnimationFrame
- basic line renderer

**Checkpoint:** 10k points visible smoothly.

---

## Task 4 — Performance monitor
**Time: 30–45 min**

Build:

- FPS calculation
- render timing
- processing timing
- point count
- memory when supported

**Checkpoint:** real metrics visible in UI.

---

## Task 5 — Line chart optimization
**Time: 45–60 min**

Implement:

- dirty rendering
- viewport
- basic LOD if needed
- minimize React involvement

**Checkpoint:** 10k points + 100ms updates approaches/stays near 60 FPS on development hardware.

---

## Task 6 — Interaction
**Time: 60–75 min**

Implement:

- zoom
- pan
- time range
- filtering
- aggregation

Prioritize functionality over visual perfection.

**Checkpoint:** user can interact without obvious UI freezing.

---

## Task 7 — Remaining charts
**Time: 75–90 min**

Implement:

- bar
- scatter
- heatmap

Reuse the rendering/coordinate infrastructure.

**Checkpoint:** all required chart types work.

---

## Task 8 — Virtualized table
**Time: 30–45 min**

Build a simple virtualized table.

**Checkpoint:** large datasets do not create thousands of DOM rows.

---

## Task 9 — UI polish + responsive layout
**Time: 45–60 min**

Add:

- clean dashboard layout
- controls
- responsive behavior
- loading/empty states
- error handling where practical

**Checkpoint:** looks like a finished MVP.

---

## Task 10 — Production validation
**Time: 30–45 min**

Run:

```bash
npm run build
npm start
```

Test:

- 10k
- 25k
- 50k if feasible
- continuous updates
- zoom/pan
- filters
- charts
- table

**Checkpoint:** production build works.

---

# 18. Time Management Rules

The MVP has priority tiers.

### P0 — MUST SHIP

- project setup
- data generation
- data stream
- bounded buffer
- Canvas
- line chart
- 10k points
- real-time updates
- FPS monitor
- all four chart types
- core controls
- table
- production build

### P1 — STRONGLY PREFERRED

- LOD
- Web Worker
- better virtualization
- polished performance monitor
- 25k/50k stress mode
- excellent zoom/pan

### P2 — ONLY IF TIME REMAINS

- OffscreenCanvas
- Service Worker
- PWA
- advanced streaming
- Server Actions
- Middleware
- sophisticated animations
- advanced bundle analysis

**Never work on P2 while P0 is incomplete.**

---

# 19. Agent Operating Rules

Claude Code should:

1. Inspect the current repository before changing it.
2. Preserve working code.
3. Make small, coherent changes.
4. Run TypeScript/lint/build checks after meaningful milestones.
5. Avoid introducing unnecessary dependencies.
6. Never add Chart.js or D3.
7. Prefer browser-native APIs.
8. Keep components small and responsibility-focused.
9. Use strict TypeScript.
10. Explain architectural changes briefly before large refactors.
11. Fix root causes rather than hiding errors.
12. Do not fabricate benchmark results.
13. Do not claim a performance target was met without measuring it.
14. Do not add a database unless explicitly requested.
15. Do not switch to Vue.
16. Do not spend time on optional features before MVP completion.

---

# 20. Dependency Rules

Keep dependencies minimal.

Before installing a package, ask:

- Is it necessary?
- Can the browser/React/Next.js API do this?
- Does it interfere with the assignment's intent?
- Does it increase bundle size?
- Can we implement the functionality simply ourselves?

Do NOT install:

- Chart.js
- D3
- other charting libraries

Virtualization libraries should only be considered if custom virtualization would consume too much time; the assignment is explicitly interested in performance implementation, so custom virtualization is preferred if feasible.

---

# 21. Testing Strategy

After each major task:

```text
1. TypeScript check
2. Lint
3. Run app
4. Verify feature
5. Check console
```

Before submission:

```text
npm run build
npm start
```

Then benchmark in production mode.

Performance testing should include:

```text
10k @ 100ms
25k @ 100ms
50k @ 100ms
```

If supported:

```text
100k stress test
```

Record actual observations for `PERFORMANCE.md`.

---

# 22. What To Do If Performance Fails

Do NOT immediately rewrite the project.

Follow this order:

### 1. Measure

Find whether the bottleneck is:

- React rendering
- data processing
- Canvas drawing
- DOM/table
- memory allocation
- event handling

### 2. Reduce React work

- refs for high-frequency data
- memoize expensive components
- avoid unnecessary state updates

### 3. Reduce drawing work

- LOD
- fewer draw calls
- dirty rendering
- viewport culling

### 4. Move computation

Use Web Worker.

### 5. Reduce allocations

Reuse buffers where practical.

### 6. Only then consider advanced APIs

OffscreenCanvas/WebGL are not MVP requirements.

---

# 23. Definition of Done for TODAY

The MVP is done when:

```text
[✓] App loads
[✓] 10k realistic points render
[✓] Data updates every 100ms
[✓] Canvas is used for dense charts
[✓] Line chart works
[✓] Bar chart works
[✓] Scatter works
[✓] Heatmap works
[✓] Zoom works
[✓] Pan works
[✓] Filtering works
[✓] Time range works
[✓] Aggregation works
[✓] Virtualized table works
[✓] FPS monitor works
[✓] Memory monitor works where supported
[✓] Load controls work
[✓] No obvious memory leak
[✓] No prohibited chart libraries
[✓] Production build works
```

If these are complete, **STOP adding features and move to benchmarking/documentation.**

---

# 24. Tomorrow / September 11

After MVP completion:

1. Profile with Chrome DevTools.
2. Profile with React DevTools Profiler.
3. Identify bottlenecks.
4. Add/fix Web Worker processing.
5. Improve LOD.
6. Improve 50k performance.
7. Improve interaction latency.
8. Improve responsive UX.
9. Fix memory issues.
10. Prepare benchmark evidence.

---

# 25. September 12 — Submission

Do NOT plan major development for the final day.

Use it for:

- final testing
- bug fixes
- production deployment
- README
- PERFORMANCE.md
- screenshots
- Git history cleanup
- final benchmark measurements

Deployment target:

```text
GitHub → Vercel → production demo
```

---

# 26. Interview Story

The project should be explainable as:

> "I separated high-frequency data processing from React's UI rendering. The dashboard maintains a bounded sliding data window, uses Canvas for high-density visualization, SVG/HTML for UI overlays, requestAnimationFrame for rendering, and Web Workers for expensive data transformations. I measured FPS, render time, processing time and memory instead of assuming the implementation was performant."

Be prepared to explain:

- Why Canvas instead of SVG for dense data?
- Why not put the entire dataset in React state?
- Why requestAnimationFrame?
- Why a sliding window?
- Why Web Workers?
- How does zoom/pan work?
- How does aggregation work?
- How does virtualization work?
- What happens at 100k/1M points?
- How would you make the stream truly real-time?
- How would you scale the backend?
- How would you support offline mode?

---

# 27. Final Instruction to the Coding Agent

**Build the smallest technically strong MVP first.**

Do not over-engineer.

Do not spend time making the dashboard beautiful before proving:

```text
10,000 points
+
100ms updates
+
Canvas
+
60 FPS target
```

The performance architecture is the core of the assignment.

When forced to choose between:

```text
beautiful feature
```

and

```text
performance/correctness
```

choose:

**performance/correctness.**

When forced to choose between:

```text
bonus feature
```

and

```text
required feature
```

choose:

**required feature.**

When performance is uncertain:

**measure it.**

When something is broken:

**find the root cause.**

When the MVP is complete:

**stop feature development and benchmark it.**
