"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { SparklesIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, useApiHeaders } from "@/hooks/use-api";
import { useOrgStore } from "@/stores/org-store";

export function AIInsight() {
  const headers = useApiHeaders();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-insight", activeOrgId],
    queryFn: () => apiFetch("/api/dashboard/insight", { headers }),
    enabled: !!activeOrgId,
    staleTime: 5 * 60 * 1000, // 5 min cache on client too
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <SparklesIcon className="size-4 text-primary" />
            AI Insight
          </CardTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh insight"
          >
            <RefreshCwIcon className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {data?.insight ?? "No insight available."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
