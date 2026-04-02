"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, GitCompareArrowsIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DiffViewer } from "@/components/notes/diff-viewer";
import { apiFetch, useApiHeaders } from "@/hooks/use-api";
import { useOrgStore } from "@/stores/org-store";
import type { NoteVersion } from "@/types/index";

function VersionsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3 border-b">
          <Skeleton className="size-4" />
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export default function VersionsPage() {
  const params = useParams<{ id: string }>();
  const noteId = params.id;
  const headers = useApiHeaders();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  // Track expanded rows
  const [expandedVersionId, setExpandedVersionId] = React.useState<string | null>(null);
  // Track the two selected versions for diff
  const [selectedVersionIds, setSelectedVersionIds] = React.useState<string[]>([]);
  // Track whether to show the diff panel
  const [showDiff, setShowDiff] = React.useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["note-versions", noteId, activeOrgId],
    queryFn: () => apiFetch(`/api/notes/${noteId}/versions`, { headers }),
    enabled: !!activeOrgId && !!noteId,
  });

  const versions: NoteVersion[] = data?.versions ?? [];

  function toggleExpand(versionId: string) {
    setExpandedVersionId((prev) => (prev === versionId ? null : versionId));
    // Hide diff when expanding a row
    setShowDiff(false);
  }

  function toggleSelect(versionId: string) {
    setSelectedVersionIds((prev) => {
      if (prev.includes(versionId)) {
        return prev.filter((id) => id !== versionId);
      }
      if (prev.length >= 2) {
        // Replace the oldest selection with the new one
        return [prev[1], versionId];
      }
      return [...prev, versionId];
    });
    setShowDiff(false);
  }

  function handleCompare() {
    if (selectedVersionIds.length !== 2) return;
    setShowDiff(true);
    setExpandedVersionId(null);
  }

  // Build diff data from selected versions
  const diffVersions = React.useMemo(() => {
    if (selectedVersionIds.length !== 2) return null;
    const vA = versions.find((v) => v.id === selectedVersionIds[0]);
    const vB = versions.find((v) => v.id === selectedVersionIds[1]);
    if (!vA || !vB) return null;
    // Sort by version number so old is always first
    const [older, newer] = vA.version_number < vB.version_number
      ? [vA, vB]
      : [vB, vA];
    return { older, newer };
  }, [selectedVersionIds, versions]);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      {/* Back link */}
      <div>
        <Link href={`/notes/${noteId}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeftIcon />
          Back to Note
        </Link>
      </div>

      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Version History</h1>
        <Button
          size="sm"
          onClick={handleCompare}
          disabled={selectedVersionIds.length !== 2}
        >
          <GitCompareArrowsIcon />
          Compare Selected
        </Button>
      </div>

      {selectedVersionIds.length > 0 && selectedVersionIds.length < 2 && (
        <p className="text-sm text-muted-foreground">
          Select one more version to compare.
        </p>
      )}
      {selectedVersionIds.length === 2 && !showDiff && (
        <p className="text-sm text-muted-foreground">
          Two versions selected. Click &ldquo;Compare Selected&rdquo; to see the diff.
        </p>
      )}

      {/* Diff panel */}
      {showDiff && diffVersions && (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-sm">
              Comparing v{diffVersions.older.version_number} → v{diffVersions.newer.version_number}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDiff(false)}
            >
              Close
            </Button>
          </div>
          <DiffViewer
            oldText={diffVersions.older.content}
            newText={diffVersions.newer.content}
            oldLabel={`v${diffVersions.older.version_number} — ${new Date(diffVersions.older.created_at).toLocaleDateString()}`}
            newLabel={`v${diffVersions.newer.version_number} — ${new Date(diffVersions.newer.created_at).toLocaleDateString()}`}
          />
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Failed to load versions:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {/* Loading state */}
      {isLoading && <VersionsSkeleton />}

      {/* Empty state */}
      {!isLoading && !isError && versions.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <p className="text-muted-foreground">No version history available.</p>
        </div>
      )}

      {/* Versions table */}
      {!isLoading && versions.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">Select</span>
                </TableHead>
                <TableHead className="w-16">Version</TableHead>
                <TableHead>Changed By</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Expand</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((version) => {
                const isExpanded = expandedVersionId === version.id;
                const isSelected = selectedVersionIds.includes(version.id);

                return (
                  <React.Fragment key={version.id}>
                    <TableRow
                      className={isExpanded ? "bg-muted/40" : undefined}
                    >
                      {/* Checkbox */}
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(version.id)}
                          aria-label={`Select version ${version.version_number}`}
                        />
                      </TableCell>

                      {/* Version number */}
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          v{version.version_number}
                        </Badge>
                      </TableCell>

                      {/* Changed by */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">
                            {version.changer?.display_name ??
                              version.changer?.email ??
                              "Unknown"}
                          </span>
                          {version.changer?.display_name &&
                            version.changer?.email && (
                              <span className="text-xs text-muted-foreground">
                                {version.changer.email}
                              </span>
                            )}
                        </div>
                      </TableCell>

                      {/* Summary */}
                      <TableCell>
                        {version.change_summary ? (
                          <span>{version.change_summary}</span>
                        ) : (
                          <span className="text-muted-foreground italic text-xs">
                            No summary
                          </span>
                        )}
                      </TableCell>

                      {/* Date */}
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(version.created_at).toLocaleDateString()}
                      </TableCell>

                      {/* Expand toggle */}
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => toggleExpand(version.id)}
                          aria-label={
                            isExpanded
                              ? "Collapse version content"
                              : "Expand version content"
                          }
                        >
                          {isExpanded ? (
                            <ChevronUpIcon className="size-4" />
                          ) : (
                            <ChevronDownIcon className="size-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>

                    {/* Expanded content row */}
                    {isExpanded && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={6} className="p-0">
                          <div className="px-4 py-3 flex flex-col gap-2">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Content at v{version.version_number}
                            </p>
                            <ScrollArea className="h-48 rounded-lg border bg-background">
                              <pre className="p-3 text-xs whitespace-pre-wrap font-mono text-foreground">
                                {version.content || (
                                  <span className="text-muted-foreground italic">
                                    Empty content
                                  </span>
                                )}
                              </pre>
                            </ScrollArea>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
