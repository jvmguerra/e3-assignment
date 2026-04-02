"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  EditIcon,
  TrashIcon,
  ShareIcon,
  HistoryIcon,
  ArrowLeftIcon,
  Loader2,
  XIcon,
  SaveIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { TagInput } from "@/components/notes/tag-input";
import { ShareDialog } from "@/components/notes/share-dialog";
import { AISummary } from "@/components/notes/ai-summary";
import { FileAttachments } from "@/components/notes/file-attachments";
import { MarkdownRenderer } from "@/components/notes/markdown-renderer";
import { apiFetch, useApiHeaders } from "@/hooks/use-api";
import { useAuth } from "@/hooks/use-auth";
import { useOrgStore } from "@/stores/org-store";
import type { Note, Visibility } from "@/types/index";

function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  const map: Record<Visibility, { label: string; className: string }> = {
    private: {
      label: "Private",
      className: "bg-secondary text-secondary-foreground",
    },
    shared: {
      label: "Shared",
      className:
        "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20",
    },
    public: {
      label: "Public",
      className:
        "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20",
    },
  };
  const { label, className } = map[visibility];
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}

function NoteDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-6 w-48" />
      </div>
      <Skeleton className="h-10 w-3/4" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-16" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

interface DeleteConfirmDialogProps {
  onConfirm: () => Promise<void>;
  deleting: boolean;
}

