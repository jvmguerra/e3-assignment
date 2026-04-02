import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { auditLog } from '@/lib/logger';

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/orgs/[id]/members
// List all members of the org. Requires org membership.
export const GET = withAuth(async (_request, { supabase, orgId }) => {
  const { data, error } = await supabase
    .from('org_memberships')
    .select(`
      id,
      role,
      created_at,
      user_id,
      profile:profiles (
        id,
        email,
        display_name,
        avatar_url
      )
    `)
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('GET /api/orgs/[id]/members error:', error);
    return apiError('Failed to fetch members', 500);
  }

  return apiSuccess({ members: data });
});

// POST /api/orgs/[id]/members
// Add a member by email. Requires admin or owner role.
export function POST(request: NextRequest, context: RouteContext) {
  return withAuth(async (req, { supabase, orgId, membership, user }) => {
    if (!['owner', 'admin'].includes(membership.role)) {
      return apiError('Only admins and owners can add members', 403);
    }

    const body = await req.json();
    const { email, role } = body as { email?: string; role?: string };

    if (!email || !role) {
      return apiError('email and role are required', 400);
    }

    if (!['owner', 'admin', 'member'].includes(role)) {
      return apiError('role must be one of: owner, admin, member', 400);
    }

    // Non-owners cannot grant owner or admin roles
    if (membership.role === 'admin' && ['owner', 'admin'].includes(role)) {
      return apiError('Admins can only add members with the "member" role', 403);
    }

    // Look up the target user by email
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .eq('email', email)
      .maybeSingle();

    if (profileError) {
      console.error('POST /api/orgs/[id]/members profile lookup error:', profileError);
      return apiError('Failed to look up user', 500);
    }

    if (!profile) {
      return apiError('No user found with that email address', 404);
    }

    // Check they are not already a member
    const { data: existing } = await supabase
      .from('org_memberships')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', profile.id)
      .maybeSingle();

    if (existing) {
      return apiError('User is already a member of this organization', 409);
    }

    const { data: newMembership, error: insertError } = await supabase
      .from('org_memberships')
      .insert({ org_id: orgId, user_id: profile.id, role })
      .select()
      .single();

    if (insertError) {
      console.error('POST /api/orgs/[id]/members insert error:', insertError);
      return apiError('Failed to add member', 500);
    }

    await auditLog(supabase, {
      org_id: orgId,
      user_id: user.id,
      action: 'member.added',
      resource_type: 'org_membership',
      resource_id: newMembership.id,
      metadata: { target_user_id: profile.id, target_email: email, role },
      ip_address: req.headers.get('x-forwarded-for') ?? undefined,
    });

    return apiSuccess({ membership: newMembership }, 201);
  })(request, context as { params: Promise<Record<string, string>> });
}

// DELETE /api/orgs/[id]/members
// Remove a member. Body: { user_id }. Requires admin or owner.
export function DELETE(request: NextRequest, context: RouteContext) {
  return withAuth(async (req, { supabase, orgId, membership, user }) => {
    if (!['owner', 'admin'].includes(membership.role)) {
      return apiError('Only admins and owners can remove members', 403);
    }

    const body = await req.json();
    const { user_id: targetUserId } = body as { user_id?: string };

    if (!targetUserId) {
      return apiError('user_id is required', 400);
    }

    // Fetch the target membership
    const { data: targetMembership, error: fetchError } = await supabase
      .from('org_memberships')
      .select('id, role')
      .eq('org_id', orgId)
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (fetchError) {
      return apiError('Failed to look up membership', 500);
    }

    if (!targetMembership) {
      return apiError('User is not a member of this organization', 404);
    }

    // Prevent removing the last owner
    if (targetMembership.role === 'owner') {
      const { count, error: countError } = await supabase
        .from('org_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('role', 'owner');

      if (countError) {
        return apiError('Failed to validate owner count', 500);
      }

      if ((count ?? 0) <= 1) {
        return apiError('Cannot remove the last owner of an organization', 400);
      }
    }

    const { error: deleteError } = await supabase
      .from('org_memberships')
      .delete()
      .eq('id', targetMembership.id);

    if (deleteError) {
      console.error('DELETE /api/orgs/[id]/members delete error:', deleteError);
      return apiError('Failed to remove member', 500);
    }

    await auditLog(supabase, {
      org_id: orgId,
      user_id: user.id,
      action: 'member.removed',
      resource_type: 'org_membership',
      resource_id: targetMembership.id,
      metadata: { target_user_id: targetUserId },
      ip_address: req.headers.get('x-forwarded-for') ?? undefined,
    });

    return apiSuccess({ message: 'Member removed successfully' });
  })(request, context as { params: Promise<Record<string, string>> });
}

// PATCH /api/orgs/[id]/members
// Change a member's role. Body: { user_id, role }. Requires owner.
export function PATCH(request: NextRequest, context: RouteContext) {
  return withAuth(async (req, { supabase, orgId, membership, user }) => {
    // Only owners can change roles
    if (membership.role !== 'owner') {
      return apiError('Only owners can change member roles', 403);
    }

    const body = await req.json();
    const { user_id: targetUserId, role: newRole } = body as {
      user_id?: string;
      role?: string;
    };

    if (!targetUserId || !newRole) {
      return apiError('user_id and role are required', 400);
    }

    if (!['owner', 'admin', 'member'].includes(newRole)) {
      return apiError('role must be one of: owner, admin, member', 400);
    }

    // Fetch the target membership
    const { data: targetMembership, error: fetchError } = await supabase
      .from('org_memberships')
      .select('id, role')
      .eq('org_id', orgId)
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (fetchError) {
      return apiError('Failed to look up membership', 500);
    }

    if (!targetMembership) {
      return apiError('User is not a member of this organization', 404);
    }

    // Prevent demoting the last owner
    if (targetMembership.role === 'owner' && newRole !== 'owner') {
      const { count, error: countError } = await supabase
        .from('org_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('role', 'owner');

      if (countError) {
        return apiError('Failed to validate owner count', 500);
      }

      if ((count ?? 0) <= 1) {
        return apiError('Cannot demote the last owner of an organization', 400);
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('org_memberships')
      .update({ role: newRole })
      .eq('id', targetMembership.id)
      .select()
      .single();

    if (updateError) {
      console.error('PATCH /api/orgs/[id]/members update error:', updateError);
      return apiError('Failed to update member role', 500);
    }

    await auditLog(supabase, {
      org_id: orgId,
      user_id: user.id,
      action: 'member.role_changed',
      resource_type: 'org_membership',
      resource_id: targetMembership.id,
      metadata: {
        target_user_id: targetUserId,
        previous_role: targetMembership.role,
        new_role: newRole,
      },
      ip_address: req.headers.get('x-forwarded-for') ?? undefined,
    });

    return apiSuccess({ membership: updated });
  })(request, context as { params: Promise<Record<string, string>> });
}
