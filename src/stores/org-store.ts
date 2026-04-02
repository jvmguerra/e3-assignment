import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OrgState {
  activeOrgId: string | null;
  setActiveOrgId: (orgId: string | null) => void;
}

export const useOrgStore = create<OrgState>()(
  persist(
    (set) => ({
      activeOrgId: null,
      setActiveOrgId: (orgId) => set({ activeOrgId: orgId }),
    }),
    {
      name: 'org-store',
    }
  )
);
