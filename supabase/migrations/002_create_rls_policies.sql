-- 002_create_rls_policies.sql
-- Row Level Security policies for all tables

-- ============================================================
-- HELPER: security definer function for audit log inserts
-- User INSERT policies are intentionally omitted for audit_logs;
-- all application code calls this function instead.
-- ============================================================

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
-- All authenticated users can SELECT (needed for member picker).
-- Only the trigger inserts rows; users can update their own row.
-- ============================================================

CREATE POLICY profiles_select
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY profiles_update
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================
-- ORGANIZATIONS
-- Members can SELECT orgs they belong to.
-- Any authenticated user can INSERT (creating a new org).
-- ============================================================

CREATE POLICY organizations_select
  ON organizations FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY organizations_insert
  ON organizations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================
-- ORG_MEMBERSHIPS
-- Members can SELECT memberships within their orgs.
-- Owner/admin can INSERT, UPDATE, DELETE memberships.
-- ============================================================

CREATE POLICY org_memberships_select
  ON org_memberships FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY org_memberships_insert
  ON org_memberships FOR INSERT
  TO authenticated
  WITH CHECK (
    -- caller must be owner or admin of the target org
    EXISTS (
      SELECT 1 FROM org_memberships
      WHERE user_id = auth.uid()
        AND org_id = org_memberships.org_id
        AND role IN ('owner', 'admin')
    )
    -- exception: allow the very first membership (owner bootstrapping a new org)
    OR NOT EXISTS (
      SELECT 1 FROM org_memberships om2 WHERE om2.org_id = org_memberships.org_id
    )
  );

CREATE POLICY org_memberships_update
  ON org_memberships FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships
      WHERE user_id = auth.uid()
        AND org_id = org_memberships.org_id
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_memberships
      WHERE user_id = auth.uid()
        AND org_id = org_memberships.org_id
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY org_memberships_delete
  ON org_memberships FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships
      WHERE user_id = auth.uid()
        AND org_id = org_memberships.org_id
        AND role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- NOTES
-- admin/owner can see ALL notes in their org (including private).
-- Members see: public notes + their own notes + notes shared with them.
-- ============================================================

CREATE POLICY notes_select
  ON notes FOR SELECT
  TO authenticated
  USING (
    -- caller must be in the org
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
    AND (
      -- admin/owner sees everything in the org
      EXISTS (
        SELECT 1 FROM org_memberships
        WHERE user_id = auth.uid()
          AND org_id = notes.org_id
          AND role IN ('owner', 'admin')
      )
      -- creator always sees their own notes
      OR created_by = auth.uid()
      -- public notes visible to all org members
      OR visibility = 'public'
      -- shared notes visible to explicitly listed users
      OR (
        visibility = 'shared'
        AND EXISTS (
          SELECT 1 FROM note_shares
          WHERE note_id = notes.id
            AND user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY notes_insert
  ON notes FOR INSERT
  TO authenticated
  WITH CHECK (
    -- must be an org member
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
    -- created_by must be the authenticated user
    AND created_by = auth.uid()
  );

CREATE POLICY notes_update
  ON notes FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM org_memberships
        WHERE user_id = auth.uid()
          AND org_id = notes.org_id
          AND role IN ('owner', 'admin')
      )
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM org_memberships
        WHERE user_id = auth.uid()
          AND org_id = notes.org_id
          AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY notes_delete
  ON notes FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM org_memberships
        WHERE user_id = auth.uid()
          AND org_id = notes.org_id
          AND role IN ('owner', 'admin')
      )
    )
  );

-- ============================================================
-- NOTE_VERSIONS
-- Same SELECT visibility as notes (via note_id join).
-- Any org member can INSERT (saves a new version).
-- ============================================================

