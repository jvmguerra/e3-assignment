import { NextRequest } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { auditLog } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { callOpenRouter } from '@/lib/ai/openrouter';
import {
  ExtractionSchema,
  EXTRACTION_SYSTEM,
  buildExtractionUserPrompt,
  type ExtractedTransaction,
} from '@/lib/ai/finance-prompts';
import { extractDocumentText, chunkText } from '@/lib/finance/extract';
import { normalizeMerchant } from '@/lib/finance/categorize';
import { buildChains, persistChains } from '@/lib/finance/chains';
import type { FinanceTransaction } from '@/types/index';

const BUCKET = 'finance-docs';
const RATE_LIMIT_PER_HOUR = 30;

// POST /api/finance/documents/[id]/extract — synchronously extract transactions
export const POST = withAuth(async (_request: NextRequest, { user, orgId, supabase, params }) => {
  const { id } = params;

  // Rate-limit per user (count audit events in last hour)
  const admin = createAdminClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: rateCount } = await admin
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('action', 'finance.extract.requested')
    .gte('created_at', oneHourAgo);
  if ((rateCount ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return apiError(
      `Rate limit exceeded: max ${RATE_LIMIT_PER_HOUR} extractions per hour`,
      429
    );
  }

  const { data: doc, error: docError } = await supabase
    .from('finance_documents')
    .select('*')
    .eq('id', id)
    .single();

  if (docError || !doc) return apiError('Document not found', 404);

  if (doc.extraction_status === 'processing') {
    return apiError('Extraction already in progress', 409);
  }

  await supabase
    .from('finance_documents')
    .update({ extraction_status: 'processing', extraction_error: null })
    .eq('id', id);

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'finance.extract.requested',
    resource_type: 'finance_document',
    resource_id: id,
    metadata: { file_name: doc.file_name },
  });

  // Download the file
  const { data: blob, error: dlError } = await admin.storage.from(BUCKET).download(doc.file_path);
  if (dlError || !blob) {
    await markFailed(supabase, id, 'Failed to download file from storage');
    return apiError('Failed to download document', 500);
  }
  const buffer = Buffer.from(await blob.arrayBuffer());

  // Extract raw text
  let text = '';
  try {
    const result = await extractDocumentText(buffer, doc.mime_type, doc.file_name);
    text = result.text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Text extraction failed';
    await markFailed(supabase, id, msg);
    return apiError(`Document parse failed: ${msg}`, 502);
  }

  if (!text.trim()) {
    await markFailed(supabase, id, 'Document contained no extractable text');
    return apiError('Document contained no extractable text', 422);
  }

  // List other accounts in this org so the model knows they belong to the user
  const { data: otherDocs } = await supabase
    .from('finance_documents')
    .select('account_label')
    .eq('org_id', orgId)
    .neq('id', id);
  const knownLabels = Array.from(
    new Set(((otherDocs ?? []) as { account_label: string }[]).map((d) => d.account_label).filter(Boolean))
  );

  // Chunk + call OpenRouter
  const chunks = chunkText(text);
  const all: ExtractedTransaction[] = [];
  for (const chunk of chunks) {
    try {
      const result = await callOpenRouter(ExtractionSchema, {
        system: EXTRACTION_SYSTEM,
        user: buildExtractionUserPrompt(chunk, doc.account_label, knownLabels),
        maxTokens: 8000,
      });
      all.push(...result.transactions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI extraction failed';
      console.error('Extraction chunk failed:', msg);
      await markFailed(supabase, id, msg);
      await auditLog(supabase, {
        org_id: orgId,
        user_id: user.id,
        action: 'finance.extract.failed',
        resource_type: 'finance_document',
        resource_id: id,
        metadata: { error: msg },
      });
      return apiError('AI extraction failed', 502);
    }
  }

  if (all.length === 0) {
    await markFailed(supabase, id, 'AI returned no transactions');
    return apiError('AI returned no transactions', 422);
  }

  // Persist transactions
  const rows = all.map((t) => ({
    org_id: orgId,
    document_id: id,
    occurred_on: t.occurred_on,
    description: t.description,
    merchant_normalized: normalizeMerchant(t.description),
    amount: t.amount,
    currency: t.currency.toUpperCase(),
    category: t.category,
    kind: t.kind,
    raw_extracted: t as unknown as Record<string, unknown>,
  }));

  const { error: insertError } = await supabase.from('finance_transactions').insert(rows);
  if (insertError) {
    console.error('Failed to insert transactions:', insertError);
    await markFailed(supabase, id, 'Failed to persist transactions');
    return apiError('Failed to save transactions', 500);
  }

  // Build + persist chains across the org's transactions
  const { data: orgTransactions } = await supabase
    .from('finance_transactions')
    .select('*')
    .eq('org_id', orgId)
    .is('chain_id', null);

  if (orgTransactions && orgTransactions.length > 0) {
    const chains = buildChains(orgTransactions as FinanceTransaction[]);
    await persistChains(supabase, orgId, chains);
  }

  // Update doc status + detected currencies
  const currencies = Array.from(new Set(rows.map((r) => r.currency)));
  await supabase
    .from('finance_documents')
    .update({
      extraction_status: 'completed',
      detected_currencies: currencies,
      extraction_error: null,
    })
    .eq('id', id);

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'finance.extract.completed',
    resource_type: 'finance_document',
    resource_id: id,
    metadata: { transaction_count: rows.length, currencies },
  });

  return apiSuccess({ transaction_count: rows.length, currencies });
});

async function markFailed(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  id: string,
  error: string
) {
  await supabase
    .from('finance_documents')
    .update({ extraction_status: 'failed', extraction_error: error })
    .eq('id', id);
}
