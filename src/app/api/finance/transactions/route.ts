import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { firstOfMonthIso, lastOfMonthIso } from '@/lib/finance/recurring';

// GET /api/finance/transactions?month=YYYY-MM&document_id=...&kind=...&currency=...
export const GET = withAuth(async (request: NextRequest, { orgId, supabase }) => {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month');
  const documentId = searchParams.get('document_id');
  const kind = searchParams.get('kind');
  const currency = searchParams.get('currency');

  let q = supabase
    .from('finance_transactions')
    .select('*')
    .eq('org_id', orgId)
    .order('occurred_on', { ascending: false });

  if (month) {
    q = q.gte('occurred_on', firstOfMonthIso(month)).lte('occurred_on', lastOfMonthIso(month));
  }
  if (documentId) q = q.eq('document_id', documentId);
  if (kind) q = q.eq('kind', kind);
  if (currency) q = q.eq('currency', currency.toUpperCase());

  const { data, error } = await q;
  if (error) {
    console.error('Failed to list transactions:', error);
    return apiError('Failed to fetch transactions', 500);
  }

  // Also return the transfer chains for this window so the client can show landed amounts
  const chainIds = Array.from(new Set((data ?? []).map((t) => t.chain_id).filter(Boolean)));
  let chains: unknown[] = [];
  if (chainIds.length > 0) {
    const { data: chainRows } = await supabase
      .from('finance_transfer_chains')
      .select('*')
      .in('id', chainIds as string[]);
    chains = chainRows ?? [];
  }

  return apiSuccess({ transactions: data ?? [], chains });
});
