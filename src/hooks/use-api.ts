"use client";

import { useOrgStore } from "@/stores/org-store";

export function useApiHeaders(): Record<string, string> {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  return activeOrgId ? { "x-org-id": activeOrgId } : {};
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}
