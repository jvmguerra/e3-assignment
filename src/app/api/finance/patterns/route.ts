import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { auditLog } from '@/lib/logger';
import { callOpenRouter } from '@/lib/ai/openrouter';
import {
  PatternsSchema,
  PATTERN_SYSTEM,
  buildPatternUserPrompt,
} from '@/lib/ai/finance-prompts';
import type { FinanceTransaction, RecurringCadence } from '@/types/index';

// GET /api/finance/patterns?status=pending
export const GET = withAuth(async (request: NextRequest, { orgId, supabase }) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'pending';

  const { data, error } = await supabase
    .from('finance_patterns')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', status)
    .order('confidence', { ascending: false });

  if (error) return apiError('Failed to fetch patterns', 500);
  return apiSuccess({ patterns: data ?? [] });
});

// POST /api/finance/patterns — run AI detection across recent transactions
export const POST = withAuth(async (_req: NextRequest, { user, orgId, supabase }) => {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setUTCMonth(threeMonthsAgo.getUTCMonth() - 3);
  const sinceIso = threeMonthsAgo.toISOString().slice(0, 10);

  const { data: txs, error: txError } = await supabase
    .from('finance_transactions')
    .select('*')
    .eq('org_id', orgId)
    .eq('kind', 'expense')
    .gte('occurred_on', sinceIso)
    .order('occurred_on', { ascending: true });

  if (txError) return apiError('Failed to load transactions', 500);
  if (!txs || txs.length === 0) {
    return apiSuccess({ patterns: [], message: 'No transactions to analyze' });
  }

  let result;
  try {
    result = await callOpenRouter(PatternsSchema, {
      system: PATTERN_SYSTEM,
      user: buildPatternUserPrompt(txs as FinanceTransaction[]),
      maxTokens: 2000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Pattern detection failed';
    console.error(msg);
    await auditLog(supabase, {
      org_id: orgId,
      user_id: user.id,
      action: 'finance.patterns.failed',
      metadata: { error: msg },
    });
    return apiError('Pattern detection failed', 502);
  }

  const rows = result.patterns.map((p) => ({
    org_id: orgId,
    proposed: {
      label: p.label,
      amount: p.amount,
      currency: p.currency.toUpperCase(),
      cadence: p.cadence as RecurringCadence,
      day_of_month: p.day_of_month,
      category: p.category,
      sample_transaction_ids: p.sample_transaction_ids,
    },
    confidence: p.confidence,
    status: 'pending' as const,
  }));

  if (rows.length === 0) return apiSuccess({ patterns: [] });

  const { data, error } = await supabase.from('finance_patterns').insert(rows).select();
  if (error) {
    console.error('Failed to insert patterns:', error);
    return apiError('Failed to save patterns', 500);
  }

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'finance.patterns.detected',
    metadata: { count: rows.length },
  });

  return apiSuccess({ patterns: data ?? [] }, 201);
});
