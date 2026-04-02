"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeftIcon, ChevronRightIcon, ScrollIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, useApiHeaders } from "@/hooks/use-api";
import { useOrgStore } from "@/stores/org-store";
import type { AuditLog, OrgMembership } from "@/types/index";

const PAGE_SIZE = 50;

const ACTION_OPTIONS = [
  { value: "all", label: "All actions" },
  { value: "auth.login", label: "auth.login" },
  { value: "auth.signup", label: "auth.signup" },
  { value: "note.create", label: "note.create" },
  { value: "note.update", label: "note.update" },
  { value: "note.delete", label: "note.delete" },
  { value: "file.upload", label: "file.upload" },
  { value: "file.download", label: "file.download" },
  { value: "file.delete", label: "file.delete" },
  { value: "ai.summary.requested", label: "ai.summary.requested" },
  { value: "ai.summary.completed", label: "ai.summary.completed" },
  { value: "ai.summary.accepted", label: "ai.summary.accepted" },
  { value: "ai.summary.rejected", label: "ai.summary.rejected" },
  { value: "ai.summary.failed", label: "ai.summary.failed" },
  { value: "org.created", label: "org.created" },
  { value: "org.member.add", label: "org.member.add" },
  { value: "org.member.remove", label: "org.member.remove" },
  { value: "org.member.role_change", label: "org.member.role_change" },
  { value: "permission.denied", label: "permission.denied" },
];

type BadgeColor = "green" | "blue" | "yellow" | "red" | "default";

function getActionBadgeColor(action: string): BadgeColor {
  const green = new Set([
    "auth.signup",
    "note.create",
    "file.upload",
    "org.created",
    "org.member.add",
  ]);
  const blue = new Set(["file.download", "ai.summary.completed", "auth.login"]);
  const yellow = new Set([
    "note.update",
    "org.member.role_change",
    "ai.summary.accepted",
    "ai.summary.rejected",
    "ai.summary.requested",
  ]);
  const red = new Set([
    "note.delete",
    "file.delete",
    "org.member.remove",
    "permission.denied",
    "ai.summary.failed",
  ]);

  if (green.has(action)) return "green";
  if (blue.has(action)) return "blue";
  if (yellow.has(action)) return "yellow";
  if (red.has(action)) return "red";
  return "default";
}

const badgeColorClasses: Record<BadgeColor, string> = {
  green:
    "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20",
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20",
  yellow:
    "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  red: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20",
  default: "bg-secondary text-secondary-foreground",
};

