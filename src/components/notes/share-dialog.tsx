"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, UserPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, useApiHeaders } from "@/hooks/use-api";
import { useOrgStore } from "@/stores/org-store";
import type { NoteShare, OrgMembership } from "@/types/index";

interface ShareDialogProps {
  noteId: string;
  children: React.ReactNode;
}

function getInitials(name: string | null | undefined, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function ShareDialog({ noteId, children }: ShareDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");
  const [addingUserId, setAddingUserId] = React.useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = React.useState<string | null>(null);

  const headers = useApiHeaders();
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const queryClient = useQueryClient();

  // Fetch current shares
  const { data: sharesData, isLoading: sharesLoading } = useQuery({
    queryKey: ["note-shares", noteId, activeOrgId],
    queryFn: () => apiFetch(`/api/notes/${noteId}/share`, { headers }),
    enabled: open && !!activeOrgId,
  });

  // Fetch org members for the add-user dropdown
  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ["org-members", activeOrgId],
    queryFn: () => apiFetch(`/api/orgs/${activeOrgId}/members`, { headers }),
    enabled: open && !!activeOrgId,
  });

  const shares: NoteShare[] = sharesData?.shares ?? [];
  const members: OrgMembership[] = membersData?.members ?? [];
  const sharedUserIds = new Set(shares.map((s) => s.user_id));

  // Filter members not already shared and match search
  const availableMembers = members.filter((m) => {
    if (sharedUserIds.has(m.user_id)) return false;
    if (!searchValue.trim()) return true;
    const search = searchValue.toLowerCase();
    const name = m.profile?.display_name?.toLowerCase() ?? "";
    const email = m.profile?.email?.toLowerCase() ?? "";
    return name.includes(search) || email.includes(search);
  });

  async function handleAdd(userId: string) {
    setAddingUserId(userId);
    try {
      await apiFetch(`/api/notes/${noteId}/share`, {
        method: "POST",
        headers,
        body: JSON.stringify({ user_id: userId }),
      });
      toast.success("User added to share");
      queryClient.invalidateQueries({ queryKey: ["note-shares", noteId] });
      queryClient.invalidateQueries({ queryKey: ["note", noteId] });
      setSearchValue("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add share");
    } finally {
      setAddingUserId(null);
    }
  }

  async function handleRemove(userId: string) {
    setRemovingUserId(userId);
    try {
      await apiFetch(`/api/notes/${noteId}/share`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({ user_id: userId }),
      });
      toast.success("User removed from share");
      queryClient.invalidateQueries({ queryKey: ["note-shares", noteId] });
      queryClient.invalidateQueries({ queryKey: ["note", noteId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove share");
    } finally {
      setRemovingUserId(null);
    }
  }

  return (
    <>
      <div onClick={() => setOpen(true)} className="contents">
        {children}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Note</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Current shares */}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Shared with</p>
            {sharesLoading ? (
              <div className="flex flex-col gap-2">
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton className="size-7 rounded-full" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                ))}
              </div>
            ) : shares.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This note is not shared with anyone yet.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {shares.map((share) => (
                  <div
                    key={share.id}
                    className="flex items-center justify-between gap-2 rounded-lg border p-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar size="sm">
                        <AvatarFallback>
                          {getInitials(
                            share.profile?.display_name,
                            share.profile?.email ?? ""
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0">
                        {share.profile?.display_name && (
                          <span className="truncate text-sm font-medium leading-tight">
                            {share.profile.display_name}
                          </span>
                        )}
                        <span className="truncate text-xs text-muted-foreground">
                          {share.profile?.email}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemove(share.user_id)}
                      disabled={removingUserId === share.user_id}
                      aria-label="Remove share"
                    >
                      {removingUserId === share.user_id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <X className="size-3.5" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add share */}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <UserPlus className="size-4" />
              Add member
            </p>
            {membersLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <Command className="rounded-lg border">
                <CommandInput
                  placeholder="Search members..."
                  value={searchValue}
                  onValueChange={setSearchValue}
                />
                <CommandList className="max-h-40">
                  <CommandEmpty>No members found.</CommandEmpty>
                  {availableMembers.length > 0 && (
                    <CommandGroup>
                      {availableMembers.map((member) => (
                        <CommandItem
                          key={member.user_id}
                          value={member.profile?.email ?? member.user_id}
                          onSelect={() => handleAdd(member.user_id)}
                          disabled={addingUserId === member.user_id}
                        >
                          <Avatar size="sm">
                            <AvatarFallback>
                              {getInitials(
                                member.profile?.display_name,
                                member.profile?.email ?? ""
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <span className="flex flex-col min-w-0">
                            {member.profile?.display_name && (
                              <span className="text-sm font-medium">
                                {member.profile.display_name}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {member.profile?.email}
                            </span>
                          </span>
                          {addingUserId === member.user_id && (
                            <Loader2 className="ml-auto size-3.5 animate-spin" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            )}
          </div>
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
    </>
  );
}
