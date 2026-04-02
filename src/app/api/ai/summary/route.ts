import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { auditLog } from '@/lib/logger';
import { generateSummary } from '@/lib/ai/openrouter';
import { createAdminClient } from '@/lib/supabase/admin';

const RATE_LIMIT_WINDOW_HOURS = 1;
const RATE_LIMIT_MAX_REQUESTS = 10;

// POST /api/ai/summary
// Body: { note_id: string }
// Fetches the note (RLS enforces access), calls OpenRouter to generate a summary,
// inserts a row into ai_summaries, and returns the summary.
export const POST = withAuth(async (request: NextRequest, { user, orgId, supabase }) => {
  const body = await request.json().catch(() => null);
  const noteId = body?.note_id as string | undefined;

  if (!noteId || typeof noteId !== 'string') {
    return apiError('note_id is required', 400);
  }

  // Rate limit: use admin client to count recent ai.summary.requested audit events
  // for this user because the audit_logs SELECT policy only allows admin/owner.
  const adminClient = createAdminClient();
  const oneHourAgo = new Date(
    Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { count, error: rateError } = await adminClient
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('action', 'ai.summary.requested')
    .gte('created_at', oneHourAgo);

  if (rateError) {
    console.error('Rate limit check failed:', rateError);
    // Fail open — don't block the user if the count query errors
  } else if ((count ?? 0) >= RATE_LIMIT_MAX_REQUESTS) {
    return apiError(
      `Rate limit exceeded: max ${RATE_LIMIT_MAX_REQUESTS} summaries per hour`,
      429
    );
  }

  // Fetch the note — RLS automatically restricts to notes the caller can access
  const { data: note, error: noteError } = await supabase
    .from('notes')
    .select('id, title, content, current_version, org_id')
    .eq('id', noteId)
    .single();

  if (noteError || !note) {
    return apiError('Note not found or access denied', 404);
  }

  // Audit: record that a summary was requested
  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'ai.summary.requested',
    resource_type: 'note',
    resource_id: noteId,
    metadata: { note_id: noteId, version_number: note.current_version },
  });

  // Call OpenRouter
  let summary;
  try {
    summary = await generateSummary(note.title as string, note.content as string);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('generateSummary failed:', message);

    await auditLog(supabase, {
      org_id: orgId,
      user_id: user.id,
      action: 'ai.summary.failed',
      resource_type: 'note',
      resource_id: noteId,
      metadata: { error: message },
    });

    return apiError('Failed to generate summary', 502);
  }

  // Persist the summary
  const { data: inserted, error: insertError } = await supabase
    .from('ai_summaries')
    .insert({
      note_id: noteId,
      version_number: note.current_version,
      summary,
      status: 'pending',
    })
    .select()
    .single();

  if (insertError || !inserted) {
    console.error('ai_summaries insert failed:', insertError);
    return apiError('Failed to save summary', 500);
  }

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'ai.summary.completed',
    resource_type: 'note',
    resource_id: noteId,
    metadata: { summary_id: inserted.id, version_number: note.current_version },
  });

  return apiSuccess({ summary: inserted }, 201);
});

// PATCH /api/ai/summary
// Body: { summary_id: string, action: 'accept' | 'reject' }
// Accepts or rejects a pending summary. If accepting and tags_suggested is non-empty,
// appends new tags to the note (deduped).
export const PATCH = withAuth(async (request: NextRequest, { user, orgId, supabase }) => {
  const body = await request.json().catch(() => null);
  const summaryId = body?.summary_id as string | undefined;
  const action = body?.action as string | undefined;

  if (!summaryId || typeof summaryId !== 'string') {
    return apiError('summary_id is required', 400);
  }

  if (action !== 'accept' && action !== 'reject') {
    return apiError('action must be "accept" or "reject"', 400);
  }

  // Fetch the summary — RLS enforces the caller can access the parent note's org
  const { data: existing, error: fetchError } = await supabase
    .from('ai_summaries')
    .select('id, note_id, status, summary')
    .eq('id', summaryId)
    .single();

  if (fetchError || !existing) {
    return apiError('Summary not found or access denied', 404);
  }

  if (existing.status !== 'pending') {
    return apiError(`Summary has already been ${existing.status}`, 409);
  }

  const now = new Date().toISOString();
  const updates =
    action === 'accept'
      ? { status: 'accepted', accepted_at: now, accepted_by: user.id }
      : { status: 'rejected' };

  const { data: updated, error: updateError } = await supabase
    .from('ai_summaries')
    .update(updates)
    .eq('id', summaryId)
    .select()
    .single();

  if (updateError || !updated) {
    console.error('ai_summaries update failed:', updateError);
    return apiError('Failed to update summary', 500);
  }

  // If accepting, optionally merge tags_suggested into the note's tags
  if (action === 'accept') {
    const summaryData = existing.summary as {
      tags_suggested?: string[];
    } | null;
    const suggestedTags: string[] = summaryData?.tags_suggested ?? [];

    if (suggestedTags.length > 0) {
      // Fetch current note tags
      const { data: noteData } = await supabase
        .from('notes')
        .select('tags')
        .eq('id', existing.note_id)
        .single();

      if (noteData) {
        const currentTags: string[] = (noteData.tags as string[]) ?? [];
        const merged = Array.from(new Set([...currentTags, ...suggestedTags]));

        if (merged.length > currentTags.length) {
          const { error: tagError } = await supabase
            .from('notes')
            .update({ tags: merged })
            .eq('id', existing.note_id);

          if (tagError) {
            console.error('Failed to merge suggested tags:', tagError);
            // Non-fatal — the summary is already accepted
          }
        }
      }
    }
  }

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: action === 'accept' ? 'ai.summary.accepted' : 'ai.summary.rejected',
    resource_type: 'note',
    resource_id: existing.note_id,
    metadata: { summary_id: summaryId },
  });

  return apiSuccess({ summary: updated });
});

// GET /api/ai/summary?note_id=xxx
// Returns all summaries for a note, newest first. RLS handles access control.
export const GET = withAuth(async (request: NextRequest, { supabase }) => {
  const { searchParams } = new URL(request.url);
  const noteId = searchParams.get('note_id');

  if (!noteId) {
    return apiError('note_id query parameter is required', 400);
  }

  const { data, error } = await supabase
    .from('ai_summaries')
    .select('*')
    .eq('note_id', noteId)
    .order('generated_at', { ascending: false });

  if (error) {
    console.error('GET /api/ai/summary error:', error);
    return apiError('Failed to fetch summaries', 500);
  }

  return apiSuccess({ summaries: data ?? [] });
});
