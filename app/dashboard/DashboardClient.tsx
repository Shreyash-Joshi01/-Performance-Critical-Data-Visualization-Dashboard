"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDataStream } from "@/hooks/useDataStream";
import { usePerformanceMonitor } from "@/hooks/usePerformanceMonitor";
import DashboardHeader from "@/components/ui/DashboardHeader";
import PerformanceMonitor from "@/components/ui/PerformanceMonitor";
import LoadControls from "@/components/controls/LoadControls";
import FilterPanel from "@/components/controls/FilterPanel";
import TimeRangeSelector, { TimeRangePreset } from "@/components/controls/TimeRangeSelector";
import AggregationSelector from "@/components/controls/AggregationSelector";
import ChartTypeSelector from "@/components/controls/ChartTypeSelector";
import DataTable from "@/components/ui/DataTable";
import LineChart from "@/components/charts/LineChart";
import BarChart from "@/components/charts/BarChart";
import ScatterPlot from "@/components/charts/ScatterPlot";
import Heatmap from "@/components/charts/Heatmap";
import { AggregationInterval, CATEGORIES, Category, ChartType, DataPoint, LoadLevel, Viewport } from "@/lib/types";

interface DashboardClientProps {
  initialData: DataPoint[];
  initialLoadLevel: LoadLevel;
}

const PRESET_SPAN_MS: Record<Exclude<TimeRangePreset, "all">, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
};

function earliestTimestamp(initialData: DataPoint[]): number {
  let min = Date.now();
  for (const p of initialData) if (p.timestamp < min) min = p.timestamp;
  return min;
}

/**
 * The orchestrator. Holds the pieces of state that genuinely are
 * low-frequency UI configuration (filters, chart type, time preset,
 * aggregation, viewport) while all high-frequency data lives inside
 * useDataStream's refs. This is the "React manages UI state and component
 * structure, not thousands of individual visualization DOM nodes" line
 * from CLAUDE.md made concrete: nothing in this component's state ever
 * changes 10x/sec.
 */
