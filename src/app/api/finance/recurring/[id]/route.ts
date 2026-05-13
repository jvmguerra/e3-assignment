import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { auditLog } from '@/lib/logger';

const EDITABLE = [
  'label',
  'amount',
  'currency',
  'cadence',
  'day_of_month',
  'day_of_week',
  'month_of_year',
  'start_date',
  'end_date',
  'category',
] as const;

export const PATCH = withAuth(async (request: NextRequest, { user, orgId, supabase, params }) => {
  const { id } = params;
  const body = await request.json().catch(() => null);
  if (!body) return apiError('Invalid JSON body', 400);

  const update: Record<string, unknown> = {};
  for (const k of EDITABLE) {
    if (k in body) update[k] = (body as Record<string, unknown>)[k];
  }
  if (Object.keys(update).length === 0) return apiError('No editable fields provided', 400);

  const { data, error } = await supabase
    .from('finance_recurring')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) return apiError('Failed to update recurring entry', 500);

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'finance.recurring.update',
    resource_type: 'finance_recurring',
    resource_id: id,
    metadata: update,
  });

  return apiSuccess({ recurring: data });
});

export const DELETE = withAuth(async (_req: NextRequest, { user, orgId, supabase, params }) => {
  const { id } = params;
  const { error } = await supabase.from('finance_recurring').delete().eq('id', id);
  if (error) return apiError('Failed to delete recurring entry', 500);

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'finance.recurring.delete',
    resource_type: 'finance_recurring',
    resource_id: id,
  });

  return apiSuccess({ success: true });
});
