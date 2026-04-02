import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';

// GET /api/notes/[id]/versions
// List all versions of a note, most recent first.
// RLS on notes ensures the caller can access this note before we fetch its versions.
export const GET = withAuth(async (_request: NextRequest, { orgId, supabase, params }) => {
  const noteId = params.id;

  // Verify the note exists and the caller has access (RLS applies)
  const { data: note, error: noteError } = await supabase
    .from('notes')
    .select('id')
    .eq('id', noteId)
    .eq('org_id', orgId)
    .single();

  if (noteError || !note) {
    return apiError('Note not found', 404);
  }

  const { data: versions, error } = await supabase
    .from('note_versions')
    .select('*, changer:profiles!changed_by(id, email, display_name)')
    .eq('note_id', noteId)
    .order('version_number', { ascending: false });

  if (error) {
    console.error('GET /api/notes/[id]/versions error:', error);
    return apiError('Failed to fetch versions', 500);
  }

  return apiSuccess({ versions: versions ?? [] });
});