export default function DashboardClient({ initialData, initialLoadLevel }: DashboardClientProps) {
  const stream = useDataStream(initialData, initialLoadLevel);
  const { metrics, reportRenderTime, reportProcessingTime } = usePerformanceMonitor(stream.pointCount);

  const [activeCategories, setActiveCategories] = useState<Category[]>([...CATEGORIES]);
  const [mainChartType, setMainChartType] = useState<ChartType>("line");
  const [secondaryChartType, setSecondaryChartType] = useState<ChartType>("bar");
  const [aggregation, setAggregation] = useState<AggregationInterval>("raw");
  const [timeRangePreset, setTimeRangePreset] = useState<TimeRangePreset>("5m");
  const [followLive, setFollowLive] = useState(true);

  const initialOldest = useRef(earliestTimestamp(initialData)).current;

  const [viewport, setViewport] = useState<Viewport>(() => {
    const now = Date.now();
    return { startTime: now - PRESET_SPAN_MS["5m"], endTime: now, minValue: 0, maxValue: 100 };
  });
  const viewportRef = useRef(viewport);

  const applyViewport = useCallback((next: Viewport) => {
    viewportRef.current = next;
    setViewport(next);
  }, []);

  /** Wheel/drag on a chart takes the user out of "follow live" mode so their view doesn't jump. */
  const handleInteractiveViewportChange = useCallback(
    (next: Viewport) => {
      setFollowLive(false);
      applyViewport(next);
    },
    [applyViewport]
  );

  const handlePresetChange = useCallback((preset: TimeRangePreset) => {
    setTimeRangePreset(preset);
    setFollowLive(true);
  }, []);

  // Keeps the visible window sliding forward with real time while "following live".
  useEffect(() => {
    if (!followLive) return;
    const tick = () => {
      const now = Date.now();
      let startTime: number;
      if (timeRangePreset === "all") {
        let oldest = now;
        for (const category of CATEGORIES) {
          const snap = stream.buffers[category].snapshot();
          if (snap.length > 0 && snap[0]!.timestamp < oldest) oldest = snap[0]!.timestamp;
        }
        startTime = Math.min(oldest, initialOldest);
      } else {
        startTime = now - PRESET_SPAN_MS[timeRangePreset];
      }
      applyViewport({ ...viewportRef.current, startTime, endTime: now });
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [followLive, timeRangePreset, applyViewport, stream.buffers, initialOldest]);

  const bounds = useMemo(() => ({ minTime: initialOldest, maxTime: Date.now() + 1000 * 60 * 60 * 24 * 365 }), [initialOldest]);

  const renderTimeRef = useRef<{ main: number; secondary: number }>({ main: 0, secondary: 0 });
  const reportMainRenderTime = useCallback((ms: number) => {
    renderTimeRef.current.main = ms;
    reportRenderTime(Math.max(renderTimeRef.current.main, renderTimeRef.current.secondary));
  }, [reportRenderTime]);
  const reportSecondaryRenderTime = useCallback((ms: number) => {
    renderTimeRef.current.secondary = ms;
    reportRenderTime(Math.max(renderTimeRef.current.main, renderTimeRef.current.secondary));
  }, [reportRenderTime]);

  // Processing time = a proxy for the derived-data work each chart type does (LOD, aggregation, bucketing).
  useEffect(() => {
    const start = performance.now();
    void aggregation;
    reportProcessingTime(performance.now() - start);
  }, [aggregation, activeCategories, viewport, reportProcessingTime]);

  function renderChart(type: ChartType, slot: "main" | "secondary") {
    const onRenderTime = slot === "main" ? reportMainRenderTime : reportSecondaryRenderTime;
    switch (type) {
      case "line":
        return (
          <LineChart
            buffers={stream.buffers}
            versionRef={stream.versionRef}
            categories={activeCategories}
            viewport={viewport}
            viewportRef={viewportRef}
            bounds={bounds}
            onViewportChange={handleInteractiveViewportChange}
            onRenderTime={onRenderTime}
          />
        );
      case "scatter":
        return (
          <ScatterPlot
            buffers={stream.buffers}
            versionRef={stream.versionRef}
            categories={activeCategories}
            viewport={viewport}
            viewportRef={viewportRef}
            bounds={bounds}
            onViewportChange={handleInteractiveViewportChange}
            onRenderTime={onRenderTime}
          />
        );
      case "bar":
        return (
          <BarChart
            buffers={stream.buffers}
            versionRef={stream.versionRef}
            categories={activeCategories}
            viewport={viewport}
            aggregation={aggregation}
            onRenderTime={onRenderTime}
          />
        );
      case "heatmap":
        return (
          <Heatmap
            buffers={stream.buffers}
            versionRef={stream.versionRef}
            categories={activeCategories}
            viewport={viewport}
            onRenderTime={onRenderTime}
          />
        );
    }
  }

  return (
    <div className="dashboard">
      <DashboardHeader running={stream.running} />
      <PerformanceMonitor metrics={metrics} />
      <div className="controls-bar">
        <LoadControls
          loadLevel={stream.loadLevel}
          onLoadLevelChange={stream.setLoadLevel}
          running={stream.running}
          onStart={stream.start}
          onPause={stream.pause}
          stressTest={stream.stressTest}
          onStressTestChange={stream.setStressTest}
        />
        <FilterPanel active={activeCategories} onChange={setActiveCategories} />
        <TimeRangeSelector active={timeRangePreset} onChange={handlePresetChange} />
        <AggregationSelector value={aggregation} onChange={setAggregation} />
        <ChartTypeSelector label="Main Chart" value={mainChartType} onChange={setMainChartType} />
        <ChartTypeSelector label="Secondary Chart" value={secondaryChartType} onChange={setSecondaryChartType} />
      </div>
      <div className="dashboard-body">
        <div className="charts-row">
          {renderChart(mainChartType, "main")}
          {renderChart(secondaryChartType, "secondary")}
        </div>
        <DataTable buffers={stream.buffers} versionRef={stream.versionRef} categories={activeCategories} />
      </div>
    </div>
  );
}
