/**
 * setup-database.ts
 *
 * Runs all SQL migrations against the Supabase database in order.
 *
 * Usage:
 *   npx tsx scripts/setup-database.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';
import postgres from 'postgres';

// Load .env from project root
config({ path: join(process.cwd(), '.env') });

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations');

const MIGRATION_FILES = [
  '001_create_tables.sql',
  '002_create_rls_policies.sql',
  '003_create_triggers.sql',
  '004_create_indexes.sql',
  '005_create_finance_tables.sql',
  '006_create_finance_indexes.sql',
  '007_create_finance_rls.sql',
];

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('DATABASE_URL is not set in .env');
    process.exit(1);
  }

  const sql = postgres(connectionString, { max: 1 });

  try {
    for (const file of MIGRATION_FILES) {
      const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      console.log(`Running ${file}...`);
      await sql.unsafe(content);
      console.log(`  ✓ ${file} complete`);
    }
    console.log('\n✓ All migrations applied successfully.');
  } catch (error) {
    console.error('Migration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