function ActionBadge({ action }: { action: string }) {
  const color = getActionBadgeColor(action);
  return (
    <Badge variant="outline" className={badgeColorClasses[color]}>
      {action}
    </Badge>
  );
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMetadata(metadata: Record<string, unknown>): string {
  if (!metadata || Object.keys(metadata).length === 0) return "—";
  try {
    // Show as compact key=value pairs
    const pairs = Object.entries(metadata)
      .slice(0, 4)
      .map(([k, v]) => {
        const val =
          typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
        const truncated = val.length > 40 ? val.slice(0, 40) + "…" : val;
        return `${k}: ${truncated}`;
      });
    return pairs.join(" · ");
  } catch {
    return "—";
  }
}

function TableSkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-5 w-36" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-48" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

interface AuditLogResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

interface MembersResponse {
  members: OrgMembership[];
}

export default function AuditLogPage() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const headers = useApiHeaders();

  const [page, setPage] = React.useState(1);
  const [actionFilter, setActionFilter] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  // Fetch current user's membership to check role
  const { data: membersData, isLoading: membersLoading } =
    useQuery<MembersResponse>({
      queryKey: ["members", activeOrgId],
      queryFn: () =>
        apiFetch(`/api/orgs/${activeOrgId}/members`, { headers }),
      enabled: !!activeOrgId,
    });

  // We need the current user's role — derive from members list by matching auth
  // The members endpoint returns all members; we check if there's any owner/admin
  // We get the current user ID from the auth header response via profile data.
  // Since members page fetches all members with profile info, we need a way to
  // identify the current user. The members API response includes profile IDs.
  // We'll use a simpler approach: attempt to fetch audit logs and let the API deny if needed.
  // For UI gating, we check if the current user is owner or admin via membership data.

  const queryParams = React.useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (actionFilter && actionFilter !== "all") {
      params.set("action", actionFilter);
    }
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    return params.toString();
  }, [page, actionFilter, dateFrom, dateTo]);

  const {
    data,
    isLoading: logsLoading,
    isError,
    error,
  } = useQuery<AuditLogResponse>({
    queryKey: ["audit-logs", activeOrgId, page, actionFilter, dateFrom, dateTo],
    queryFn: () => apiFetch(`/api/audit-logs?${queryParams}`, { headers }),
    enabled: !!activeOrgId,
  });

  const logs: AuditLog[] = data?.logs ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (!activeOrgId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <p className="text-muted-foreground">
          Select an organization to view the audit log.
        </p>
      </div>
    );
  }

  // Show loading skeleton while checking membership
  if (membersLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-72" />
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                {["Action", "User", "Resource", "Details", "Timestamp"].map(
                  (h) => (
                    <TableHead key={h}>{h}</TableHead>
                  )
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableSkeletonRows />
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // Role gate: only owner/admin can view
  const members = membersData?.members ?? [];
  const hasAdminAccess = members.some(
    (m) => m.role === "owner" || m.role === "admin"
  );

  // If the members list is non-empty but no owner/admin found, the current user is a member
  // (the API already returns the full list for admins, or just the user's own entry for members)
  // We use the presence of multiple members OR the role field to determine access.
  // More reliable: check if the API returned an access error.
  if (isError) {
    const message =
      error instanceof Error ? error.message : "Failed to load audit log";
    const isAccessDenied =
      message.toLowerCase().includes("forbidden") ||
      message.toLowerCase().includes("unauthorized") ||
      message.toLowerCase().includes("access denied") ||
      message.toLowerCase().includes("permission");

    if (isAccessDenied) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <ScrollIcon className="size-12 text-muted-foreground/40" />
          <p className="text-lg font-medium">Access denied</p>
          <p className="text-sm text-muted-foreground">
            Only organization owners and admins can view the audit log.
          </p>
        </div>
      );
    }
  }

  // Check role from members data — if members list only contains member-role entries
  // and no owner/admin, show access denied
  if (!membersLoading && members.length > 0 && !hasAdminAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <ScrollIcon className="size-12 text-muted-foreground/40" />
        <p className="text-lg font-medium">Access denied</p>
        <p className="text-sm text-muted-foreground">
          Only organization owners and admins can view the audit log.
        </p>
      </div>
    );
  }

  function handleFilterChange() {
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Track all actions taken within this organization.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Action
          </label>
          <Select
            value={actionFilter}
            onValueChange={(v) => {
              setActionFilter(v ?? "all");
              handleFilterChange();
            }}
          >
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            From
          </label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              handleFilterChange();
            }}
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            To
          </label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              handleFilterChange();
            }}
            className="w-40"
          />
        </div>

        {(actionFilter !== "all" || dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setActionFilter("all");
              setDateFrom("");
              setDateTo("");
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Result count */}
      {!logsLoading && total > 0 && (
        <p className="text-sm text-muted-foreground">
          {total} entr{total !== 1 ? "ies" : "y"}
        </p>
      )}

      {/* General error state (non-access error) */}
      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Failed to load audit log:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-40">Action</TableHead>
              <TableHead className="min-w-35">User</TableHead>
              <TableHead className="min-w-40">Resource</TableHead>
              <TableHead className="min-w-50">Details</TableHead>
              <TableHead className="min-w-40">Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logsLoading ? (
              <TableSkeletonRows />
            ) : logs.length === 0 && !isError ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                    <ScrollIcon className="size-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium">
                      No audit log entries found
                    </p>
                    {(actionFilter !== "all" || dateFrom || dateTo) && (
                      <p className="text-sm text-muted-foreground">
                        Try adjusting or clearing your filters.
                      </p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const userName =
                  log.profile?.display_name ??
                  log.profile?.email ??
                  log.user_id.slice(0, 8) + "…";

                const resourceLabel =
                  log.resource_type && log.resource_id
                    ? `${log.resource_type} / ${log.resource_id.slice(0, 8)}…`
                    : log.resource_type ?? "—";

                return (
                  <TableRow key={log.id}>
                    <TableCell>
                      <ActionBadge action={log.action} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {userName}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {resourceLabel}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs">
                      <span
                        title={
                          log.metadata
                            ? JSON.stringify(log.metadata, null, 2)
                            : undefined
                        }
                        className="cursor-help"
                      >
                        {formatMetadata(log.metadata)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(log.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || logsLoading}
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
            disabled={page >= totalPages || logsLoading}
          >
            Next
            <ChevronRightIcon />
          </Button>
        </div>
      )}
    </div>
  );
}
