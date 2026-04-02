import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { auditLog } from '@/lib/logger';

// Standard API error response
export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

// Structured error logger for Railway log stream
export function logError(path: string, method: string, error: string, userId?: string) {
  console.error(JSON.stringify({
    type: 'error',
    path,
    method,
    error,
    userId,
    timestamp: new Date().toISOString(),
  }));
}

// Standard API success response
export function apiSuccess<T>(data: T, status: number = 200) {
  return NextResponse.json(data, { status });
}

// Get the authenticated user from the request, or return null
export async function getAuthUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// Get the org ID from the x-org-id header
export function getOrgId(request: NextRequest): string | null {
  return request.headers.get('x-org-id');
}

// Verify user is a member of the org. Returns the membership or null.
export async function verifyOrgMembership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('org_memberships')
    .select('*')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .single();

  if (error || !data) return null;
  return data;
}

// Higher-order function that wraps a Route Handler with error handling and auth/org checks
type RouteContext = { params: Promise<Record<string, string>> };

export function withAuth(
  handler: (
    request: NextRequest,
    context: {
      user: { id: string; email?: string };
      orgId: string;
      membership: { role: string };
      supabase: Awaited<ReturnType<typeof createClient>>;
      params: Record<string, string>;
    }
  ) => Promise<NextResponse>
) {
  return async (request: NextRequest, routeContext?: RouteContext) => {
    try {
      const supabase = await createClient();

      // 1. Check auth
      const user = await getAuthUser(supabase);
      if (!user) {
        return apiError('Not authenticated', 401);
      }

      // 2. Check org header
      const orgId = getOrgId(request);
      if (!orgId) {
        return apiError('Missing x-org-id header', 400);
      }

      // 3. Verify org membership
      const membership = await verifyOrgMembership(supabase, user.id, orgId);
      if (!membership) {
        // Log permission denial
        await auditLog(supabase, {
          org_id: orgId,
          user_id: user.id,
          action: 'permission.denied',
          metadata: {
            reason: 'not_org_member',
            path: request.nextUrl.pathname,
            method: request.method,
          },
        });
        return apiError('Not a member of this organization', 403);
      }

      // 4. Resolve params
      const params = routeContext?.params ? await routeContext.params : {};

      // 5. Call the actual handler
      return await handler(request, {
        user: { id: user.id, email: user.email },
        orgId,
        membership,
        supabase,
        params,
      });
    } catch (error) {
      // Generic error logging
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(JSON.stringify({
        type: 'error',
        path: request.nextUrl.pathname,
        method: request.method,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }));

      return apiError('Internal server error', 500);
    }
  };
}
