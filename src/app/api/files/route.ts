import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';
import { auditLog } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// GET /api/files — List files in the org, optionally filtered by note
export const GET = withAuth(async (request: NextRequest, { orgId, supabase }) => {
  const { searchParams } = new URL(request.url);
  const noteId = searchParams.get('note_id');

  let query = supabase
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
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (noteId) {
    query = query.eq('note_id', noteId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to list files:', error);
    return apiError('Failed to fetch files', 500);
  }

  return apiSuccess({ files: data });
});

// POST /api/files — Upload a file
export const POST = withAuth(async (request: NextRequest, { user, orgId, supabase }) => {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const noteId = formData.get('note_id') as string | null;

  // Validate file presence
  if (!file) {
    return apiError('No file provided', 400);
  }

  // Validate file name
  if (!file.name) {
    return apiError('File must have a name', 400);
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return apiError('File exceeds 10MB size limit', 400);
  }

  // Generate a unique storage path
  const originalFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${orgId}/${crypto.randomUUID()}_${originalFileName}`;

  // Read file content
  const buffer = Buffer.from(await file.arrayBuffer());

  // Use admin client for storage operations (bypasses storage policies)
  const admin = createAdminClient();

  // Ensure the bucket exists (idempotent)
  const { error: bucketError } = await admin.storage.createBucket('org-files', {
    public: false,
  });
  // Ignore "already exists" errors
  if (bucketError && !bucketError.message.includes('already exists')) {
    console.error('Failed to ensure bucket exists:', bucketError);
    return apiError('Storage initialization failed', 500);
  }

  // Upload file to storage
  const { error: uploadError } = await admin.storage.from('org-files').upload(filePath, buffer, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    console.error('Failed to upload file to storage:', uploadError);
    return apiError('File upload to storage failed', 500);
  }

  // Insert metadata into files table (uses user's client so RLS applies)
  const { data, error: dbError } = await supabase
    .from('files')
    .insert({
      org_id: orgId,
      note_id: noteId || null,
      uploaded_by: user.id,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type,
    })
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
    .single();

  if (dbError) {
    // Attempt to clean up the uploaded storage object on DB failure
    await admin.storage.from('org-files').remove([filePath]);
    console.error('Failed to insert file record:', dbError);
    return apiError('Failed to save file metadata', 500);
  }

  await auditLog(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'file.upload',
    resource_type: 'file',
    resource_id: data.id,
    metadata: {
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      note_id: noteId || null,
    },
  });

  return apiSuccess({ file: data }, 201) as NextResponse;
});
