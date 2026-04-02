import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/audit-logs
// List audit logs for the active org. Only owner and admin roles may access.
//
// Query params (all optional):
//   page      — 1-based page number (default: 1)
//   limit     — records per page, max 200 (default: 50)
//   action    — filter by exact action string, e.g. "note.create"
//   user_id   — filter by the user who performed the action
//   from      — ISO-8601 lower bound for created_at (inclusive)
//   to        — ISO-8601 upper bound for created_at (inclusive)
//
// Response: { logs: AuditLog[], total: number, page: number, limit: number }
export const GET = withAuth(async (request: NextRequest, { orgId, membership, user }) => {
  // Role guard: only owner and admin can view audit logs
  if (!['owner', 'admin'].includes(membership.role)) {
    return apiError('Only owners and admins can view audit logs', 403);
  }

  const { searchParams } = new URL(request.url);

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
  const actionFilter = searchParams.get('action');
  const userIdFilter = searchParams.get('user_id');
  const fromFilter = searchParams.get('from');
  const toFilter = searchParams.get('to');

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Use the admin client because the RLS SELECT policy on audit_logs requires
  // user_has_org_role (SECURITY DEFINER), which is available to all members.
  // However, using the admin client gives us more flexible joining without
  // needing to worry about Supabase's implicit auth context on the server client.
  // The role guard above already enforces the owner/admin restriction.
  const admin = createAdminClient();

  let query = admin
    .from('audit_logs')
    .select(
      `
        id,
        org_id,
        user_id,
        action,
        resource_type,
        resource_id,
        metadata,
        ip_address,
        created_at,
        actor:profiles!audit_logs_user_id_fkey (
          id,
          email,
          display_name,
          avatar_url
        )
      `,
      { count: 'exact' }
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (actionFilter) {
    query = query.eq('action', actionFilter);
  }

  if (userIdFilter) {
    query = query.eq('user_id', userIdFilter);
  }

  if (fromFilter) {
    // If only a date (YYYY-MM-DD) is supplied, use start-of-day UTC
    const lowerBound = fromFilter.includes('T') ? fromFilter : `${fromFilter}T00:00:00.000Z`;
    query = query.gte('created_at', lowerBound);
  }

  if (toFilter) {
    // If only a date (YYYY-MM-DD) is supplied, use end-of-day UTC
    const upperBound = toFilter.includes('T') ? toFilter : `${toFilter}T23:59:59.999Z`;
    query = query.lte('created_at', upperBound);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error(JSON.stringify({
      type: 'error',
      path: '/api/audit-logs',
      method: 'GET',
      error: error.message,
      userId: user.id,
      orgId,
      timestamp: new Date().toISOString(),
    }));
    return apiError('Failed to fetch audit logs', 500);
  }

  return apiSuccess({
    logs: data ?? [],
    total: count ?? 0,
    page,
    limit,
  });
});
