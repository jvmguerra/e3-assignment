import { config } from 'dotenv';
import { join } from 'path';
import postgres from 'postgres';

config({ path: join(process.cwd(), '.env') });
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  // Create a security definer function that checks if a user can access a note
  // WITHOUT triggering notes RLS (which would cause recursion via note_shares)
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION user_can_access_note_org(p_user_id uuid, p_note_id uuid)
    RETURNS boolean AS $$
      SELECT EXISTS (
        SELECT 1 FROM notes n
        JOIN org_memberships om ON om.org_id = n.org_id AND om.user_id = p_user_id
        WHERE n.id = p_note_id
      );
    $$ LANGUAGE sql SECURITY DEFINER STABLE;
  `);
  console.log('✓ Created user_can_access_note_org function');

  // Fix note_shares SELECT — use security definer instead of querying notes (which triggers notes_select → note_shares_select recursion)
  await sql.unsafe(`DROP POLICY IF EXISTS note_shares_select ON note_shares`);
  await sql.unsafe(`
    CREATE POLICY note_shares_select ON note_shares FOR SELECT TO authenticated
      USING (user_can_access_note_org(auth.uid(), note_id));
  `);
  console.log('✓ Fixed note_shares_select policy');

  // Fix notes_select — the note_shares subquery must also not trigger note_shares RLS.
  // Replace the EXISTS on note_shares with a security definer check.
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION user_is_shared_on_note(p_user_id uuid, p_note_id uuid)
    RETURNS boolean AS $$
      SELECT EXISTS (
        SELECT 1 FROM note_shares WHERE note_id = p_note_id AND user_id = p_user_id
      );
    $$ LANGUAGE sql SECURITY DEFINER STABLE;
  `);
  console.log('✓ Created user_is_shared_on_note function');

  await sql.unsafe(`DROP POLICY IF EXISTS notes_select ON notes`);
  await sql.unsafe(`
    CREATE POLICY notes_select ON notes FOR SELECT TO authenticated
      USING (
        org_id IN (SELECT get_user_org_ids(auth.uid()))
        AND (
          user_has_org_role(auth.uid(), org_id, ARRAY['owner','admin'])
          OR created_by = auth.uid()
          OR visibility = 'public'
          OR (visibility = 'shared' AND user_is_shared_on_note(auth.uid(), id))
        )
      );
  `);
  console.log('✓ Fixed notes_select policy');

  // Also fix note_versions_select and ai_summaries_select which have the same pattern
  await sql.unsafe(`DROP POLICY IF EXISTS note_versions_select ON note_versions`);
  await sql.unsafe(`
    CREATE POLICY note_versions_select ON note_versions FOR SELECT TO authenticated
      USING (user_can_access_note_org(auth.uid(), note_id));
  `);
  console.log('✓ Fixed note_versions_select policy');

  await sql.unsafe(`DROP POLICY IF EXISTS ai_summaries_select ON ai_summaries`);
  await sql.unsafe(`
    CREATE POLICY ai_summaries_select ON ai_summaries FOR SELECT TO authenticated
      USING (user_can_access_note_org(auth.uid(), note_id));
  `);
  console.log('✓ Fixed ai_summaries_select policy');

  await sql.end();
  console.log('\n✓ All circular RLS references fixed');
}
main().catch(e => { console.error(e); process.exit(1); });
