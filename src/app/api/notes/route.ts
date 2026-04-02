import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { auditLog } from '@/lib/logger';

// GET /api/notes
// List notes in the active org with pagination, filtering, and sorting.
export const GET = withAuth(async (request: NextRequest, { orgId, supabase }) => {
  const { searchParams } = new URL(request.url);

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const tag = searchParams.get('tag');
  const visibility = searchParams.get('visibility');
  const sort = searchParams.get('sort') ?? 'updated_at';
  const order = searchParams.get('order') ?? 'desc';

  const allowedSortFields = ['updated_at', 'created_at', 'title'];
  const safeSort = allowedSortFields.includes(sort) ? sort : 'updated_at';
  const ascending = order === 'asc';

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('notes')
    .select('*, creator:profiles!created_by(id, email, display_name)', { count: 'exact' })
    .eq('org_id', orgId);

  if (tag) {
    query = query.contains('tags', [tag]);
  }

  if (visibility) {
    query = query.eq('visibility', visibility);
  }

  query = query.order(safeSort, { ascending }).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error('GET /api/notes error:', error);
    return apiError('Failed to fetch notes', 500);
  }

  return apiSuccess({
    notes: data ?? [],
    total: count ?? 0,
    page,
    limit,
  });
});

// POST /api/notes
// Create a new note and its initial version.
export const POST = withAuth(async (request: NextRequest, { user, orgId, supabase }) => {
  const body = await request.json();
  const { title, content, visibility = 'private', tags = [] } = body as {
    title?: string;
    content?: string;
    visibility?: string;
    tags?: string[];
  };

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return apiError('title is required', 400);
  }
  if (content === undefined || content === null) {
    return apiError('content is required', 400);
  }
  if (!['private', 'shared', 'public'].includes(visibility)) {
    return apiError('visibility must be one of: private, shared, public', 400);
  }
  if (!Array.isArray(tags)) {
    return apiError('tags must be an array', 400);
  }

  // Insert the note
  const { data: note, error: noteError } = await supabase
    .from('notes')
    .insert({
      org_id: orgId,
      created_by: user.id,
      title: title.trim(),
      content,
      visibility,
      tags,
      current_version: 1,
    })
    .select('*, creator:profiles!created_by(id, email, display_name)')
    .single();

  if (noteError) {
    console.error('POST /api/notes note insert error:', noteError);
    return apiError('Failed to create note', 500);
  }

  // Insert the initial version
  const { error: versionError } = await supabase
    .from('note_versions')
    .insert({
      note_id: note.id,
      version_number: 1,
      title: note.title,
      content: note.content,
      changed_by: user.id,
      change_summary: 'Initial version',
    });

  if (versionError) {
    console.error('POST /api/notes version insert error:', versionError);
    // Note was created; log the version failure but don't roll back
  }

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'note.create',
    resource_type: 'note',
    resource_id: note.id,
    metadata: { title: note.title, visibility },
  });

  return apiSuccess({ note }, 201);
});
