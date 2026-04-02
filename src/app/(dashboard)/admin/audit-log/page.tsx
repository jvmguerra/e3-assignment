"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollIcon } from "lucide-react";
import { PaginationControls } from "@/components/ui/pagination-controls";
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
import { useAuth } from "@/hooks/use-auth";
import type { AuditLog, OrgMembership } from "@/types/index";

const PAGE_SIZE = 50;

const ACTION_OPTIONS = [
  { value: "all", label: "All actions" },
  { value: "auth.login", label: "Login" },
  { value: "auth.signup", label: "Signup" },
  { value: "note.create", label: "Note Created" },
  { value: "note.update", label: "Note Updated" },
  { value: "note.delete", label: "Note Deleted" },
  { value: "file.upload", label: "File Upload" },
  { value: "file.download", label: "File Download" },
  { value: "file.delete", label: "File Deleted" },
  { value: "ai.summary.requested", label: "AI Requested" },
  { value: "ai.summary.completed", label: "AI Completed" },
  { value: "ai.summary.accepted", label: "AI Accepted" },
  { value: "ai.summary.rejected", label: "AI Rejected" },
  { value: "ai.summary.failed", label: "AI Failed" },
  { value: "org.created", label: "Org Created" },
  { value: "org.member.add", label: "Member Added" },
  { value: "org.member.remove", label: "Member Removed" },
  { value: "org.member.role_change", label: "Role Changed" },
  { value: "permission.denied", label: "Permission Denied" },
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

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Login",
  "auth.signup": "Signup",
  "auth.logout": "Logout",
  "note.create": "Note Created",
  "note.update": "Note Updated",
  "note.delete": "Note Deleted",
  "note.share": "Note Shared",
  "note.unshare": "Note Unshared",
  "file.upload": "File Upload",
  "file.download": "File Download",
  "file.delete": "File Deleted",
  "ai.summary.requested": "AI Requested",
  "ai.summary.completed": "AI Completed",
  "ai.summary.accepted": "AI Accepted",
  "ai.summary.rejected": "AI Rejected",
  "ai.summary.failed": "AI Failed",
  "org.created": "Org Created",
  "org.member.add": "Member Added",
  "org.member.remove": "Member Removed",
  "org.member.role_change": "Role Changed",
  "permission.denied": "Denied",
};

function ActionBadge({ action }: { action: string }) {
  const color = getActionBadgeColor(action);
  const label = ACTION_LABELS[action] ?? action;
  return (
    <Badge variant="outline" className={`${badgeColorClasses[color]} whitespace-nowrap`}>
      {label}
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

function ExpandableDetails({ metadata }: { metadata: Record<string, unknown> }) {
  const [expanded, setExpanded] = React.useState(false);
  const summary = formatMetadata(metadata);

  if (summary === "—") return <span className="text-muted-foreground">—</span>;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-left hover:text-foreground transition-colors truncate block max-w-full"
      >
        {expanded ? "Hide details" : summary}
      </button>
      {expanded && (
        <pre className="mt-1.5 rounded-md bg-muted p-2 text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      )}
    </div>
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
  const { user } = useAuth();

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

  // Derive current user's role from members list
  const members = membersData?.members ?? [];
  const myMembership = members.find((m) => m.user_id === user?.id);
  const hasAdminAccess = myMembership?.role === "owner" || myMembership?.role === "admin";

  const queryParams = React.useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (actionFilter && actionFilter !== "all") {
      params.set("action", actionFilter);
    }
    // Convert date inputs to proper ISO timestamps using local timezone
    // so "April 1st" means midnight-to-midnight in the user's timezone
    if (dateFrom) {
      params.set("from", new Date(`${dateFrom}T00:00:00`).toISOString());
    }
    if (dateTo) {
      params.set("to", new Date(`${dateTo}T23:59:59.999`).toISOString());
    }
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
    enabled: !!activeOrgId && hasAdminAccess,
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
      <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
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

  // Role gate: show access denied for non-admin/owner (after all hooks)
  if (members.length > 0 && !hasAdminAccess) {
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

  // Filter changes are handled inline via setState — page resets
  // are already embedded in each filter's onChange handler below.

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
              setPage(1);
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
              setPage(1);
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
              setPage(1);
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
                // API returns `actor` alias from the profiles join
                const actor = (log as unknown as Record<string, unknown>).actor as { display_name?: string; email?: string } | null;
                const userName =
                  actor?.display_name ??
                  actor?.email ??
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
                    <TableCell className="text-xs text-muted-foreground max-w-50">
                      <ExpandableDetails metadata={log.metadata} />
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
      <PaginationControls
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        disabled={logsLoading}
      />
    </div>
  );
}
