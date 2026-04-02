import { NextRequest } from 'next/server';
import { withAuth, apiSuccess } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';

export const GET = withAuth(async (_request: NextRequest, { orgId }) => {
  const admin = createAdminClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Run all queries in parallel — admin client bypasses RLS, org_id filtered manually
  const [
    notesResult,
    membersResult,
    filesResult,
    notesByDayResult,
    activityResult,
    tagsResult,
    contributorsResult,
    noteIdsForSummaries,
  ] = await Promise.all([
    // 1. Notes count
    admin.from('notes').select('*', { count: 'exact', head: true }).eq('org_id', orgId),

    // 2. Members count
    admin.from('org_memberships').select('*', { count: 'exact', head: true }).eq('org_id', orgId),

    // 3. Files (count + total size)
    admin.from('files').select('file_size').eq('org_id', orgId),

    // 4. Notes created in last 30 days (for chart)
    admin.from('notes').select('created_at').eq('org_id', orgId).gte('created_at', thirtyDaysAgo),

    // 5. Audit log activity in last 30 days (for chart)
    admin.from('audit_logs').select('action, created_at').eq('org_id', orgId).gte('created_at', thirtyDaysAgo),

    // 6. All tags (for top tags)
    admin.from('notes').select('tags').eq('org_id', orgId),

    // 7. Top contributors (notes grouped by creator)
    admin.from('notes').select('created_by, creator:profiles!created_by(display_name, email)').eq('org_id', orgId),

    // 8. Note IDs for the org (used to query ai_summaries safely without relying on nested join filter)
    admin.from('notes').select('id').eq('org_id', orgId),
  ]);

  // Query ai_summaries via note IDs to avoid unreliable nested-join filter
  const noteIds = (noteIdsForSummaries.data ?? []).map((n: { id: string }) => n.id);
  let summariesData: Array<{ status: string }> = [];
  if (noteIds.length > 0) {
    const { data } = await admin
      .from('ai_summaries')
      .select('status')
      .in('note_id', noteIds);
    summariesData = data ?? [];
  }

  // --- Stats ---
  const stats = {
    notes_count: notesResult.count ?? 0,
    members_count: membersResult.count ?? 0,
    files_count: filesResult.data?.length ?? 0,
    files_total_size: (filesResult.data ?? []).reduce(
      (sum: number, f: { file_size: number | null }) => sum + (f.file_size ?? 0),
      0
    ),
    summaries_count: summariesData.length,
    summaries_accepted: summariesData.filter((s) => s.status === 'accepted').length,
  };

  // --- Notes by day (last 30 days) ---
  const notesDayMap = new Map<string, number>();
  for (const note of notesByDayResult.data ?? []) {
    const day = (note.created_at as string).slice(0, 10);
    notesDayMap.set(day, (notesDayMap.get(day) ?? 0) + 1);
  }
  const notes_by_day: Array<{ time: string; value: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const day = date.toISOString().slice(0, 10);
    notes_by_day.push({ time: day, value: notesDayMap.get(day) ?? 0 });
  }

  // --- Activity by day (last 30 days) ---
  const activityDayMap = new Map<string, number>();
  for (const log of activityResult.data ?? []) {
    const day = (log.created_at as string).slice(0, 10);
    activityDayMap.set(day, (activityDayMap.get(day) ?? 0) + 1);
  }
  const activity_by_day: Array<{ time: string; value: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const day = date.toISOString().slice(0, 10);
    activity_by_day.push({ time: day, value: activityDayMap.get(day) ?? 0 });
  }

  // --- Top tags ---
  const tagCounts = new Map<string, number>();
  for (const note of tagsResult.data ?? []) {
    for (const tag of ((note.tags as string[]) ?? [])) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const top_tags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));

  // --- Top contributors ---
  const contributorCounts = new Map<
    string,
    { display_name: string; email: string; count: number }
  >();
  for (const note of contributorsResult.data ?? []) {
    const creator = note.creator as { display_name?: string; email?: string } | null;
    const existing = contributorCounts.get(note.created_by as string);
    if (existing) {
      existing.count++;
    } else {
      contributorCounts.set(note.created_by as string, {
        display_name: creator?.display_name ?? '',
        email: creator?.email ?? '',
        count: 1,
      });
    }
  }
  const top_contributors = [...contributorCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return apiSuccess({
    stats,
    notes_by_day,
    activity_by_day,
    top_tags,
    top_contributors,
  });
});
