import { config } from 'dotenv';
import { join } from 'path';
import postgres from 'postgres';

config({ path: join(process.cwd(), '.env') });
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  const rows = await sql`SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'notes'`;
  console.log('notes policies:');
  for (const r of rows) {
    console.log(`  ${r.policyname} (${r.cmd}):`);
    if (r.qual) console.log(`    USING: ${r.qual}`);
    if (r.with_check) console.log(`    WITH CHECK: ${r.with_check}`);
  }

  // Check if get_user_org_ids exists and is security definer
  const fns = await sql`SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('get_user_org_ids', 'user_has_org_role')`;
  console.log('\nHelper functions:', JSON.stringify(fns));

  await sql.end();
}
main();
