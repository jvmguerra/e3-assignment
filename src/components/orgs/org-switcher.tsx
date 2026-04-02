"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronsUpDown, PlusIcon, BuildingIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgStore } from "@/stores/org-store";
import { apiFetch, useApiHeaders } from "@/hooks/use-api";
import type { Organization } from "@/types/index";
import { CreateOrgDialog } from "./create-org-dialog";

interface OrgsResponse {
  orgs: Organization[];
}

export function OrgSwitcher() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const setActiveOrgId = useOrgStore((s) => s.setActiveOrgId);
  const queryClient = useQueryClient();
  const headers = useApiHeaders();
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery<OrgsResponse>({
    queryKey: ["orgs"],
    queryFn: () => apiFetch("/api/orgs", { headers }),
  });

  const orgs = data?.orgs ?? [];
  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? orgs[0] ?? null;

  function handleSwitch(org: Organization) {
    setActiveOrgId(org.id);
    queryClient.invalidateQueries();
    toast.success(`Switched to ${org.name}`);
  }

  if (isLoading) {
    return <Skeleton className="h-8 w-full" />;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="w-full justify-between px-2 font-medium"
            />
          }
        >
          <span className="flex items-center gap-2 truncate">
            <BuildingIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{activeOrg?.name ?? "Select org"}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {orgs.map((org) => (
            <DropdownMenuItem
              key={org.id}
              onClick={() => handleSwitch(org)}
              className={org.id === activeOrg?.id ? "bg-accent" : ""}
            >
              <BuildingIcon className="size-4 text-muted-foreground" />
              <span className="truncate">{org.name}</span>
            </DropdownMenuItem>
          ))}
          {orgs.length === 0 && (
            <DropdownMenuItem disabled>No organizations</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" />
            Create organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
