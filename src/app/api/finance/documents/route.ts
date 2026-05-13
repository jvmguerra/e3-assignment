import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { auditLog } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { firstOfMonthIso } from '@/lib/finance/recurring';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const BUCKET = 'finance-docs';

// GET /api/finance/documents?month=YYYY-MM — list documents (optional month filter)
export const GET = withAuth(async (request: NextRequest, { orgId, supabase }) => {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month');

  let query = supabase
    .from('finance_documents')
    .select(`
      *,
      uploader:profiles!uploaded_by ( id, email, display_name, avatar_url, created_at )
    `)
    .eq('org_id', orgId)
    .order('statement_month', { ascending: false })
    .order('created_at', { ascending: false });

  if (month) {
    const start = firstOfMonthIso(month);
    query = query.eq('statement_month', start);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Failed to list finance documents:', error);
    return apiError('Failed to fetch finance documents', 500);
  }

  return apiSuccess({ documents: data });
});

// POST /api/finance/documents — upload a statement
// Form fields: file (PDF/CSV), statement_month (YYYY-MM or YYYY-MM-DD), account_label
export const POST = withAuth(async (request: NextRequest, { user, orgId, supabase }) => {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const statementMonthRaw = formData.get('statement_month') as string | null;
  const accountLabel = ((formData.get('account_label') as string | null) ?? '').trim();

  if (!file) return apiError('No file provided', 400);
  if (!file.name) return apiError('File must have a name', 400);
  if (file.size > MAX_FILE_SIZE) return apiError('File exceeds 10MB size limit', 400);
  if (!statementMonthRaw) return apiError('statement_month is required (YYYY-MM)', 400);

  const monthIso = firstOfMonthIso(statementMonthRaw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(monthIso)) {
    return apiError('statement_month must be YYYY-MM or YYYY-MM-DD', 400);
  }

  const lower = file.name.toLowerCase();
  const isPdf = file.type === 'application/pdf' || lower.endsWith('.pdf');
  const isCsv =
    file.type === 'text/csv' ||
    file.type === 'application/csv' ||
    lower.endsWith('.csv');
  if (!isPdf && !isCsv) {
    return apiError('Only PDF and CSV files are supported', 400);
  }

  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${orgId}/${monthIso}/${crypto.randomUUID()}_${sanitized}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const admin = createAdminClient();
  const { error: bucketError } = await admin.storage.createBucket(BUCKET, { public: false });
  if (bucketError && !bucketError.message.includes('already exists')) {
    console.error('Failed to ensure finance-docs bucket:', bucketError);
    return apiError('Storage initialization failed', 500);
  }

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(filePath, buffer, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    console.error('Failed to upload finance document:', uploadError);
    return apiError('File upload failed', 500);
  }

  const { data, error: dbError } = await supabase
    .from('finance_documents')
    .insert({
      org_id: orgId,
      uploaded_by: user.id,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type,
      statement_month: monthIso,
      account_label: accountLabel,
      extraction_status: 'pending',
    })
    .select(`
      *,
      uploader:profiles!uploaded_by ( id, email, display_name, avatar_url, created_at )
    `)
    .single();

  if (dbError) {
    await admin.storage.from(BUCKET).remove([filePath]);
    console.error('Failed to insert finance_documents row:', dbError);
    return apiError('Failed to save document metadata', 500);
  }

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'finance.document.upload',
    resource_type: 'finance_document',
    resource_id: data.id,
    metadata: {
      file_name: file.name,
      file_size: file.size,
      statement_month: monthIso,
      account_label: accountLabel,
    },
  });

  return apiSuccess({ document: data }, 201) as NextResponse;
});
