import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { aggregate } from '@/lib/finance/aggregate';
import { firstOfMonthIso, lastOfMonthIso } from '@/lib/finance/recurring';
import type { FinanceTransaction, FinanceTransferChain } from '@/types/index';

// GET /api/finance/summary?month=YYYY-MM — fast aggregates for the analysis stat row
export const GET = withAuth(async (request: NextRequest, { orgId, supabase }) => {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month');
  if (!month) return apiError('month query parameter is required', 400);

  const start = firstOfMonthIso(month);
  const end = lastOfMonthIso(month);

  const { data: txs, error } = await supabase
    .from('finance_transactions')
    .select('*')
    .eq('org_id', orgId)
    .gte('occurred_on', start)
    .lte('occurred_on', end);
  if (error) return apiError('Failed to load transactions', 500);

  const transactions = (txs ?? []) as FinanceTransaction[];
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
  return apiSuccess({ aggregates, chains, transactions });
});
