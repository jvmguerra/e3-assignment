import { NextRequest } from 'next/server';
import { withAuth, apiSuccess } from '@/lib/api-utils';

// GET /api/notes/tags?q=...
// Return distinct tags used across all accessible notes in the org.
// Supports optional prefix filtering via ?q= for autocomplete.
export const GET = withAuth(async (request: NextRequest, { orgId, supabase }) => {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim().toLowerCase() ?? '';

  // Fetch tags column for all accessible notes in the org (RLS applies)
  const { data, error } = await supabase
    .from('notes')
    .select('tags')
    .eq('org_id', orgId);

  if (error) {
    console.error('GET /api/notes/tags error:', error);
    // Return empty list rather than erroring — non-critical endpoint
    return apiSuccess({ tags: [] });
  }

  // Flatten all tags arrays, deduplicate, then filter by prefix
  const allTags = [...new Set((data ?? []).flatMap((n) => (n.tags as string[]) ?? []))];

  const filtered = q
    ? allTags.filter((t) => t.toLowerCase().startsWith(q))
    : allTags;

  return apiSuccess({ tags: filtered.sort() });
});
