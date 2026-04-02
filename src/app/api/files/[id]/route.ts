import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { auditLog } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/files/[id] — Get a signed download URL for a file
export const GET = withAuth(async (_request: NextRequest, { user, orgId, supabase, params }) => {
  const { id } = params;

  // Fetch file record — RLS ensures user can only access files in their org
  const { data: file, error: fetchError } = await supabase
    .from('files')
    .select(`
      *,
      uploader:profiles!uploaded_by (
        id,
        email,
        display_name,
        avatar_url,
        created_at
      )
    `)
    .eq('id', id)
    .single();

  if (fetchError || !file) {
    return apiError('File not found', 404);
  }

  // Generate a signed URL valid for 1 hour
  const admin = createAdminClient();
  const { data: signedData, error: signedError } = await admin.storage
    .from('org-files')
    .createSignedUrl(file.file_path, 3600);

  if (signedError || !signedData) {
    console.error('Failed to generate signed URL:', signedError);
    return apiError('Failed to generate download URL', 500);
  }

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'file.download',
    resource_type: 'file',
    resource_id: file.id,
    metadata: {
      file_name: file.file_name,
    },
  });

  return apiSuccess({ file, download_url: signedData.signedUrl });
});

// DELETE /api/files/[id] — Delete a file
export const DELETE = withAuth(async (_request: NextRequest, { user, orgId, membership, supabase, params }) => {
  const { id } = params;

  // Fetch file record — RLS ensures it belongs to the org
  const { data: file, error: fetchError } = await supabase
    .from('files')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !file) {
    return apiError('File not found', 404);
  }

  // Permission check: only the uploader or org admin/owner may delete
  const isUploader = file.uploaded_by === user.id;
  const isPrivileged = membership.role === 'admin' || membership.role === 'owner';

  if (!isUploader && !isPrivileged) {
    return apiError('You do not have permission to delete this file', 403);
  }

  const admin = createAdminClient();

  // Delete from Supabase Storage
  const { error: storageError } = await admin.storage
    .from('org-files')
    .remove([file.file_path]);

  if (storageError) {
    console.error('Failed to delete file from storage:', storageError);
    return apiError('Failed to delete file from storage', 500);
  }

  // Delete the DB record
  const { error: dbError } = await supabase
    .from('files')
    .delete()
    .eq('id', id);

  if (dbError) {
    console.error('Failed to delete file record:', dbError);
    return apiError('Failed to delete file record', 500);
  }

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'file.delete',
    resource_type: 'file',
    resource_id: id,
    metadata: {
      file_name: file.file_name,
      file_path: file.file_path,
    },
  });

  return apiSuccess({ success: true }) as NextResponse;
});
