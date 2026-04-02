/**
 * reset-database.ts
 *
 * Wipes all application data from the database without dropping any tables or
 * altering the schema. Useful for re-running the seed script from a clean state.
 *
 * What it does:
 *   1. Deletes all rows from application tables in reverse FK dependency order
 *   2. Deletes all Supabase auth users
 *   3. Removes all files from every storage bucket
 *
 * What it does NOT do:
 *   - Drop or alter any tables, functions, triggers, or policies
 *   - Touch migration history
 *
 * Usage:
 *   npx tsx scripts/reset-database.ts
 */

import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(process.cwd(), '.env') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Sentinel UUID — the delete filter `.neq('id', SENTINEL)` matches every real
// row because no real row will ever have this id. This is the idiomatic way to
// issue an unconditional delete via the Supabase JS client (which requires at
// least one filter clause to avoid accidental full-table wipes).
const SENTINEL = '00000000-0000-0000-0000-000000000000';

async function deleteTable(table: string): Promise<void> {
  const { error } = await supabase.from(table).delete().neq('id', SENTINEL);
  if (error) throw new Error(`Failed to delete from ${table}: ${error.message}`);
  console.log(`  Cleared: ${table}`);
}

async function main() {
  console.log('Resetting database...\n');

  // ------------------------------------------------------------------
  // 1. Delete application data in reverse FK dependency order
  // ------------------------------------------------------------------
  // Leaf tables first, then tables they reference
  await deleteTable('audit_logs');
  await deleteTable('ai_summaries');
  await deleteTable('note_shares');
  await deleteTable('note_versions');
  await deleteTable('files');
  await deleteTable('notes');
  await deleteTable('org_memberships');
  await deleteTable('organizations');
  // profiles are deleted automatically when auth users are deleted (CASCADE)

  // ------------------------------------------------------------------
  // 2. Delete all auth users
  // ------------------------------------------------------------------
  console.log('\nDeleting auth users...');
  const { data: listData, error: listError } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listError) throw new Error(`Failed to list auth users: ${listError.message}`);

  const users = listData?.users ?? [];
  if (users.length === 0) {
    console.log('  No auth users found.');
  } else {
    for (const user of users) {
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      if (error) {
        console.warn(`  Warning: could not delete user ${user.email}: ${error.message}`);
      } else {
        console.log(`  Deleted user: ${user.email}`);
      }
    }
  }

  // ------------------------------------------------------------------
  // 3. Remove all files from every storage bucket
  // ------------------------------------------------------------------
  console.log('\nClearing storage buckets...');
  const { data: buckets, error: bucketListError } = await supabase.storage.listBuckets();
  if (bucketListError) {
    console.warn(`  Warning: could not list buckets: ${bucketListError.message}`);
  } else if (!buckets || buckets.length === 0) {
    console.log('  No storage buckets found.');
  } else {
    for (const bucket of buckets) {
      await clearBucketFolder(bucket.name, '');
      console.log(`  Cleared bucket: ${bucket.name}`);
    }
  }

  console.log('\nDatabase reset complete.');
}

/**
 * Recursively lists and removes all objects under `prefix` in `bucket`.
 * Supabase Storage returns at most 100 items per list call (default), so we
 * paginate by re-listing until the folder is empty.
 */
async function clearBucketFolder(bucket: string, prefix: string): Promise<void> {
  while (true) {
    const { data: items, error } = await supabase.storage
      .from(bucket)
      .list(prefix || undefined, { limit: 100 });

    if (error) {
      console.warn(`  Warning: failed to list ${bucket}/${prefix}: ${error.message}`);
      return;
    }

    if (!items || items.length === 0) break;

    const filePaths: string[] = [];
    const folderPrefixes: string[] = [];

    for (const item of items) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      // Items without a metadata.size are pseudo-folders in the flat namespace
      if (item.metadata == null) {
        folderPrefixes.push(fullPath);
      } else {
        filePaths.push(fullPath);
      }
    }

    // Recurse into sub-folders first
    for (const folder of folderPrefixes) {
      await clearBucketFolder(bucket, folder);
    }

    // Delete files in this folder
    if (filePaths.length > 0) {
      const { error: removeError } = await supabase.storage.from(bucket).remove(filePaths);
      if (removeError) {
        console.warn(`  Warning: failed to remove files in ${bucket}/${prefix}: ${removeError.message}`);
      }
    }

    // If we got fewer items than the page limit we've exhausted this level
    if (items.length < 100) break;
  }
}

main().catch(err => {
  console.error('\nReset failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
