import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { auditLog } from '@/lib/logger';
import type { RecurringCadence } from '@/types/index';

const VALID_CADENCES: RecurringCadence[] = ['monthly', 'weekly', 'yearly', 'custom'];

// GET /api/finance/recurring — list recurring entries for the org
export const GET = withAuth(async (_req: NextRequest, { orgId, supabase }) => {
  const { data, error } = await supabase
    .from('finance_recurring')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return apiError('Failed to fetch recurring entries', 500);
  return apiSuccess({ recurring: data ?? [] });
});

// POST /api/finance/recurring — create a recurring entry
export const POST = withAuth(async (request: NextRequest, { user, orgId, supabase }) => {
  const body = await request.json().catch(() => null);
  if (!body) return apiError('Invalid JSON body', 400);

  const { label, amount, currency, cadence, day_of_month, day_of_week, month_of_year, start_date, end_date, category } =
    body as Record<string, unknown>;

  if (typeof label !== 'string' || !label.trim()) return apiError('label is required', 400);
  if (typeof amount !== 'number' || !isFinite(amount)) return apiError('amount must be a number', 400);
  if (typeof currency !== 'string' || currency.length !== 3) return apiError('currency must be a 3-letter code', 400);
  if (typeof cadence !== 'string' || !VALID_CADENCES.includes(cadence as RecurringCadence)) {
    return apiError('cadence must be monthly|weekly|yearly|custom', 400);
  }
  if (typeof start_date !== 'string') return apiError('start_date is required (YYYY-MM-DD)', 400);

  const { data, error } = await supabase
    .from('finance_recurring')
    .insert({
      org_id: orgId,
      label: label.trim(),
      amount,
      currency: currency.toUpperCase(),
      cadence,
      day_of_month: typeof day_of_month === 'number' ? day_of_month : null,
      day_of_week: typeof day_of_week === 'number' ? day_of_week : null,
      month_of_year: typeof month_of_year === 'number' ? month_of_year : null,
      start_date,
      end_date: typeof end_date === 'string' ? end_date : null,
      category: typeof category === 'string' ? category : 'other',
      source: 'manual',
      created_by: user.id,
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Failed to insert recurring entry:', error);
    return apiError('Failed to create recurring entry', 500);
  }

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'finance.recurring.create',
    resource_type: 'finance_recurring',
    resource_id: data.id,
    metadata: { label: data.label, amount: data.amount, currency: data.currency },
  });

  return apiSuccess({ recurring: data }, 201);
});
