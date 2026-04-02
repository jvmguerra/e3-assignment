"use client";

import * as React from "react";
import { createChart, AreaSeries, type IChartApi } from "lightweight-charts";
import { useTheme } from "next-themes";

interface AreaChartProps {
  data: Array<{ time: string; value: number }>;
  height?: number;
  color?: string;
}

export function AreaChart({ data, height = 250, color }: AreaChartProps) {
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
      crosshair: {
        horzLine: { visible: false },
      },
    });
    chartRef.current = chart;

    const series = chart.addSeries(AreaSeries, {
      lineColor: color ?? (isDark ? "#3b82f6" : "#2563eb"),
      topColor: color ? `${color}40` : (isDark ? "#3b82f640" : "#2563eb40"),
      bottomColor: color ? `${color}05` : (isDark ? "#3b82f605" : "#2563eb05"),
      lineWidth: 2,
    });

    series.setData(data);
    chart.timeScale().fitContent();

    // Handle resize
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
  }, [data, height, color, theme, mounted]);

  if (!mounted) {
    return <div style={{ height }} className="animate-pulse rounded-lg bg-muted" />;
  }

  return <div ref={containerRef} className="w-full" />;
}
