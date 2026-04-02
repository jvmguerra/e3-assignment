"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileTextIcon,
  UsersIcon,
  PaperclipIcon,
  SparklesIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatCard } from "@/components/dashboard/stat-card";
import { AreaChart } from "@/components/dashboard/area-chart";
import { HistogramChart } from "@/components/dashboard/histogram-chart";
import { AIInsight } from "@/components/dashboard/ai-insight";
import { apiFetch, useApiHeaders } from "@/hooks/use-api";
import { useOrgStore } from "@/stores/org-store";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function DashboardPage() {
  const headers = useApiHeaders();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", activeOrgId],
    queryFn: () => apiFetch("/api/dashboard", { headers }),
    enabled: !!activeOrgId,
    staleTime: 60 * 1000,
  });

  if (!activeOrgId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <p className="text-muted-foreground">Select an organization to view the dashboard.</p>
      </div>
    );
  }

  const stats = data?.stats;
  const acceptanceRate = stats && stats.summaries_count > 0
    ? Math.round((stats.summaries_accepted / stats.summaries_count) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your organization&apos;s activity.</p>
      </div>

      {/* Row 1: Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-4 p-5">
                <Skeleton className="size-10 rounded-lg" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-7 w-20" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              title="Total Notes"
              value={stats?.notes_count?.toLocaleString() ?? "0"}
              icon={FileTextIcon}
            />
            <StatCard
              title="Team Members"
              value={stats?.members_count ?? 0}
              icon={UsersIcon}
            />
            <StatCard
              title="Files"
              value={stats?.files_count ?? 0}
              subtitle={formatBytes(stats?.files_total_size ?? 0)}
              icon={PaperclipIcon}
            />
            <StatCard
              title="AI Summaries"
              value={stats?.summaries_count ?? 0}
              subtitle={`${acceptanceRate}% accepted`}
              icon={SparklesIcon}
            />
          </>
        )}
      </div>

      {/* Row 2: Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Notes Created (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full rounded-lg" />
            ) : (
              <AreaChart data={data?.notes_by_day ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Activity (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full rounded-lg" />
            ) : (
              <HistogramChart data={data?.activity_by_day ?? []} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Insights */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Top Tags */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top Tags</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {(data?.top_tags ?? []).map((t: { tag: string; count: number }, i: number) => (
                  <div key={t.tag} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground font-mono w-4">{i + 1}</span>
                      <Badge variant="secondary" className="truncate">{t.tag}</Badge>
                    </div>
                    <span className="text-sm tabular-nums text-muted-foreground">{t.count}</span>
                  </div>
                ))}
                {(data?.top_tags ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No tags yet.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Contributors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top Contributors</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton className="size-6 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {(data?.top_contributors ?? []).map((c: { display_name: string; email: string; count: number }) => {
                  const name = c.display_name || c.email;
                  const initials = name.slice(0, 2).toUpperCase();
                  return (
                    <div key={c.email} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar size="sm">
                          <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm truncate">{name}</span>
                      </div>
                      <span className="text-sm tabular-nums text-muted-foreground">{c.count} notes</span>
                    </div>
                  );
                })}
                {(data?.top_contributors ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No contributors yet.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Insight */}
        <AIInsight />
      </div>
    </div>
  );
}