CREATE POLICY note_versions_select
  ON note_versions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = note_versions.note_id
        AND (
          -- admin/owner sees all
          EXISTS (
            SELECT 1 FROM org_memberships
            WHERE user_id = auth.uid()
              AND org_id = notes.org_id
              AND role IN ('owner', 'admin')
          )
          OR notes.created_by = auth.uid()
          OR notes.visibility = 'public'
          OR (
            notes.visibility = 'shared'
            AND EXISTS (
              SELECT 1 FROM note_shares
              WHERE note_id = notes.id
                AND user_id = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY note_versions_insert
  ON note_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM notes
      JOIN org_memberships ON org_memberships.org_id = notes.org_id
      WHERE notes.id = note_versions.note_id
        AND org_memberships.user_id = auth.uid()
    )
  );

-- ============================================================
-- NOTE_SHARES
-- Users who can access the note can SELECT shares.
-- Note creator + admin/owner can INSERT/DELETE.
-- ============================================================

CREATE POLICY note_shares_select
  ON note_shares FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = note_shares.note_id
        AND (
          EXISTS (
            SELECT 1 FROM org_memberships
            WHERE user_id = auth.uid()
              AND org_id = notes.org_id
              AND role IN ('owner', 'admin')
          )
          OR notes.created_by = auth.uid()
          OR notes.visibility = 'public'
          OR (
            notes.visibility = 'shared'
            AND EXISTS (
              SELECT 1 FROM note_shares ns2
              WHERE ns2.note_id = notes.id
                AND ns2.user_id = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY note_shares_insert
  ON note_shares FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = note_shares.note_id
        AND (
          notes.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM org_memberships
            WHERE user_id = auth.uid()
              AND org_id = notes.org_id
              AND role IN ('owner', 'admin')
          )
        )
    )
  );

CREATE POLICY note_shares_delete
  ON note_shares FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = note_shares.note_id
        AND (
          notes.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM org_memberships
            WHERE user_id = auth.uid()
              AND org_id = notes.org_id
              AND role IN ('owner', 'admin')
          )
        )
    )
  );

-- ============================================================
-- FILES
-- Org members can SELECT and INSERT.
-- Uploader + admin/owner can DELETE.
-- ============================================================

CREATE POLICY files_select
  ON files FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY files_insert
  ON files FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
    AND uploaded_by = auth.uid()
  );

CREATE POLICY files_delete
  ON files FOR DELETE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
    AND (
      uploaded_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM org_memberships
        WHERE user_id = auth.uid()
          AND org_id = files.org_id
          AND role IN ('owner', 'admin')
      )
    )
  );

-- ============================================================
-- AI_SUMMARIES
-- Same SELECT visibility as the parent note.
-- Org members can INSERT (trigger generation).
-- Anyone who can see the note can UPDATE (accept/reject).
-- ============================================================

CREATE POLICY ai_summaries_select
  ON ai_summaries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = ai_summaries.note_id
        AND (
          EXISTS (
            SELECT 1 FROM org_memberships
            WHERE user_id = auth.uid()
              AND org_id = notes.org_id
              AND role IN ('owner', 'admin')
          )
          OR notes.created_by = auth.uid()
          OR notes.visibility = 'public'
          OR (
            notes.visibility = 'shared'
            AND EXISTS (
              SELECT 1 FROM note_shares
              WHERE note_id = notes.id
                AND user_id = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY ai_summaries_insert
  ON ai_summaries FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM notes
      JOIN org_memberships ON org_memberships.org_id = notes.org_id
      WHERE notes.id = ai_summaries.note_id
        AND org_memberships.user_id = auth.uid()
    )
  );

CREATE POLICY ai_summaries_update
  ON ai_summaries FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = ai_summaries.note_id
        AND (
          EXISTS (
            SELECT 1 FROM org_memberships
            WHERE user_id = auth.uid()
              AND org_id = notes.org_id
              AND role IN ('owner', 'admin')
          )
          OR notes.created_by = auth.uid()
          OR notes.visibility = 'public'
          OR (
            notes.visibility = 'shared'
            AND EXISTS (
              SELECT 1 FROM note_shares
              WHERE note_id = notes.id
                AND user_id = auth.uid()
            )
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = ai_summaries.note_id
        AND (
          EXISTS (
            SELECT 1 FROM org_memberships
            WHERE user_id = auth.uid()
              AND org_id = notes.org_id
              AND role IN ('owner', 'admin')
          )
          OR notes.created_by = auth.uid()
          OR notes.visibility = 'public'
          OR (
            notes.visibility = 'shared'
            AND EXISTS (
              SELECT 1 FROM note_shares
              WHERE note_id = notes.id
                AND user_id = auth.uid()
            )
          )
        )
    )
  );

-- ============================================================
-- AUDIT_LOGS
-- owner/admin can SELECT their org's logs.
-- No user INSERT policy — use insert_audit_log() function above.
-- ============================================================

CREATE POLICY audit_logs_select
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_memberships
      WHERE user_id = auth.uid()
        AND org_id = audit_logs.org_id
        AND role IN ('owner', 'admin')
    )
  );
