import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';

// GET /api/notes/search?q=...
// Full-text search across notes the caller can access in the active org.
// Uses Supabase's .textSearch() which maps to the @@ operator against search_vector.
// Ranking can be improved in the future with a custom RPC that uses ts_rank + ts_headline.
export const GET = withAuth(async (request: NextRequest, { orgId, supabase }) => {
  const { searchParams } = new URL(request.url);

  const q = searchParams.get('q')?.trim() ?? '';
  if (!q) {
    return apiError('Query parameter q is required', 400);
  }

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from('notes')
    .select('*, creator:profiles!created_by(id, email, display_name)', { count: 'exact' })
    .eq('org_id', orgId)
    .textSearch('search_vector', q, { type: 'plain', config: 'english' })
    .range(from, to)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('GET /api/notes/search error:', error);
    return apiError('Search failed', 500);
  }

  // Client-side ranking: boost notes whose title matches the query terms
  const queryTerms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const results = (data ?? []).map((note) => {
    const titleLower = (note.title as string).toLowerCase();
    const contentLower = (note.content as string).toLowerCase();
    const titleMatches = queryTerms.filter(t => titleLower.includes(t)).length;
    const contentMatches = queryTerms.filter(t => contentLower.includes(t)).length;
    // Simple rank: title matches are weighted 2x over content matches
    const rank = (titleMatches * 2 + contentMatches) / (queryTerms.length * 3 || 1);

    // Generate a simple headline from content (first ~200 chars around a match)
    let headline = '';
    const firstMatchIdx = queryTerms.reduce((best, term) => {
      const idx = contentLower.indexOf(term);
      return idx !== -1 && (best === -1 || idx < best) ? idx : best;
    }, -1);

    if (firstMatchIdx !== -1) {
      const start = Math.max(0, firstMatchIdx - 60);
      const end = Math.min((note.content as string).length, firstMatchIdx + 140);
      headline = (start > 0 ? '...' : '') + (note.content as string).slice(start, end) + (end < (note.content as string).length ? '...' : '');
    } else {
      headline = (note.content as string).slice(0, 200) + ((note.content as string).length > 200 ? '...' : '');
    }

    return { ...note, rank, headline };
  });

  // Sort by rank descending
  results.sort((a, b) => b.rank - a.rank);

  return apiSuccess({
    results,
    total: count ?? 0,
    page,
    limit,
  });
});
