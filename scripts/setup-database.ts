/**
 * setup-database.ts
 *
 * Runs all SQL migrations against the Supabase database in order.
 *
 * Prerequisites:
 *   - Set DATABASE_URL in your .env or environment (Supabase connection string,
 *     e.g. postgres://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres)
 *   - Optional: install the `postgres` npm package for direct execution:
 *       npm install --save-dev postgres
 *
 * Usage:
 *   npx tsx scripts/setup-database.ts
 *
 * If the `postgres` package is not installed or DATABASE_URL is not set, the
 * script falls back to printing all SQL so you can paste it into the Supabase
 * SQL Editor manually.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations');

const MIGRATION_FILES = [
  '001_create_tables.sql',
  '002_create_rls_policies.sql',
  '003_create_triggers.sql',
  '004_create_indexes.sql',
];

function readMigration(file: string): string {
  return readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
}

async function runWithPostgres(connectionString: string): Promise<void> {
  // Dynamically import so the script doesn't fail when the package is absent.
  // The `postgres` package is optional — TypeScript can't resolve it until it's
  // installed, so we use a require() wrapper typed as `unknown` to avoid a
  // compile-time TS2307 error while still getting a runtime error when missing.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const postgresModule = require('postgres') as {
    default: (connStr: string, opts: { max: number }) => {
      unsafe: (sql: string) => Promise<unknown>;
      end: () => Promise<void>;
    };
  };
  const postgres = postgresModule.default ?? (postgresModule as unknown as typeof postgresModule.default);

  const sql = postgres(connectionString, { max: 1 });

  try {
    for (const file of MIGRATION_FILES) {
      const content = readMigration(file);
      console.log(`Running ${file}...`);
      await sql.unsafe(content);
      console.log(`  ✓ ${file} complete`);
    }
    console.log('\n✓ All migrations applied successfully.');
  } finally {
    await sql.end();
  }
}

function printSqlFallback(): void {
  console.log('='.repeat(70));
  console.log('DATABASE_URL not set or postgres package not installed.');
  console.log('Copy the SQL below and paste it into the Supabase SQL Editor.');
  console.log('='.repeat(70));
  console.log('');

  for (const file of MIGRATION_FILES) {
    const content = readMigration(file);
    console.log(`-- ${'='.repeat(60)}`);
    console.log(`-- ${file}`);
    console.log(`-- ${'='.repeat(60)}`);
    console.log(content);
    console.log('');
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.warn('DATABASE_URL is not set — falling back to SQL output.\n');
    printSqlFallback();
    return;
  }

  try {
    await runWithPostgres(connectionString);
  } catch (error) {
    const isModuleNotFound =
      error instanceof Error && error.message.includes("Cannot find package 'postgres'");

    if (isModuleNotFound) {
      console.warn(
        'The `postgres` package is not installed.\n' +
          'Install it with: npm install --save-dev postgres\n' +
          'Falling back to SQL output.\n'
      );
      printSqlFallback();
      return;
    }

    // Real database error — surface it and exit non-zero
    console.error('Migration failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
