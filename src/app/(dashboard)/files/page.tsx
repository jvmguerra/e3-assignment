"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  UploadIcon,
  DownloadIcon,
  TrashIcon,
  Loader2,
  FileIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, useApiHeaders } from "@/hooks/use-api";
import { useOrgStore } from "@/stores/org-store";
import type { FileRecord } from "@/types/index";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function formatMimeType(mime: string): string {
  const map: Record<string, string> = {
    "application/pdf": "PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
    "application/msword": "Word",
    "application/vnd.ms-excel": "Excel",
    "application/vnd.ms-powerpoint": "PowerPoint",
    "application/zip": "ZIP",
    "application/json": "JSON",
    "text/plain": "Text",
    "text/csv": "CSV",
    "text/html": "HTML",
    "text/markdown": "Markdown",
  };
  if (map[mime]) return map[mime];
  if (mime.startsWith("image/")) return mime.replace("image/", "").toUpperCase();
  if (mime.startsWith("video/")) return mime.replace("video/", "").toUpperCase();
  if (mime.startsWith("audio/")) return mime.replace("audio/", "").toUpperCase();
  // Fallback: show last part after /
  const parts = mime.split("/");
  return parts[parts.length - 1].slice(0, 12);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function TableSkeletonRows() {
  return (
    <>
      {[1, 2, 3, 4].map((i) => (
        <TableRow key={i}>
          <TableCell>
            <div className="flex items-center gap-2">
              <Skeleton className="size-4" />
              <Skeleton className="h-4 w-40" />
            </div>
          </TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell>
            <div className="flex gap-2">
              <Skeleton className="size-7 rounded-lg" />
              <Skeleton className="size-7 rounded-lg" />
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

interface DeleteFileDialogProps {
  file: FileRecord;
  onConfirm: () => Promise<void>;
  deleting: boolean;
}

function DeleteFileDialog({ file, onConfirm, deleting }: DeleteFileDialogProps) {
  const [open, setOpen] = React.useState(false);

  async function handleConfirm() {
    await onConfirm();
    setOpen(false);
  }

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className="contents"
      >
        <Button variant="ghost" size="icon-sm" aria-label="Delete file">
          <TrashIcon className="size-4 text-destructive" />
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete File</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{file.file_name}</span>?
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete File
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function FilesPage() {
  const headers = useApiHeaders();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const queryClient = useQueryClient();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["files", activeOrgId],
    queryFn: () => apiFetch("/api/files", { headers }),
    enabled: !!activeOrgId,
  });

  const files: FileRecord[] = data?.files ?? [];

  const [previews, setPreviews] = React.useState<Record<string, string>>({});

  const imageFileIds = React.useMemo(
    () => files.filter((f) => f.mime_type.startsWith("image/")).map((f) => f.id).join(","),
    [files]
  );

  React.useEffect(() => {
    if (!imageFileIds || !activeOrgId) return;

    const ids = imageFileIds.split(",");

    async function loadPreviews() {
      const newPreviews: Record<string, string> = {};
      for (const id of ids) {
        try {
          const data = await apiFetch(`/api/files/${id}`, {
            headers: { "x-org-id": activeOrgId! },
          });
          if (data.download_url) {
            newPreviews[id] = data.download_url;
          }
        } catch { /* ignore */ }
      }
      setPreviews((prev) => ({ ...prev, ...newPreviews }));
    }

    loadPreviews();
  }, [imageFileIds, activeOrgId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so re-selecting same file works
    e.target.value = "";
    await handleUpload(file);
  }

  async function handleUpload(file: File) {
    if (!activeOrgId) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "x-org-id": activeOrgId },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      toast.success(`${file.name} uploaded successfully`);
      queryClient.invalidateQueries({ queryKey: ["files"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(file: FileRecord) {
    setDownloadingId(file.id);
    try {
      const data = await apiFetch(`/api/files/${file.id}`, { headers });
      const url = data.download_url;
      if (!url) throw new Error("No download URL returned");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(file: FileRecord) {
    setDeletingId(file.id);
    try {
      await apiFetch(`/api/files/${file.id}`, {
        method: "DELETE",
        headers,
      });
      toast.success(`${file.file_name} deleted`);
      queryClient.invalidateQueries({ queryKey: ["files"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Files</h1>
          <p className="text-sm text-muted-foreground">
            Manage your organization&apos;s uploaded files.
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !activeOrgId}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UploadIcon className="size-4" />
            )}
            {uploading ? "Uploading…" : "Upload File"}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Uploaded By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeletonRows />
            ) : files.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                    <FileIcon className="size-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium">No files yet</p>
                    <p className="text-sm text-muted-foreground">
                      Upload a file to get started.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              files.map((file) => {
                const uploader =
                  file.uploader?.display_name ?? file.uploader?.email ?? "Unknown";
                return (
                  <TableRow key={file.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-0">
                        {previews[file.id] ? (
                          <img
                            src={previews[file.id]}
                            alt={file.file_name}
                            className="size-8 rounded object-cover border shrink-0"
                          />
                        ) : file.mime_type.startsWith("image/") ? (
                          <Skeleton className="size-8 rounded" />
                        ) : (
                          <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate max-w-xs font-medium">
                          {file.file_name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatFileSize(file.file_size)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatMimeType(file.mime_type)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {uploader}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(file.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDownload(file)}
                          disabled={downloadingId === file.id}
                          aria-label="Download file"
                        >
                          {downloadingId === file.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <DownloadIcon className="size-4" />
                          )}
                        </Button>
                        <DeleteFileDialog
                          file={file}
                          onConfirm={() => handleDelete(file)}
                          deleting={deletingId === file.id}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
