"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UploadIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useOrgStore } from "@/stores/org-store";

interface DocumentUploadProps {
  month: string; // YYYY-MM
}

export function DocumentUpload({ month }: DocumentUploadProps) {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [accountLabel, setAccountLabel] = React.useState("");
  const [uploading, setUploading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !activeOrgId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("statement_month", month);
      formData.append("account_label", accountLabel.trim());
      const res = await fetch("/api/finance/documents", {
        method: "POST",
        headers: { "x-org-id": activeOrgId },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      toast.success(`${file.name} uploaded`);
      queryClient.invalidateQueries({ queryKey: ["finance", "documents"] });
      setOpen(false);
      setFile(null);
      setAccountLabel("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!activeOrgId}>
        <UploadIcon className="size-4" />
        Upload statement
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload statement</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="file">PDF or CSV</Label>
              <Input
                id="file"
                type="file"
                accept=".pdf,.csv,application/pdf,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account">Account label</Label>
              <Input
                id="account"
                type="text"
                placeholder="e.g. Nubank, Wise USD, Payoneer"
                value={accountLabel}
                onChange={(e) => setAccountLabel(e.target.value)}
                required
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Statement month: <span className="font-mono">{month}</span>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={uploading || !file}>
                {uploading && <Loader2 className="size-4 animate-spin" />}
                Upload
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
