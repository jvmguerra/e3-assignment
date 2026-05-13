"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TrashIcon, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, useApiHeaders } from "@/hooks/use-api";
import { useOrgStore } from "@/stores/org-store";
import { RecurringForm } from "@/components/finance/recurring-form";
import {
  expandRecurring,
  firstOfMonthIso,
  lastOfMonthIso,
} from "@/lib/finance/recurring";
import type { FinanceRecurring } from "@/types/index";

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function FinanceCalendarPage() {
  const headers = useApiHeaders();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const queryClient = useQueryClient();
  const [visibleMonth, setVisibleMonth] = React.useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(new Date());
  const [detecting, setDetecting] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["finance", "recurring", activeOrgId],
    queryFn: () => apiFetch("/api/finance/recurring", { headers }),
    enabled: !!activeOrgId,
  });

  const recurring: FinanceRecurring[] = React.useMemo(
    () => data?.recurring ?? [],
    [data]
  );

  const monthIso = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, "0")}`;
  const occurrences = React.useMemo(
    () => expandRecurring(recurring, firstOfMonthIso(monthIso), lastOfMonthIso(monthIso)),
    [recurring, monthIso]
  );

  const occByDate = React.useMemo(() => {
    const m: Record<string, typeof occurrences> = {};
    for (const o of occurrences) {
      if (!m[o.date]) m[o.date] = [];
      m[o.date].push(o);
    }
    return m;
  }, [occurrences]);

  const selectedIso = selectedDate ? toIso(selectedDate) : null;
  const selectedOccs = selectedIso ? occByDate[selectedIso] ?? [] : [];

  const monthTotals: Record<string, number> = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of occurrences) m[o.currency] = (m[o.currency] ?? 0) + o.amount;
    return m;
  }, [occurrences]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await apiFetch(`/api/finance/recurring/${id}`, { method: "DELETE", headers });
      toast.success("Removed");
      queryClient.invalidateQueries({ queryKey: ["finance", "recurring"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDetect() {
    setDetecting(true);
    try {
      const res = await apiFetch("/api/finance/patterns", { method: "POST", headers });
      const count = (res.patterns ?? []).length;
      if (count === 0) {
        toast.info("No patterns detected. Upload more statements first.");
      } else {
        toast.success(`${count} pattern${count === 1 ? "" : "s"} ready for review`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Detection failed");
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Fixed and recurring spendings. Add manually or detect patterns from uploaded statements.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleDetect} disabled={detecting}>
            {detecting && <Loader2 className="size-4 animate-spin" />}
            Detect from documents
          </Button>
          <RecurringForm />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center justify-between">
                <span>
                  {visibleMonth.toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                  })}
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {Object.entries(monthTotals)
                    .map(
                      ([c, v]) =>
                        `${c} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    )
                    .join(" · ") || "no recurring entries"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-80 w-full rounded-lg" />
              ) : (
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  month={visibleMonth}
                  onMonthChange={setVisibleMonth}
                  modifiers={{
                    hasOccurrence: Object.keys(occByDate).map(
                      (d) => new Date(d + "T00:00:00Z")
                    ),
                  }}
                  modifiersClassNames={{
                    hasOccurrence:
                      "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:size-1.5 after:rounded-full after:bg-primary",
                  }}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                {selectedDate
                  ? selectedDate.toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })
                  : "Select a day"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedOccs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recurring entries on this day.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {selectedOccs.map((o) => {
                    const rule = recurring.find((r) => r.id === o.recurring_id);
                    return (
                      <div
                        key={o.recurring_id + o.date}
                        className="flex items-start justify-between gap-2 rounded-lg border p-2 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{o.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {o.currency}{" "}
                            {o.amount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            · {o.category}
                          </p>
                          {rule?.source === "detected" && (
                            <Badge variant="secondary" className="mt-1 text-xs">
                              detected
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDelete(o.recurring_id)}
                          disabled={deletingId === o.recurring_id}
                          aria-label="Remove"
                        >
                          {deletingId === o.recurring_id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <TrashIcon className="size-4 text-destructive" />
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-4 text-xs text-muted-foreground">
                <Link className="underline" href="/finance/patterns">
                  Review AI-detected patterns →
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
