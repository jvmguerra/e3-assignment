"use client";

import * as React from "react";
import { createChart, HistogramSeries, type IChartApi } from "lightweight-charts";
import { useTheme } from "next-themes";

interface HistogramChartProps {
  data: Array<{ time: string; value: number; color?: string }>;
  height?: number;
}

export function HistogramChart({ data, height = 250 }: HistogramChartProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const { theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!mounted || !containerRef.current) return;

    const isDark = theme === "dark";
    const container = containerRef.current;

    const chart = createChart(container, {
      height,
      layout: {
        background: { color: "transparent" },
        textColor: isDark ? "#a1a1aa" : "#71717a",
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: isDark ? "#27272a" : "#f4f4f5" },
        horzLines: { color: isDark ? "#27272a" : "#f4f4f5" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
    });
    chartRef.current = chart;

    const series = chart.addSeries(HistogramSeries, {
      color: isDark ? "#8b5cf6" : "#7c3aed",
    });

    series.setData(data);
    chart.timeScale().fitContent();

    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      chart.applyOptions({ width });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, height, theme, mounted]);

  if (!mounted) {
    return <div style={{ height }} className="animate-pulse rounded-lg bg-muted" />;
  }

  return <div ref={containerRef} className="w-full" />;
}
