import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { auditLog } from '@/lib/logger';
import { callOpenRouter } from '@/lib/ai/openrouter';
import {
  FinanceAnalysisSchema,
  ANALYSIS_SYSTEM,
  ANALYSIS_PRESETS,
  buildAnalysisUserPrompt,
} from '@/lib/ai/finance-prompts';
import { aggregate } from '@/lib/finance/aggregate';
import { firstOfMonthIso, lastOfMonthIso } from '@/lib/finance/recurring';
import type { FinanceTransaction, FinanceTransferChain, AnalysisPromptKind } from '@/types/index';

function prevMonthIso(monthIso: string): string {
  const [y, m] = monthIso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// GET /api/finance/analysis?month=YYYY-MM — list cached analyses for a month
export const GET = withAuth(async (request: NextRequest, { orgId, supabase }) => {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month');
  if (!month) return apiError('month query parameter is required', 400);

  const { data, error } = await supabase
    .from('finance_analyses')
    .select('*')
    .eq('org_id', orgId)
    .eq('month', firstOfMonthIso(month))
    .order('created_at', { ascending: false });

  if (error) return apiError('Failed to fetch analyses', 500);
  return apiSuccess({ analyses: data ?? [] });
});

// POST /api/finance/analysis — generate a new analysis
// Body: { month: 'YYYY-MM', kind: 'preset'|'freeform', presetKey?, prompt? }
export const POST = withAuth(async (request: NextRequest, { user, orgId, supabase }) => {
  const body = await request.json().catch(() => null);
  if (!body) return apiError('Invalid JSON body', 400);

  const month = body.month as string | undefined;
  const kind = body.kind as AnalysisPromptKind | undefined;
  const presetKey = body.presetKey as string | undefined;
  const promptText = body.prompt as string | undefined;

  if (!month || !/^\d{4}-\d{2}/.test(month)) return apiError('month must be YYYY-MM', 400);
  if (kind !== 'preset' && kind !== 'freeform') return apiError('kind must be preset|freeform', 400);

  let resolvedPrompt: string;
  let resolvedKey: string | null = null;
  if (kind === 'preset') {
    if (!presetKey || !(presetKey in ANALYSIS_PRESETS)) return apiError('Unknown presetKey', 400);
    resolvedPrompt = ANALYSIS_PRESETS[presetKey];
    resolvedKey = presetKey;
  } else {
    if (!promptText || !promptText.trim()) return apiError('prompt is required for freeform', 400);
    resolvedPrompt = promptText.trim();
  }

  const monthStart = firstOfMonthIso(month);
  const monthEnd = lastOfMonthIso(month);
  const prev = prevMonthIso(month);
  const prevStart = firstOfMonthIso(prev);
  const prevEnd = lastOfMonthIso(prev);

  const { data: txs } = await supabase
    .from('finance_transactions')
    .select('*')
    .eq('org_id', orgId)
    .gte('occurred_on', monthStart)
    .lte('occurred_on', monthEnd);
  const { data: prevTxs } = await supabase
    .from('finance_transactions')
    .select('*')
    .eq('org_id', orgId)
    .gte('occurred_on', prevStart)
    .lte('occurred_on', prevEnd);

  const transactions = (txs ?? []) as FinanceTransaction[];
  const prevTransactions = (prevTxs ?? []) as FinanceTransaction[];

  const chainIds = Array.from(new Set(transactions.map((t) => t.chain_id).filter(Boolean)));
  let chains: FinanceTransferChain[] = [];
  if (chainIds.length > 0) {
    const { data: chainRows } = await supabase
      .from('finance_transfer_chains')
      .select('*')
      .in('id', chainIds as string[]);
    chains = (chainRows ?? []) as FinanceTransferChain[];
  }

  const aggregates = aggregate(transactions, chains);
  const prevAggregates = aggregate(prevTransactions, []);

  let result;
  try {
    result = await callOpenRouter(FinanceAnalysisSchema, {
      system: ANALYSIS_SYSTEM,
      user: buildAnalysisUserPrompt(resolvedPrompt, {
        month,
        transactions,
        prevTransactions,
        chains,
        aggregates,
        prevAggregates,
      }),
      maxTokens: 6000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Analysis failed';
    console.error('analysis call failed:', msg);
    await auditLog(supabase, {
      org_id: orgId,
      user_id: user.id,
      action: 'finance.analysis.failed',
      metadata: { error: msg, month, kind, presetKey: resolvedKey },
    });
    return apiError(`AI analysis failed: ${msg}`, 502);
  }

  const { data: inserted, error: insertError } = await supabase
    .from('finance_analyses')
    .insert({
      org_id: orgId,
      month: monthStart,
      prompt_kind: kind,
      prompt_key: resolvedKey,
      prompt_text: kind === 'freeform' ? resolvedPrompt : null,
      result,
      created_by: user.id,
    })
    .select()
    .single();

  if (insertError || !inserted) {
    console.error('Failed to save analysis:', insertError);
    return apiError('Failed to save analysis', 500);
  }

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'finance.analysis.completed',
    resource_type: 'finance_analysis',
    resource_id: inserted.id,
    metadata: { month, kind, presetKey: resolvedKey },
  });

  return apiSuccess({ analysis: inserted, aggregates, chains }, 201);
});
