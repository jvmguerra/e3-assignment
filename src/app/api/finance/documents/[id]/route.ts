import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { auditLog } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'finance-docs';

// GET /api/finance/documents/[id] — fetch metadata + signed download URL
export const GET = withAuth(async (_request: NextRequest, { user, orgId, supabase, params }) => {
  const { id } = params;

  const { data: doc, error } = await supabase
    .from('finance_documents')
    .select(`
      *,
      uploader:profiles!uploaded_by ( id, email, display_name, avatar_url, created_at )
    `)
    .eq('id', id)
    .single();

  if (error || !doc) return apiError('Document not found', 404);

  const admin = createAdminClient();
  const { data: signed, error: signedError } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(doc.file_path, 3600);

  if (signedError || !signed) {
    console.error('Failed to sign finance doc URL:', signedError);
    return apiError('Failed to generate download URL', 500);
  }

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'finance.document.download',
    resource_type: 'finance_document',
    resource_id: doc.id,
    metadata: { file_name: doc.file_name },
  });

  return apiSuccess({ document: doc, download_url: signed.signedUrl });
});

// DELETE /api/finance/documents/[id] — delete file + cascade transactions
export const DELETE = withAuth(
  async (_request: NextRequest, { user, orgId, membership, supabase, params }) => {
    const { id } = params;

    const { data: doc, error: fetchError } = await supabase
      .from('finance_documents')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !doc) return apiError('Document not found', 404);

    const isUploader = doc.uploaded_by === user.id;
    const isPrivileged = membership.role === 'admin' || membership.role === 'owner';
    if (!isUploader && !isPrivileged) {
      return apiError('You do not have permission to delete this document', 403);
    }

    const admin = createAdminClient();
    const { error: storageError } = await admin.storage.from(BUCKET).remove([doc.file_path]);
    if (storageError) {
      console.error('Failed to delete finance doc from storage:', storageError);
      return apiError('Failed to delete document storage', 500);
    }

    const { error: dbError } = await supabase.from('finance_documents').delete().eq('id', id);
    if (dbError) {
      console.error('Failed to delete finance_documents row:', dbError);
      return apiError('Failed to delete document record', 500);
    }

    await auditLog(supabase, {
      org_id: orgId,
      user_id: user.id,
      action: 'finance.document.delete',
      resource_type: 'finance_document',
      resource_id: id,
      metadata: { file_name: doc.file_name },
    });

    return apiSuccess({ success: true }) as NextResponse;
  }
);
