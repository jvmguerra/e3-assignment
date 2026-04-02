import { describe, it, expect, vi } from 'vitest';

// Mock the Supabase server client to avoid real I/O in unit tests
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Mock the audit logger for the same reason
vi.mock('@/lib/logger', () => ({
  auditLog: vi.fn(),
}));

import { apiError, apiSuccess, getOrgId } from '@/lib/api-utils';
import { NextRequest } from 'next/server';

describe('apiError', () => {
  it('returns a response with the given HTTP status code', async () => {
    const res = apiError('Not found', 404);
    expect(res.status).toBe(404);
  });

  it('returns a JSON body with an error field', async () => {
    const res = apiError('Unauthorized', 401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('uses the message string verbatim', async () => {
    const res = apiError('Something went wrong', 500);
    const body = await res.json();
    expect(body.error).toBe('Something went wrong');
  });
});

describe('apiSuccess', () => {
  it('defaults to HTTP 200', async () => {
    const res = apiSuccess({ id: 1 });
    expect(res.status).toBe(200);
  });

  it('returns the provided data as JSON', async () => {
    const data = { id: 42, name: 'Test' };
    const res = apiSuccess(data);
    const body = await res.json();
    expect(body).toEqual(data);
  });

  it('respects a custom status code', async () => {
    const res = apiSuccess({ created: true }, 201);
    expect(res.status).toBe(201);
  });

  it('handles array payloads correctly', async () => {
    const data = [{ id: 1 }, { id: 2 }];
    const res = apiSuccess(data);
    const body = await res.json();
    expect(body).toEqual(data);
  });
});

describe('getOrgId', () => {
  it('returns the x-org-id header value when present', () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { 'x-org-id': 'org-xyz-999' },
    });
    expect(getOrgId(req)).toBe('org-xyz-999');
  });

  it('returns null when the x-org-id header is absent', () => {
    const req = new NextRequest('http://localhost/api/test');
    expect(getOrgId(req)).toBeNull();
  });

  it('returns the exact header value for non-trivial org IDs', () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { 'x-org-id': 'org-with-dashes_and.dots' },
    });
    expect(getOrgId(req)).toBe('org-with-dashes_and.dots');
  });
});
