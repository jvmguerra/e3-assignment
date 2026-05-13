"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, CheckIcon, XIcon, SparklesIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, useApiHeaders } from "@/hooks/use-api";
import { useOrgStore } from "@/stores/org-store";
import type { FinancePattern } from "@/types/index";

export default function FinancePatternsPage() {
  const headers = useApiHeaders();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const queryClient = useQueryClient();
  const [actingId, setActingId] = React.useState<string | null>(null);
  const [detecting, setDetecting] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["finance", "patterns", activeOrgId],
    queryFn: () => apiFetch("/api/finance/patterns", { headers }),
    enabled: !!activeOrgId,
  });

  const patterns: FinancePattern[] = data?.patterns ?? [];

  async function handleAction(p: FinancePattern, action: "approve" | "reject") {
    setActingId(p.id);
    try {
      await apiFetch(`/api/finance/patterns/${p.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ action }),
      });
      toast.success(action === "approve" ? "Added to calendar" : "Rejected");
      queryClient.invalidateQueries({ queryKey: ["finance"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setActingId(null);
    }
  }

  async function handleDetect() {
    setDetecting(true);
    try {
      const res = await apiFetch("/api/finance/patterns", { method: "POST", headers });
      const count = (res.patterns ?? []).length;
      if (count === 0) toast.info("No new patterns detected.");
      else toast.success(`${count} new pattern${count === 1 ? "" : "s"}`);
      queryClient.invalidateQueries({ queryKey: ["finance", "patterns"] });
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
          <h1 className="text-2xl font-bold">Recurring patterns</h1>
          <p className="text-sm text-muted-foreground">
            AI-proposed recurring charges awaiting your approval. Approved patterns appear on the calendar.
          </p>
        </div>
        <Button variant="outline" onClick={handleDetect} disabled={detecting}>
          {detecting ? <Loader2 className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
          Re-run detection
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {isLoading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)
        ) : patterns.length === 0 ? (
          <Card className="sm:col-span-2">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-2">
              <SparklesIcon className="size-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">No pending patterns</p>
              <p className="text-sm text-muted-foreground">
                Run detection after uploading and extracting at least two months of statements.
              </p>
            </CardContent>
          </Card>
        ) : (
          patterns.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="text-sm flex items-baseline justify-between gap-2">
                  <span>{p.proposed.label}</span>
                  <Badge variant="secondary" className="text-xs">
                    {(p.confidence * 100).toFixed(0)}% confidence
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="text-sm">
                  <span className="font-mono">
                    {p.proposed.currency}{" "}
                    {p.proposed.amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>{" "}
                  · {p.proposed.cadence}
                  {p.proposed.day_of_month
                    ? ` (day ${p.proposed.day_of_month})`
                    : ""}{" "}
                  · {p.proposed.category}
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.proposed.sample_transaction_ids.length} matching transaction
                  {p.proposed.sample_transaction_ids.length === 1 ? "" : "s"}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleAction(p, "approve")}
                    disabled={actingId === p.id}
                  >
                    {actingId === p.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <CheckIcon className="size-3" />
                    )}
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAction(p, "reject")}
                    disabled={actingId === p.id}
                  >
                    <XIcon className="size-3" />
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
