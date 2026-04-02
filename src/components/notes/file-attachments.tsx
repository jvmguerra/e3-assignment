"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PaperclipIcon,
  UploadIcon,
  DownloadIcon,
  TrashIcon,
  Loader2,
  FileIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

interface FileAttachmentsProps {
  noteId: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

interface DeleteAttachmentDialogProps {
  file: FileRecord;
  onConfirm: () => Promise<void>;
  deleting: boolean;
}

function DeleteAttachmentDialog({ file, onConfirm, deleting }: DeleteAttachmentDialogProps) {
  const [open, setOpen] = React.useState(false);

  async function handleConfirm() {
    await onConfirm();
    setOpen(false);
  }

  return (
    <>
      <div onClick={() => setOpen(true)} className="contents">
        <Button variant="ghost" size="icon-sm" aria-label="Delete attachment">
          <TrashIcon className="size-3.5 text-destructive" />
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Attachment</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove{" "}
            <span className="font-medium text-foreground">{file.file_name}</span>{" "}
            from this note? The file will be deleted.
          </p>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Remove
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

export function FileAttachments({ noteId }: FileAttachmentsProps) {
  const headers = useApiHeaders();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const queryClient = useQueryClient();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["files", noteId, activeOrgId],
    queryFn: () =>
      apiFetch(`/api/files?note_id=${noteId}`, { headers }),
    enabled: !!activeOrgId && !!noteId,
  });

  const files: FileRecord[] = data?.files ?? [];

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await handleUpload(file);
  }

  async function handleUpload(file: File) {
    if (!activeOrgId) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("note_id", noteId);

      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "x-org-id": activeOrgId },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      toast.success(`${file.name} attached`);
      queryClient.invalidateQueries({ queryKey: ["files", noteId] });
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
      toast.success("Attachment removed");
      queryClient.invalidateQueries({ queryKey: ["files", noteId] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PaperclipIcon className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            Attachments
            {files.length > 0 && (
              <span className="ml-1.5 text-muted-foreground font-normal">
                ({files.length})
              </span>
            )}
          </h3>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !activeOrgId}
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <UploadIcon className="size-3.5" />
            )}
            {uploading ? "Uploading…" : "Attach File"}
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Skeleton className="size-4" />
                <Skeleton className="h-3.5 w-32" />
              </div>
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && files.length === 0 && (
        <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            No files attached. Click &ldquo;Attach File&rdquo; to add one.
          </p>
        </div>
      )}

      {/* File list */}
      {!isLoading && files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-col min-w-0">
                  <span className="truncate font-medium leading-snug">
                    {file.file_name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(file.file_size)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDownload(file)}
                  disabled={downloadingId === file.id}
                  aria-label="Download attachment"
                >
                  {downloadingId === file.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <DownloadIcon className="size-3.5" />
                  )}
                </Button>
                <DeleteAttachmentDialog
                  file={file}
                  onConfirm={() => handleDelete(file)}
                  deleting={deletingId === file.id}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
