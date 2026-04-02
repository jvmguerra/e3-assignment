import { config } from 'dotenv';
import { join } from 'path';
import postgres from 'postgres';

config({ path: join(process.cwd(), '.env') });
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  const rows = await sql`SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'organizations'`;
  console.log('organizations policies:', JSON.stringify(rows, null, 2));

  const rows2 = await sql`SELECT policyname, cmd FROM pg_policies WHERE tablename = 'org_memberships'`;
  console.log('\norg_memberships policies:', JSON.stringify(rows2, null, 2));

  await sql.end();
}
main();
