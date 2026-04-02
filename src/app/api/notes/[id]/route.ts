import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { auditLog } from '@/lib/logger';

// GET /api/notes/[id]
// Fetch a single note. RLS enforces visibility rules.
export const GET = withAuth(async (_request: NextRequest, { orgId, supabase, params }) => {
  const noteId = params.id;

  const { data: note, error } = await supabase
    .from('notes')
    .select('*, creator:profiles!created_by(id, email, display_name)')
    .eq('id', noteId)
    .eq('org_id', orgId)
    .single();

  if (error || !note) {
    return apiError('Note not found', 404);
  }

  return apiSuccess({ note });
});

// PATCH /api/notes/[id]
// Update a note's fields and create a new version capturing the updated state.
export const PATCH = withAuth(async (request: NextRequest, { user, orgId, membership, supabase, params }) => {
  const noteId = params.id;

  const body = await request.json();
  const { title, content, visibility, tags, change_summary } = body as {
    title?: string;
    content?: string;
    visibility?: string;
    tags?: string[];
    change_summary?: string;
  };

  // Validate provided fields
  if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
    return apiError('title must be a non-empty string', 400);
  }
  if (visibility !== undefined && !['private', 'shared', 'public'].includes(visibility)) {
    return apiError('visibility must be one of: private, shared, public', 400);
  }
  if (tags !== undefined && !Array.isArray(tags)) {
    return apiError('tags must be an array', 400);
  }

  // Fetch the existing note to verify access and get current version number
  const { data: existing, error: fetchError } = await supabase
    .from('notes')
    .select('id, org_id, created_by, current_version, title, content')
    .eq('id', noteId)
    .eq('org_id', orgId)
    .single();

  if (fetchError || !existing) {
    return apiError('Note not found', 404);
  }

  // Only creator or admin/owner may update
  const isPrivileged = membership.role === 'admin' || membership.role === 'owner';
  if (existing.created_by !== user.id && !isPrivileged) {
    return apiError('You do not have permission to update this note', 403);
  }

  // Build update payload with only provided fields
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    current_version: existing.current_version + 1,
  };
  if (title !== undefined) updatePayload.title = title.trim();
  if (content !== undefined) updatePayload.content = content;
  if (visibility !== undefined) updatePayload.visibility = visibility;
  if (tags !== undefined) updatePayload.tags = tags;

  const { data: updated, error: updateError } = await supabase
    .from('notes')
    .update(updatePayload)
    .eq('id', noteId)
    .select('*, creator:profiles!created_by(id, email, display_name)')
    .single();

  if (updateError || !updated) {
    console.error('PATCH /api/notes/[id] update error:', updateError);
    return apiError('Failed to update note', 500);
  }

  // Insert a new version capturing the UPDATED state
  const { error: versionError } = await supabase
    .from('note_versions')
    .insert({
      note_id: noteId,
      version_number: updated.current_version,
      title: updated.title,
      content: updated.content,
      changed_by: user.id,
      change_summary: change_summary ?? null,
    });

  if (versionError) {
    console.error('PATCH /api/notes/[id] version insert error:', versionError);
  }

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'note.update',
    resource_type: 'note',
    resource_id: noteId,
    metadata: {
      updated_fields: Object.keys(body as Record<string, unknown>).filter(k => k !== 'change_summary'),
      new_version: updated.current_version,
    },
  });

  return apiSuccess({ note: updated });
});

// DELETE /api/notes/[id]
// Hard-delete a note. Cascades to note_versions, note_shares, and ai_summaries.
export const DELETE = withAuth(async (_request: NextRequest, { user, orgId, membership, supabase, params }) => {
  const noteId = params.id;

  // Fetch note to verify it exists in this org
  const { data: existing, error: fetchError } = await supabase
    .from('notes')
    .select('id, org_id, created_by, title')
    .eq('id', noteId)
    .eq('org_id', orgId)
    .single();

  if (fetchError || !existing) {
    return apiError('Note not found', 404);
  }

  // Only creator or admin/owner may delete
  const isPrivileged = membership.role === 'admin' || membership.role === 'owner';
  if (existing.created_by !== user.id && !isPrivileged) {
    return apiError('You do not have permission to delete this note', 403);
  }

  const { error: deleteError } = await supabase
    .from('notes')
    .delete()
    .eq('id', noteId);

  if (deleteError) {
    console.error('DELETE /api/notes/[id] error:', deleteError);
    return apiError('Failed to delete note', 500);
  }

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'note.delete',
    resource_type: 'note',
    resource_id: noteId,
    metadata: { title: existing.title },
  });

  return apiSuccess({ success: true });
});
