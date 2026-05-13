import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { auditLog } from '@/lib/logger';
import type { FinancePatternProposal } from '@/types/index';

// PATCH /api/finance/patterns/[id] — approve or reject
// Body: { action: 'approve' | 'reject' }
export const PATCH = withAuth(async (request: NextRequest, { user, orgId, supabase, params }) => {
  const { id } = params;
  const body = await request.json().catch(() => null);
  const action = body?.action as string | undefined;

  if (action !== 'approve' && action !== 'reject') {
    return apiError('action must be "approve" or "reject"', 400);
  }

  const { data: pattern, error: fetchError } = await supabase
    .from('finance_patterns')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchError || !pattern) return apiError('Pattern not found', 404);
  if (pattern.status !== 'pending') {
    return apiError(`Pattern already ${pattern.status}`, 409);
  }

  const now = new Date().toISOString();
  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  const { error: updateError } = await supabase
    .from('finance_patterns')
    .update({ status: newStatus, reviewed_by: user.id, reviewed_at: now })
    .eq('id', id);
  if (updateError) return apiError('Failed to update pattern', 500);

  if (action === 'approve') {
    const proposed = pattern.proposed as FinancePatternProposal;
    const today = now.slice(0, 10);
    const { error: recurringError } = await supabase.from('finance_recurring').insert({
      org_id: orgId,
      label: proposed.label,
      amount: proposed.amount,
      currency: proposed.currency,
      cadence: proposed.cadence,
      day_of_month: proposed.day_of_month,
      day_of_week: null,
      month_of_year: null,
      start_date: today,
      end_date: null,
      category: proposed.category,
      source: 'detected',
      detected_from_pattern_id: id,
      created_by: user.id,
    });
    if (recurringError) {
      console.error('Failed to insert recurring from pattern:', recurringError);
    }
  }

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: action === 'approve' ? 'finance.patterns.approved' : 'finance.patterns.rejected',
    resource_type: 'finance_pattern',
    resource_id: id,
  });

  return apiSuccess({ success: true });
});