function DeleteConfirmDialog({ onConfirm, deleting }: DeleteConfirmDialogProps) {
  const [open, setOpen] = React.useState(false);

  async function handleConfirm() {
    await onConfirm();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm" disabled={deleting} />
        }
      >
        {deleting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <TrashIcon className="size-4" />
        )}
        Delete
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Note</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete this note? This action cannot be
          undone, and all version history will be lost.
        </p>
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={deleting}
          >
            {deleting && <Loader2 className="size-4 animate-spin" />}
            Delete Note
          </Button>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function NoteDetailPage() {
  const params = useParams<{ id: string }>();
  const noteId = params.id;
  const router = useRouter();
  const { user } = useAuth();
  const headers = useApiHeaders();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const queryClient = useQueryClient();

  // Edit state
  const [editing, setEditing] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState("");
  const [editContent, setEditContent] = React.useState("");
  const [editVisibility, setEditVisibility] = React.useState<Visibility>("private");
  const [editTags, setEditTags] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["note", noteId, activeOrgId],
    queryFn: () => apiFetch(`/api/notes/${noteId}`, { headers }),
    enabled: !!activeOrgId && !!noteId,
  });

  const note: Note | undefined = data?.note;

  // Load signed URLs for [image:fileId] references in note content
  const [attachedImageUrls, setAttachedImageUrls] = React.useState<Record<string, string>>({});
  const imageRefs = React.useMemo(() => {
    if (!note?.content) return [];
    const matches = [...note.content.matchAll(/\[image:([a-f0-9-]+)\]/g)];
    return matches.map((m) => m[1]);
  }, [note?.content]);

  React.useEffect(() => {
    if (!imageRefs.length || !activeOrgId) return;
    async function loadImageUrls() {
      const urls: Record<string, string> = {};
      for (const fileId of imageRefs) {
        try {
          const data = await apiFetch(`/api/files/${fileId}`, {
            headers: { "x-org-id": activeOrgId! },
          });
          if (data.download_url) urls[fileId] = data.download_url;
        } catch { /* ignore */ }
      }
      setAttachedImageUrls(urls);
    }
    loadImageUrls();
  }, [imageRefs.join(","), activeOrgId]); // eslint-disable-line react-hooks/exhaustive-deps

  function startEditing() {
    if (!note) return;
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditVisibility(note.visibility);
    setEditTags([...(note.tags ?? [])]);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
  }

  async function handleSave() {
    if (!editTitle.trim()) {
      toast.error("Title is required");
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          title: editTitle.trim(),
          content: editContent.trim(),
          visibility: editVisibility,
          tags: editTags,
        }),
      });

      toast.success("Note saved");
      queryClient.invalidateQueries({ queryKey: ["note", noteId] });
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiFetch(`/api/notes/${noteId}`, {
        method: "DELETE",
        headers,
      });
      toast.success("Note deleted");
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      router.push("/notes");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete note");
      setDeleting(false);
    }
  }

  const isCreator = user?.id === note?.created_by;

  if (isLoading) return <NoteDetailSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-destructive font-medium">
          Failed to load note:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <Link href="/notes" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeftIcon />
          Back to Notes
        </Link>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-muted-foreground">Note not found.</p>
        <Link href="/notes" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeftIcon />
          Back to Notes
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 max-w-4xl mx-auto p-6">
      {/* Back link */}
      <div className="mb-4">
        <Link href="/notes" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeftIcon />
          Back to Notes
        </Link>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        {/* Main content */}
        <div className="flex flex-1 flex-col gap-6 min-w-0">
          {/* Title + action bar */}
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              {editing ? (
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="edit-title" className="sr-only">
                    Title
                  </Label>
                  <Input
                    id="edit-title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="text-lg font-semibold h-auto py-2"
                    placeholder="Note title"
                    autoFocus
                  />
                </div>
              ) : (
                <h1 className="text-2xl font-bold leading-tight flex-1 min-w-0 wrap-break-word">
                  {note.title}
                </h1>
              )}

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-2">
                {editing ? (
                  <>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <SaveIcon className="size-4" />
                      )}
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={cancelEditing}
                      disabled={saving}
                    >
                      <XIcon className="size-4" />
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={startEditing}
                    >
                      <EditIcon className="size-4" />
                      Edit
                    </Button>

                    {note.visibility === "shared" && (
                      <ShareDialog noteId={note.id}>
                        <Button variant="outline" size="sm">
                          <ShareIcon className="size-4" />
                          Share
                        </Button>
                      </ShareDialog>
                    )}

                    {isCreator && (
                      <DeleteConfirmDialog
                        onConfirm={handleDelete}
                        deleting={deleting}
                      />
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Visibility (edit mode) */}
            {editing && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-visibility">Visibility</Label>
                <Select
                  value={editVisibility}
                  onValueChange={(val) => setEditVisibility(val as Visibility)}
                >
                  <SelectTrigger id="edit-visibility">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="shared">Shared</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Tags (display or edit) */}
          {editing ? (
            <div className="flex flex-col gap-1.5">
              <Label>Tags</Label>
              <TagInput tags={editTags} onChange={setEditTags} />
            </div>
          ) : (
            note.tags && note.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {note.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            )
          )}

          <Separator />

          {/* Content */}
          {editing ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-content">Content</Label>
              <Textarea
                id="edit-content"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-75 resize-y font-mono text-sm"
                placeholder="Write your note content here..."
              />
              <p className="text-xs text-muted-foreground">
                Supports **Markdown**: *italic*, **bold**, `code`, ```code blocks```, {">"} blockquotes, - lists, | tables |, [links](url), [warn]warnings[/warn], [image:file-id]
              </p>
            </div>
          ) : (
            <div>
              {note.content ? (
                <MarkdownRenderer content={note.content} attachedImages={attachedImageUrls} />
              ) : (
                <p className="text-muted-foreground italic">No content yet.</p>
              )}
            </div>
          )}

          <Separator />

          {/* Version history link */}
          <div className="flex items-center gap-2">
            <Link href={`/notes/${note.id}/versions`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <HistoryIcon className="size-4" />
              Version History
            </Link>
          </div>

          {/* AI Summary */}
          <AISummary noteId={note.id} noteTitle={note.title} />

          {/* File Attachments */}
          <FileAttachments noteId={note.id} />
        </div>

        {/* Sidebar */}
        <aside className="lg:w-56 shrink-0">
          <div className="sticky top-6 flex flex-col gap-4 rounded-xl border bg-muted/30 p-4 text-sm">
            <h2 className="font-medium">Details</h2>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  Visibility
                </span>
                <VisibilityBadge visibility={note.visibility} />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  Creator
                </span>
                <span className="font-medium">
                  {note.creator?.display_name ?? note.creator?.email ?? "Unknown"}
                </span>
                {note.creator?.display_name && note.creator?.email && (
                  <span className="text-xs text-muted-foreground">
                    {note.creator.email}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  Created
                </span>
                <span>{new Date(note.created_at).toLocaleDateString()}</span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  Updated
                </span>
                <span>{new Date(note.updated_at).toLocaleDateString()}</span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  Version
                </span>
                <span>v{note.current_version}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
