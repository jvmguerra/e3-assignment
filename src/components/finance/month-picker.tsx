"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MonthPickerProps {
  value: string; // YYYY-MM
  onChange: (next: string) => void;
}

export function MonthPicker({ value, onChange }: MonthPickerProps) {
  const [y, m] = value.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });

  function shift(delta: number) {
    const d = new Date(Date.UTC(y, m - 1, 1));
    d.setUTCMonth(d.getUTCMonth() + delta);
    onChange(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    );
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border bg-card p-1">
      <Button variant="ghost" size="icon-sm" onClick={() => shift(-1)} aria-label="Previous month">
        <ChevronLeftIcon className="size-4" />
      </Button>
      <span className="px-3 text-sm font-medium tabular-nums">{label}</span>
      <Button variant="ghost" size="icon-sm" onClick={() => shift(1)} aria-label="Next month">
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  );
}

export function currentMonthIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
