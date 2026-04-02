"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SparklesIcon, Loader2, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { apiFetch, useApiHeaders } from "@/hooks/use-api";
import { useOrgStore } from "@/stores/org-store";
import type { AISummary, SummaryStatus } from "@/types/index";

interface AISummaryProps {
  noteId: string;
  noteTitle: string;
}

function StatusBadge({ status }: { status: SummaryStatus }) {
  const map: Record<SummaryStatus, { label: string; className: string }> = {
    pending: {
      label: "Pending",
      className:
        "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
    },
    accepted: {
      label: "Accepted",
      className:
        "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20",
    },
    rejected: {
      label: "Rejected",
      className:
        "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20",
    },
  };
  const { label, className } = map[status];
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}

function SummaryCard({
  summary,
  onAccept,
  onReject,
  actioning,
}: {
  summary: AISummary;
  onAccept?: () => Promise<void>;
  onReject?: () => Promise<void>;
  actioning?: boolean;
}) {
  const { overview, key_points, action_items, tags_suggested } = summary.summary;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <SparklesIcon className="size-4 text-primary" />
            AI Summary
          </CardTitle>
          <StatusBadge status={summary.status} />
        </div>
        <p className="text-xs text-muted-foreground">
          Generated {new Date(summary.generated_at).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {" "}· v{summary.version_number}
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Overview */}
        {overview && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Overview
            </p>
            <p className="text-sm leading-relaxed">{overview}</p>
          </div>
        )}

        {/* Key points */}
        {key_points && key_points.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Key Points
            </p>
            <ul className="flex flex-col gap-1">
              {key_points.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 size-1.5 rounded-full bg-primary shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action items */}
        {action_items && action_items.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Action Items
            </p>
            <ul className="flex flex-col gap-1">
              {action_items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1 text-primary">&#x2713;</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Suggested tags */}
        {tags_suggested && tags_suggested.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Suggested Tags
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tags_suggested.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Accept/Reject actions for pending */}
        {summary.status === "pending" && onAccept && onReject && (
          <>
            <Separator />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={onAccept}
                disabled={actioning}
              >
                {actioning && <Loader2 className="size-4 animate-spin" />}
                Accept
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onReject}
                disabled={actioning}
              >
                Reject
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AISummarySkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-3 w-40" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </CardContent>
    </Card>
  );
}

export function AISummary({ noteId, noteTitle }: AISummaryProps) {
  const headers = useApiHeaders();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const queryClient = useQueryClient();

  const [generating, setGenerating] = React.useState(false);
  const [actioning, setActioning] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["ai-summary", noteId, activeOrgId],
    queryFn: () => apiFetch(`/api/ai/summary?note_id=${noteId}`, { headers }),
    enabled: !!activeOrgId && !!noteId,
  });

  const summaries: AISummary[] = data?.summaries ?? (data?.summary ? [data.summary] : []);
  // Sort: most recent first
  const sorted = [...summaries].sort(
    (a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()
  );

  const latest = sorted[0];
  const history = sorted.slice(1);

  async function handleGenerate() {
    if (!activeOrgId) return;
    setGenerating(true);
    try {
      await apiFetch("/api/ai/summary", {
        method: "POST",
        headers,
        body: JSON.stringify({ note_id: noteId }),
      });
      toast.success("Summary generated");
      queryClient.invalidateQueries({ queryKey: ["ai-summary", noteId] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate summary";
      if (message.includes("429") || message.toLowerCase().includes("rate limit")) {
        toast.error("Rate limit reached. Please wait before generating another summary.");
      } else {
        toast.error(message);
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleAction(summaryId: string, action: "accept" | "reject") {
    setActioning(true);
    try {
      await apiFetch("/api/ai/summary", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ summary_id: summaryId, action }),
      });
      toast.success(action === "accept" ? "Summary accepted" : "Summary rejected");
      queryClient.invalidateQueries({ queryKey: ["ai-summary", noteId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action} summary`);
    } finally {
      setActioning(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">AI Summary</h3>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={generating || !activeOrgId}
          aria-label={`Generate AI summary for ${noteTitle}`}
        >
          {generating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <SparklesIcon className="size-4" />
          )}
          {generating ? "Generating…" : "Generate Summary"}
        </Button>
      </div>

      {isLoading && <AISummarySkeleton />}

      {!isLoading && !latest && (
        <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            No summary yet. Click &ldquo;Generate Summary&rdquo; to create one.
          </p>
        </div>
      )}

      {!isLoading && latest && (
        <SummaryCard
          summary={latest}
          onAccept={
            latest.status === "pending"
              ? () => handleAction(latest.id, "accept")
              : undefined
          }
          onReject={
            latest.status === "pending"
              ? () => handleAction(latest.id, "reject")
              : undefined
          }
          actioning={actioning}
        />
      )}

      {!isLoading && history.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
          >
            {showHistory ? (
              <ChevronUpIcon className="size-3.5" />
            ) : (
              <ChevronDownIcon className="size-3.5" />
            )}
            {showHistory ? "Hide" : "Show"} {history.length} previous summar{history.length === 1 ? "y" : "ies"}
          </button>

          {showHistory && (
            <div className="flex flex-col gap-2">
              {history.map((s) => (
                <SummaryCard key={s.id} summary={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
