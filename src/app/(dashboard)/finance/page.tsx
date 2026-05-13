"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileTextIcon,
  Loader2,
  SparklesIcon,
  TrashIcon,
  CheckCircle2Icon,
  XCircleIcon,
  ClockIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiFetch, useApiHeaders } from "@/hooks/use-api";
import { useOrgStore } from "@/stores/org-store";
import { MonthPicker, currentMonthIso } from "@/components/finance/month-picker";
import { DocumentUpload } from "@/components/finance/document-upload";
import type { FinanceDocument, ExtractionStatus } from "@/types/index";

function statusBadge(status: ExtractionStatus) {
  if (status === "completed") {
    return (
      <Badge variant="secondary" className="gap-1">
        <CheckCircle2Icon className="size-3 text-emerald-500" /> Extracted
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="secondary" className="gap-1">
        <XCircleIcon className="size-3 text-destructive" /> Failed
      </Badge>
    );
  }
  if (status === "processing") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="size-3 animate-spin" /> Processing
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <ClockIcon className="size-3" /> Pending
    </Badge>
  );
}

export default function FinanceDocumentsPage() {
  const headers = useApiHeaders();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const queryClient = useQueryClient();

  const [month, setMonth] = React.useState<string>(currentMonthIso());
  const [extractingId, setExtractingId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<FinanceDocument | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["finance", "documents", activeOrgId, month],
    queryFn: () =>
      apiFetch(`/api/finance/documents?month=${encodeURIComponent(month)}`, { headers }),
    enabled: !!activeOrgId,
    refetchInterval: (q) => {
      const docs = (q.state.data as { documents?: FinanceDocument[] } | undefined)?.documents ?? [];
      const stillProcessing = docs.some((d) => d.extraction_status === "processing");
      return stillProcessing ? 3000 : false;
    },
  });

  const docs: FinanceDocument[] = data?.documents ?? [];

  async function handleExtract(doc: FinanceDocument) {
    setExtractingId(doc.id);
    try {
      await apiFetch(`/api/finance/documents/${doc.id}/extract`, {
        method: "POST",
        headers,
      });
      toast.success("Extraction complete");
      queryClient.invalidateQueries({ queryKey: ["finance"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Extraction failed");
      queryClient.invalidateQueries({ queryKey: ["finance"] });
    } finally {
      setExtractingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/finance/documents/${deleteTarget.id}`, {
        method: "DELETE",
        headers,
      });
      toast.success("Document deleted");
      queryClient.invalidateQueries({ queryKey: ["finance"] });
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Finance documents</h1>
          <p className="text-sm text-muted-foreground">
            Upload monthly bank or credit-card statements. The AI extracts transactions and
            detects patterns.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthPicker value={month} onChange={setMonth} />
          <DocumentUpload month={month} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/finance/analysis?month=${month}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <SparklesIcon className="size-4" />
          Analysis
        </Link>
        <Link
          href="/finance/calendar"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Calendar
        </Link>
        <Link
          href="/finance/patterns"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Patterns
        </Link>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Currencies</TableHead>
              <TableHead className="w-44">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [1, 2, 3].map((i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-7 w-32" /></TableCell>
                </TableRow>
              ))
            ) : docs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                    <FileTextIcon className="size-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium">No documents for this month</p>
                    <p className="text-sm text-muted-foreground">
                      Upload a PDF or CSV statement to get started.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-0">
                      <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{d.file_name}</span>
                    </div>
                    {d.extraction_error && (
                      <p className="text-xs text-destructive mt-1 truncate" title={d.extraction_error}>
                        {d.extraction_error}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{d.account_label || "—"}</TableCell>
                  <TableCell>{statusBadge(d.extraction_status)}</TableCell>
                  <TableCell className="text-xs">
                    {d.detected_currencies?.length
                      ? d.detected_currencies.join(", ")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExtract(d)}
                        disabled={
                          extractingId === d.id || d.extraction_status === "processing"
                        }
                      >
                        {extractingId === d.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <SparklesIcon className="size-3" />
                        )}
                        {d.extraction_status === "completed" ? "Re-extract" : "Extract"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteTarget(d)}
                        aria-label="Delete"
                      >
                        <TrashIcon className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            All extracted transactions for{" "}
            <span className="font-medium text-foreground">{deleteTarget?.file_name}</span> will
            be removed.
          </p>
          <DialogFooter>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete
            </Button>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
