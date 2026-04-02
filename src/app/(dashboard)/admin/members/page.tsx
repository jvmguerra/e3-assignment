"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { PlusIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useOrgStore } from "@/stores/org-store";
import { apiFetch, useApiHeaders } from "@/hooks/use-api";
import type { OrgMembership, Role } from "@/types/index";

interface MembersResponse {
  members: OrgMembership[];
}

const ROLE_OPTIONS: Role[] = ["owner", "admin", "member"];

function roleBadgeVariant(role: Role): "default" | "secondary" | "outline" {
  if (role === "owner") return "default";
  if (role === "admin") return "secondary";
  return "outline";
}

function MemberRowSkeleton() {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 w-28" />
        </div>
      </TableCell>
      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
      <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
      <TableCell><Skeleton className="h-7 w-24" /></TableCell>
      <TableCell><Skeleton className="size-7 rounded-lg" /></TableCell>
    </TableRow>
  );
}

export default function MembersPage() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const headers = useApiHeaders();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [addOpen, setAddOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");

  const queryKey = ["members", activeOrgId];

  const { data, isLoading, error } = useQuery<MembersResponse>({
    queryKey,
    queryFn: () =>
      apiFetch(`/api/orgs/${activeOrgId}/members`, { headers }),
    enabled: !!activeOrgId,
  });

  const members = data?.members ?? [];
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const myMembership = members.find((m) => m.user_id === user?.id);
  const canManageRoles = myMembership?.role === "owner";
  const canManageMembers = myMembership?.role === "owner" || myMembership?.role === "admin";

  const addMutation = useMutation({
    mutationFn: (body: { email: string; role: Role }) =>
      apiFetch(`/api/orgs/${activeOrgId}/members`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Member added");
      setAddOpen(false);
      setInviteEmail("");
      setInviteRole("member");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to add member");
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: Role }) =>
      apiFetch(`/api/orgs/${activeOrgId}/members`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ member_id: memberId, role }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Role updated");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update role");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) =>
      apiFetch(`/api/orgs/${activeOrgId}/members`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({ member_id: memberId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Member removed");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to remove member");
    },
  });

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    addMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
  }

  if (!activeOrgId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
        <p className="text-muted-foreground">Select an organization to manage members.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Members</h1>
          <p className="text-sm text-muted-foreground">
            Manage who has access to this organization.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} disabled={!canManageMembers}>
          <PlusIcon className="size-4" />
          Add member
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load members."}
        </p>
      ) : (
        <div className="rounded-xl ring-1 ring-foreground/10 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Change role</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <MemberRowSkeleton key={i} />
                  ))
                : members.map((member) => {
                    const isLastOwner =
                      member.role === "owner" && ownerCount <= 1;
                    const initials = member.profile?.display_name
                      ? member.profile.display_name.slice(0, 2).toUpperCase()
                      : (member.profile?.email ?? "?").slice(0, 2).toUpperCase();

                    return (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar size="sm">
                              <AvatarFallback>{initials}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium">
                              {member.profile?.display_name ?? "—"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {member.profile?.email ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={roleBadgeVariant(member.role)}>
                            {member.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={member.role}
                            onValueChange={(value) =>
                              roleMutation.mutate({
                                memberId: member.id,
                                role: value as Role,
                              })
                            }
                            disabled={roleMutation.isPending || isLastOwner || !canManageRoles}
                          >
                            <SelectTrigger size="sm" className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLE_OPTIONS.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={isLastOwner || removeMutation.isPending || !canManageMembers}
                            onClick={() => removeMutation.mutate(member.id)}
                            title={
                              isLastOwner
                                ? "Cannot remove the last owner"
                                : "Remove member"
                            }
                          >
                            <TrashIcon className="size-4 text-destructive" />
                            <span className="sr-only">Remove</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              {!isLoading && members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No members yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add member dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription>
              Invite someone to join this organization by email.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@example.com"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as Role)}
              >
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
                disabled={addMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={addMutation.isPending || !inviteEmail.trim()}
              >
                {addMutation.isPending ? "Adding…" : "Add member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
