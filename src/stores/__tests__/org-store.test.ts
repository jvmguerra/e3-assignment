import { describe, it, expect, beforeEach } from 'vitest';
import { useOrgStore } from '@/stores/org-store';

// Reset the store state before each test so tests are isolated
beforeEach(() => {
  useOrgStore.setState({ activeOrgId: null });
});

describe('useOrgStore', () => {
  it('has activeOrgId as null in initial state', () => {
    const { activeOrgId } = useOrgStore.getState();
    expect(activeOrgId).toBeNull();
  });

  it('setActiveOrgId updates activeOrgId to the provided value', () => {
    const { setActiveOrgId } = useOrgStore.getState();
    setActiveOrgId('org-abc-123');
    expect(useOrgStore.getState().activeOrgId).toBe('org-abc-123');
  });

  it('setActiveOrgId can set activeOrgId back to null', () => {
    const { setActiveOrgId } = useOrgStore.getState();
    setActiveOrgId('org-abc-123');
    setActiveOrgId(null);
    expect(useOrgStore.getState().activeOrgId).toBeNull();
  });

  it('setActiveOrgId replaces a previous org ID with a new one', () => {
    const { setActiveOrgId } = useOrgStore.getState();
    setActiveOrgId('org-first');
    setActiveOrgId('org-second');
    expect(useOrgStore.getState().activeOrgId).toBe('org-second');
  });
});
