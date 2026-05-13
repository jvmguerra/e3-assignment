"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "flex flex-col gap-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-semibold",
        nav: "flex items-center gap-1",
        nav_button:
          "inline-flex items-center justify-center size-7 rounded-md border border-border hover:bg-muted text-sm",
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-xs",
        row: "flex w-full mt-1",
        cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 size-9",
        day: "inline-flex size-9 items-center justify-center rounded-md hover:bg-muted aria-selected:bg-primary aria-selected:text-primary-foreground",
        day_today: "border border-ring",
        day_outside: "text-muted-foreground/40",
        day_disabled: "text-muted-foreground/30 cursor-not-allowed",
        ...classNames,
      }}
      {...props}
    />
  );
}
