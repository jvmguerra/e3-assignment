import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';

// GET /api/finance/fx-rates — latest observed FX rates per (from, to) currency pair
export const GET = withAuth(async (_req: NextRequest, { orgId, supabase }) => {
  const { data, error } = await supabase
    .from('finance_fx_observations')
    .select('*')
    .eq('org_id', orgId)
    .order('observed_on', { ascending: false });

  if (error) return apiError('Failed to fetch FX observations', 500);

  const latest = new Map<string, (typeof data)[number]>();
  for (const obs of data ?? []) {
    const key = `${obs.from_currency}_${obs.to_currency}`;
    if (!latest.has(key)) latest.set(key, obs);
  }
  return apiSuccess({ observations: Array.from(latest.values()), all: data ?? [] });
});
