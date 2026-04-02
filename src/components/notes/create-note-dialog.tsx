"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { TagInput } from "@/components/notes/tag-input";
import { apiFetch, useApiHeaders } from "@/hooks/use-api";
import { useOrgStore } from "@/stores/org-store";
import type { Visibility } from "@/types/index";

interface CreateNoteDialogProps {
  children: React.ReactNode;
}

export function CreateNoteDialog({ children }: CreateNoteDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [visibility, setVisibility] = React.useState<Visibility>("private");
  const [tags, setTags] = React.useState<string[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  const headers = useApiHeaders();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const queryClient = useQueryClient();

  function resetForm() {
    setTitle("");
    setContent("");
    setVisibility("private");
    setTags([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!activeOrgId) {
      toast.error("No active organization selected");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/notes", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          visibility,
          tags,
        }),
      });

      toast.success("Note created successfully");
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      setOpen(false);
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create note");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetForm();
    }
    setOpen(nextOpen);
  }

  return (
    <>
      <div onClick={() => setOpen(true)} className="contents">
        {children}
      </div>
      <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Note</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="note-title">Title</Label>
              <Input
                id="note-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note title"
                required
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="note-content">Content</Label>
              <Textarea
                id="note-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your note here... (supports Markdown)"
                className="min-h-30 resize-y font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Supports **bold**, *italic*, `code`, lists, tables, [warn]warnings[/warn]
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="note-visibility">Visibility</Label>
              <Select
                value={visibility}
                onValueChange={(val) => setVisibility(val as Visibility)}
              >
                <SelectTrigger id="note-visibility" className="w-full">
                  <SelectValue placeholder="Select visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="shared">Shared</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Tags</Label>
              <TagInput tags={tags} onChange={setTags} />
            </div>
          </div>

          <DialogFooter showCloseButton>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create Note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
