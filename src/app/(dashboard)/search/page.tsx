"use client";

import * as React from "react";
import Link from "next/link";
import { SearchIcon, Loader2 } from "lucide-react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useOrgStore } from "@/stores/org-store";
import { toast } from "sonner";
import type { Note, Visibility } from "@/types/index";

const LIMIT = 20;

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  const map: Record<Visibility, { label: string; className: string }> = {
    private: {
      label: "Private",
      className: "bg-secondary text-secondary-foreground",
    },
    shared: {
      label: "Shared",
      className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20",
    },
    public: {
      label: "Public",
      className: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20",
    },
  };
  const { label, className } = map[visibility];
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}

function SearchResultSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

interface SearchResult extends Note {
  snippet?: string;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  limit: number;
}

export default function SearchPage() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(false);
  const [results, setResults] = React.useState<SearchResponse | null>(null);

  // Debounce input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch on debounced query or page change
  React.useEffect(() => {
    if (!debouncedQuery.trim() || !activeOrgId) {
      setResults(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const url = `/api/notes/search?q=${encodeURIComponent(debouncedQuery)}&page=${page}&limit=${LIMIT}`;
    const fetchHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (activeOrgId) fetchHeaders["x-org-id"] = activeOrgId;
    fetch(url, { headers: fetchHeaders })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Search failed" }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json() as Promise<SearchResponse>;
      })
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Search failed");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, page, activeOrgId]);

  const totalPages = results ? Math.ceil(results.total / LIMIT) : 0;
  const hasResults = results && results.results.length > 0;
  const showEmpty = !isLoading && debouncedQuery.trim() && results && results.results.length === 0;
  const showPlaceholder = !debouncedQuery.trim();

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="text-sm text-muted-foreground">Search notes by title, content, or tags.</p>
      </div>

      {/* Search input */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes..."
          className="pl-9"
          autoFocus
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Result count */}
      {results && results.total > 0 && (
        <p className="text-sm text-muted-foreground">
          {results.total} result{results.total !== 1 ? "s" : ""} for{" "}
          <span className="font-medium text-foreground">&ldquo;{debouncedQuery}&rdquo;</span>
        </p>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <SearchResultSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Results */}
      {!isLoading && hasResults && (
        <div className="flex flex-col gap-3">
          {results.results.map((note) => {
            const snippet = note.content
              ? note.content.slice(0, 150) + (note.content.length > 150 ? "…" : "")
              : null;
            const creator =
              note.creator?.display_name ?? note.creator?.email ?? "Unknown";

            return (
              <Link key={note.id} href={`/notes/${note.id}`} className="block group">
                <Card className="transition-colors hover:bg-muted/40 cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="group-hover:text-primary transition-colors leading-snug">
                        {note.title}
                      </CardTitle>
                      <VisibilityBadge visibility={note.visibility} />
                    </div>
                    <CardDescription className="text-xs">
                      By {creator} &middot; {formatDate(note.updated_at)}
                    </CardDescription>
                  </CardHeader>
                  {(snippet || (note.tags && note.tags.length > 0)) && (
                    <CardContent className="flex flex-col gap-2.5">
                      {snippet && (
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                          {snippet}
                        </p>
                      )}
                      {note.tags && note.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {note.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {showEmpty && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <SearchIcon className="size-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">No results found</p>
          <p className="text-sm text-muted-foreground">
            Try different keywords or check your spelling.
          </p>
        </div>
      )}

      {/* Placeholder state */}
      {showPlaceholder && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <SearchIcon className="size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Start typing to search notes.</p>
        </div>
      )}

      {/* Pagination */}
      <PaginationControls
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        disabled={isLoading}
      />
    </div>
  );
}
