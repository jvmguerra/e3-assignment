"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PlusIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateNoteDialog } from "@/components/notes/create-note-dialog";
import { apiFetch, useApiHeaders } from "@/hooks/use-api";
import { useOrgStore } from "@/stores/org-store";
import type { Note, Visibility } from "@/types/index";

const PAGE_SIZE = 20;

function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  const map: Record<Visibility, { label: string; className: string }> = {
    private: { label: "Private", className: "bg-secondary text-secondary-foreground" },
    shared: { label: "Shared", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20" },
    public: { label: "Public", className: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20" },
  };
  const { label, className } = map[visibility];
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}

function NoteCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full mt-1" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
      <CardFooter>
        <Skeleton className="h-4 w-1/2" />
      </CardFooter>
    </Card>
  );
}

export default function NotesPage() {
  const [page, setPage] = React.useState(1);
  const [activeTag, setActiveTag] = React.useState<string | null>(null);
  const headers = useApiHeaders();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  const queryParams = React.useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sort: "updated_at",
      order: "desc",
    });
    if (activeTag) params.set("tag", activeTag);
    return params.toString();
  }, [page, activeTag]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["notes", activeOrgId, page, activeTag],
    queryFn: () => apiFetch(`/api/notes?${queryParams}`, { headers }),
    enabled: !!activeOrgId,
  });

  const notes: Note[] = data?.notes ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Collect all unique tags across current page for filter chips
  const allTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach((n) => n.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [notes]);

  function handleTagClick(tag: string) {
    setActiveTag((prev) => (prev === tag ? null : tag));
    setPage(1);
  }

  if (!activeOrgId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <p className="text-muted-foreground">Select an organization to view notes.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Notes</h1>
          {!isLoading && total > 0 && (
            <p className="text-sm text-muted-foreground">{total} note{total !== 1 ? "s" : ""}</p>
          )}
        </div>
        <CreateNoteDialog>
          <Button>
            <PlusIcon />
            New Note
          </Button>
        </CreateNoteDialog>
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => handleTagClick(tag)}
              className="focus:outline-none"
              type="button"
            >
              <Badge
                variant={activeTag === tag ? "default" : "outline"}
                className="cursor-pointer hover:opacity-80 transition-opacity"
              >
                {tag}
              </Badge>
            </button>
          ))}
          {activeTag && (
            <button
              type="button"
              onClick={() => { setActiveTag(null); setPage(1); }}
              className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Failed to load notes: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <NoteCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && notes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <p className="text-lg font-medium">
            {activeTag ? `No notes tagged "${activeTag}".` : "No notes yet."}
          </p>
          <p className="text-sm text-muted-foreground">
            {activeTag
              ? "Try a different tag or clear the filter."
              : "Create your first note to get started."}
          </p>
          {!activeTag && (
            <CreateNoteDialog>
              <Button>
                <PlusIcon />
                Create your first note
              </Button>
            </CreateNoteDialog>
          )}
        </div>
      )}

      {/* Notes grid */}
      {!isLoading && notes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <Link key={note.id} href={`/notes/${note.id}`} className="group focus:outline-none">
              <Card className="h-full transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                      {note.title}
                    </CardTitle>
                    <VisibilityBadge visibility={note.visibility} />
                  </div>
                  {note.content && (
                    <CardDescription className="line-clamp-3">
                      {note.content.slice(0, 150)}
                    </CardDescription>
                  )}
                </CardHeader>

                {note.tags && note.tags.length > 0 && (
                  <CardContent>
                    <div className="flex flex-wrap gap-1">
                      {note.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                )}

                <CardFooter className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {note.creator?.display_name ?? note.creator?.email ?? "Unknown"}
                  </span>
                  <span>
                    {new Date(note.updated_at).toLocaleDateString()}
                  </span>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeftIcon />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
            <ChevronRightIcon />
          </Button>
        </div>
      )}
    </div>
  );
}
