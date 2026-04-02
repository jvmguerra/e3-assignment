import { NextRequest } from 'next/server';
import { withAuth, apiSuccess } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';

// Simple in-memory cache — keyed by orgId
const insightCache = new Map<string, { text: string; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const GET = withAuth(async (_request: NextRequest, { orgId }) => {
  // Return cached insight if still valid
  const cached = insightCache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) {
    return apiSuccess({ insight: cached.text });
  }

  const admin = createAdminClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Gather stats for the AI prompt
  const [notesThisWeek, notesLastWeek, noteIdsResult, topTagsResult] = await Promise.all([
    admin
      .from('notes')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', sevenDaysAgo),
    admin
      .from('notes')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', fourteenDaysAgo)
      .lt('created_at', sevenDaysAgo),
    // Fetch note IDs to safely query ai_summaries (avoids nested-join filter issues)
    admin.from('notes').select('id').eq('org_id', orgId),
    admin.from('notes').select('tags').eq('org_id', orgId).gte('created_at', thirtyDaysAgo),
  ]);

  // Pending summaries via note ID list
  const noteIds = (noteIdsResult.data ?? []).map((n: { id: string }) => n.id);
  let pendingCount = 0;
  if (noteIds.length > 0) {
    const { count } = await admin
      .from('ai_summaries')
      .select('*', { count: 'exact', head: true })
      .in('note_id', noteIds)
      .eq('status', 'pending');
    pendingCount = count ?? 0;
  }

  // Top tags this month
  const tagCounts = new Map<string, number>();
  for (const note of topTagsResult.data ?? []) {
    for (const tag of ((note.tags as string[]) ?? [])) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);

  const thisWeekCount = notesThisWeek.count ?? 0;
  const lastWeekCount = notesLastWeek.count ?? 0;
  const trend =
    lastWeekCount > 0
      ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100)
      : 0;

  // Build a static fallback regardless of AI availability
  const trendStr = trend !== 0 ? ` (${trend >= 0 ? '+' : ''}${trend}% vs last week)` : '';
  const summaryStr =
    pendingCount > 0
      ? `${pendingCount} AI summaries are pending review.`
      : 'All AI summaries are reviewed.';
  const fallback = `Your team created ${thisWeekCount} notes this week${trendStr}. ${summaryStr} Most active areas: ${topTags.join(', ') || 'general'}.`;

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.MINIMAX_MODEL || 'minimax/minimax-m2.7';

  // If no API key, return static insight immediately
  if (!apiKey) {
    insightCache.set(orgId, { text: fallback, expiresAt: Date.now() + CACHE_TTL });
    return apiSuccess({ insight: fallback });
  }

  const prompt = `You are analyzing a team's notes workspace. Give a 2-3 sentence insight summary.

Data:
- Notes created this week: ${thisWeekCount}
- Notes created last week: ${lastWeekCount}
- Week-over-week change: ${trend >= 0 ? '+' : ''}${trend}%
- Top active areas (tags): ${topTags.join(', ') || 'none'}
- Pending AI summaries awaiting review: ${pendingCount}

Write a brief, specific, actionable insight in 2-3 sentences. Be concise. Don't use bullet points. Reference specific numbers.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://e3-team-notes.railway.app',
        'X-Title': 'E3 Team Notes',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 200,
      }),
    });

    if (!response.ok) throw new Error(`AI request failed with status ${response.status}`);

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const insight = data.choices?.[0]?.message?.content?.trim() ?? '';

    if (insight) {
      insightCache.set(orgId, { text: insight, expiresAt: Date.now() + CACHE_TTL });
      return apiSuccess({ insight });
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        type: 'error',
        path: '/api/dashboard/insight',
        error: err instanceof Error ? err.message : 'Unknown AI error',
        timestamp: new Date().toISOString(),
      })
    );
  }

  // Fallback when AI call fails or returns empty content
  insightCache.set(orgId, { text: fallback, expiresAt: Date.now() + CACHE_TTL });
  return apiSuccess({ insight: fallback });
});
