import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { auditLog } from '@/lib/logger';

// GET /api/notes/[id]/share
// List all users the note has been shared with.
export const GET = withAuth(async (_request: NextRequest, { orgId, supabase, params }) => {
  const noteId = params.id;

  // Verify the note exists and caller has access (RLS applies)
  const { data: note, error: noteError } = await supabase
    .from('notes')
    .select('id')
    .eq('id', noteId)
    .eq('org_id', orgId)
    .single();

  if (noteError || !note) {
    return apiError('Note not found', 404);
  }

  const { data: shares, error } = await supabase
    .from('note_shares')
    .select('*, profile:profiles!user_id(id, email, display_name)')
    .eq('note_id', noteId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('GET /api/notes/[id]/share error:', error);
    return apiError('Failed to fetch shares', 500);
  }

  return apiSuccess({ shares: shares ?? [] });
});

// POST /api/notes/[id]/share
// Share a note with a specific user in the same org.
export const POST = withAuth(async (request: NextRequest, { user, orgId, membership, supabase, params }) => {
  const noteId = params.id;

  const body = await request.json();
  const { user_id: targetUserId } = body as { user_id?: string };

  if (!targetUserId || typeof targetUserId !== 'string') {
    return apiError('user_id is required', 400);
  }

  // Fetch the note to verify ownership and org membership
  const { data: note, error: noteError } = await supabase
    .from('notes')
    .select('id, org_id, created_by')
    .eq('id', noteId)
    .eq('org_id', orgId)
    .single();

  if (noteError || !note) {
    return apiError('Note not found', 404);
  }

  // Only note creator or admin/owner can share
  const isPrivileged = membership.role === 'admin' || membership.role === 'owner';
  if (note.created_by !== user.id && !isPrivileged) {
    return apiError('You do not have permission to share this note', 403);
  }

  // Validate target user is a member of the same org
  const { data: targetMembership, error: membershipError } = await supabase
    .from('org_memberships')
    .select('id')
    .eq('user_id', targetUserId)
    .eq('org_id', orgId)
    .single();

  if (membershipError || !targetMembership) {
    return apiError('Target user is not a member of this organization', 400);
  }

  // Insert the share record; handle duplicate gracefully
  const { data: share, error: shareError } = await supabase
    .from('note_shares')
    .insert({ note_id: noteId, user_id: targetUserId })
    .select('*, profile:profiles!user_id(id, email, display_name)')
    .single();

  if (shareError) {
    // Unique constraint violation — already shared
    if (shareError.code === '23505') {
      return apiError('Note is already shared with this user', 409);
    }
    console.error('POST /api/notes/[id]/share error:', shareError);
    return apiError('Failed to share note', 500);
  }

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'note.share',
    resource_type: 'note',
    resource_id: noteId,
    metadata: { shared_with: targetUserId },
  });

  return apiSuccess({ share }, 201);
});

// DELETE /api/notes/[id]/share
// Remove share access for a specific user.
export const DELETE = withAuth(async (request: NextRequest, { user, orgId, membership, supabase, params }) => {
  const noteId = params.id;

  const body = await request.json();
  const { user_id: targetUserId } = body as { user_id?: string };

  if (!targetUserId || typeof targetUserId !== 'string') {
    return apiError('user_id is required', 400);
  }

  // Fetch the note to verify ownership
  const { data: note, error: noteError } = await supabase
    .from('notes')
    .select('id, org_id, created_by')
    .eq('id', noteId)
    .eq('org_id', orgId)
    .single();

  if (noteError || !note) {
    return apiError('Note not found', 404);
  }

  // Only note creator or admin/owner can unshare
  const isPrivileged = membership.role === 'admin' || membership.role === 'owner';
  if (note.created_by !== user.id && !isPrivileged) {
    return apiError('You do not have permission to unshare this note', 403);
  }

  const { error: deleteError } = await supabase
    .from('note_shares')
    .delete()
    .eq('note_id', noteId)
    .eq('user_id', targetUserId);

  if (deleteError) {
    console.error('DELETE /api/notes/[id]/share error:', deleteError);
    return apiError('Failed to unshare note', 500);
  }

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'note.unshare',
    resource_type: 'note',
    resource_id: noteId,
    metadata: { unshared_from: targetUserId },
  });

  return apiSuccess({ success: true });
});
