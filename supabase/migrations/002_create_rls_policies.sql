-- 002_create_rls_policies.sql
-- Row Level Security policies for all tables
--
-- IMPORTANT: org_memberships policies cannot self-reference (causes infinite recursion).
-- We use SECURITY DEFINER helper functions to break the cycle.

-- ============================================================
-- HELPER FUNCTIONS (SECURITY DEFINER — bypass RLS)
-- ============================================================

-- Returns all org_ids a user belongs to. Used in policies to avoid
-- self-referencing org_memberships (which would cause infinite recursion).
CREATE OR REPLACE FUNCTION get_user_org_ids(p_user_id uuid)
RETURNS SETOF uuid AS $$
  SELECT org_id FROM org_memberships WHERE user_id = p_user_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Checks if a user has any of the given roles in an org.
CREATE OR REPLACE FUNCTION user_has_org_role(p_user_id uuid, p_org_id uuid, p_roles text[])
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_memberships
    WHERE user_id = p_user_id AND org_id = p_org_id AND role = ANY(p_roles)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Checks if a user can access a note's org (bypasses notes RLS to avoid recursion
-- through note_shares → notes → note_shares).
CREATE OR REPLACE FUNCTION user_can_access_note_org(p_user_id uuid, p_note_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM notes n
    JOIN org_memberships om ON om.org_id = n.org_id AND om.user_id = p_user_id
    WHERE n.id = p_note_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Checks if a user has a share record on a note (bypasses note_shares RLS).
CREATE OR REPLACE FUNCTION user_is_shared_on_note(p_user_id uuid, p_note_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM note_shares WHERE note_id = p_note_id AND user_id = p_user_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Inserts an audit log entry. Users have no INSERT policy on audit_logs;
-- all application code calls this function instead.
CREATE OR REPLACE FUNCTION insert_audit_log(
  p_org_id uuid,
  p_user_id uuid,
  p_action text,
  p_resource_type text DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}',
  p_ip_address text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO audit_logs (org_id, user_id, action, resource_type, resource_id, metadata, ip_address)
  VALUES (p_org_id, p_user_id, p_action, p_resource_type, p_resource_id, p_metadata, p_ip_address);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PROFILES
-- ============================================================

CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================
-- ORGANIZATIONS
-- ============================================================

CREATE POLICY organizations_select ON organizations FOR SELECT TO authenticated
  USING (id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY organizations_insert ON organizations FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================================
-- ORG_MEMBERSHIPS
-- ============================================================

CREATE POLICY org_memberships_select ON org_memberships FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY org_memberships_insert ON org_memberships FOR INSERT TO authenticated
  WITH CHECK (
    user_has_org_role(auth.uid(), org_id, ARRAY['owner','admin'])
    OR NOT EXISTS (SELECT 1 FROM org_memberships om2 WHERE om2.org_id = org_memberships.org_id)
  );

CREATE POLICY org_memberships_update ON org_memberships FOR UPDATE TO authenticated
  USING (user_has_org_role(auth.uid(), org_id, ARRAY['owner','admin']))
  WITH CHECK (user_has_org_role(auth.uid(), org_id, ARRAY['owner','admin']));

CREATE POLICY org_memberships_delete ON org_memberships FOR DELETE TO authenticated
  USING (user_has_org_role(auth.uid(), org_id, ARRAY['owner','admin']));

-- ============================================================
-- NOTES
-- admin/owner see ALL notes in org (including private).
-- Members see: public + own + shared-to-them.
-- ============================================================

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

CREATE POLICY notes_insert ON notes FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT get_user_org_ids(auth.uid()))
    AND created_by = auth.uid()
  );

CREATE POLICY notes_update ON notes FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT get_user_org_ids(auth.uid()))
    AND (created_by = auth.uid() OR user_has_org_role(auth.uid(), org_id, ARRAY['owner','admin']))
  )
  WITH CHECK (
    org_id IN (SELECT get_user_org_ids(auth.uid()))
    AND (created_by = auth.uid() OR user_has_org_role(auth.uid(), org_id, ARRAY['owner','admin']))
  );

CREATE POLICY notes_delete ON notes FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT get_user_org_ids(auth.uid()))
    AND (created_by = auth.uid() OR user_has_org_role(auth.uid(), org_id, ARRAY['owner','admin']))
  );

-- ============================================================
-- NOTE_VERSIONS
-- ============================================================

CREATE POLICY note_versions_select ON note_versions FOR SELECT TO authenticated
  USING (user_can_access_note_org(auth.uid(), note_id));

CREATE POLICY note_versions_insert ON note_versions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM notes WHERE notes.id = note_versions.note_id
      AND notes.org_id IN (SELECT get_user_org_ids(auth.uid()))
  ));

-- ============================================================
-- NOTE_SHARES
-- ============================================================

CREATE POLICY note_shares_select ON note_shares FOR SELECT TO authenticated
  USING (user_can_access_note_org(auth.uid(), note_id));

CREATE POLICY note_shares_insert ON note_shares FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM notes WHERE notes.id = note_shares.note_id
      AND (notes.created_by = auth.uid() OR user_has_org_role(auth.uid(), notes.org_id, ARRAY['owner','admin']))
  ));

CREATE POLICY note_shares_delete ON note_shares FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM notes WHERE notes.id = note_shares.note_id
      AND (notes.created_by = auth.uid() OR user_has_org_role(auth.uid(), notes.org_id, ARRAY['owner','admin']))
  ));

-- ============================================================
-- FILES
-- ============================================================

CREATE POLICY files_select ON files FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY files_insert ON files FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_org_ids(auth.uid())) AND uploaded_by = auth.uid());

CREATE POLICY files_delete ON files FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT get_user_org_ids(auth.uid()))
    AND (uploaded_by = auth.uid() OR user_has_org_role(auth.uid(), org_id, ARRAY['owner','admin']))
  );

-- ============================================================
-- AI_SUMMARIES
-- ============================================================

CREATE POLICY ai_summaries_select ON ai_summaries FOR SELECT TO authenticated
  USING (user_can_access_note_org(auth.uid(), note_id));

CREATE POLICY ai_summaries_insert ON ai_summaries FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM notes WHERE notes.id = ai_summaries.note_id
      AND notes.org_id IN (SELECT get_user_org_ids(auth.uid()))
  ));

CREATE POLICY ai_summaries_update ON ai_summaries FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM notes WHERE notes.id = ai_summaries.note_id
      AND notes.org_id IN (SELECT get_user_org_ids(auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM notes WHERE notes.id = ai_summaries.note_id
      AND notes.org_id IN (SELECT get_user_org_ids(auth.uid()))
  ));

-- ============================================================
-- AUDIT_LOGS
-- No user INSERT policy — use insert_audit_log() function.
-- ============================================================

CREATE POLICY audit_logs_select ON audit_logs FOR SELECT TO authenticated
  USING (user_has_org_role(auth.uid(), org_id, ARRAY['owner','admin']));
