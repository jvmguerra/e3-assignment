import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { auditLog } from '@/lib/logger';

type AllowedKind = 'income' | 'expense' | 'transfer_out' | 'transfer_in' | 'transfer_fee';

// PATCH /api/finance/transactions/[id] — edit category/kind/description
export const PATCH = withAuth(async (request: NextRequest, { user, orgId, supabase, params }) => {
  const { id } = params;
  const body = await request.json().catch(() => null);
  if (!body) return apiError('Invalid JSON body', 400);

  const allowed: Record<string, unknown> = {};
  if (typeof body.category === 'string') allowed.category = body.category;
  if (typeof body.description === 'string') allowed.description = body.description;
  if (typeof body.kind === 'string') {
    const validKinds: AllowedKind[] = [
      'income',
      'expense',
      'transfer_out',
      'transfer_in',
      'transfer_fee',
    ];
    if (!validKinds.includes(body.kind as AllowedKind)) {
      return apiError('Invalid kind', 400);
    }
    allowed.kind = body.kind;
  }

  if (Object.keys(allowed).length === 0) {
    return apiError('No editable fields provided', 400);
  }

  const { data, error } = await supabase
    .from('finance_transactions')
    .update(allowed)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    return apiError('Failed to update transaction', 500);
  }

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'finance.transaction.update',
    resource_type: 'finance_transaction',
    resource_id: id,
    metadata: allowed,
  });

  return apiSuccess({ transaction: data });
});

// DELETE /api/finance/transactions/[id]
export const DELETE = withAuth(async (_request: NextRequest, { user, orgId, supabase, params }) => {
  const { id } = params;
  const { error } = await supabase.from('finance_transactions').delete().eq('id', id);
  if (error) return apiError('Failed to delete transaction', 500);

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'finance.transaction.delete',
    resource_type: 'finance_transaction',
    resource_id: id,
  });

  return apiSuccess({ success: true });
});
