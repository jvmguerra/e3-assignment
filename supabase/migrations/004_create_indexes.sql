-- 004_create_indexes.sql
-- Performance indexes for the multi-tenant team notes app

-- Full-text search on notes
CREATE INDEX IF NOT EXISTS idx_notes_search_vector ON notes USING GIN (search_vector);

-- Tag filtering on notes
CREATE INDEX IF NOT EXISTS idx_notes_tags ON notes USING GIN (tags);

-- Notes by org (primary list query)
CREATE INDEX IF NOT EXISTS idx_notes_org_id ON notes (org_id);

-- Notes by creator
CREATE INDEX IF NOT EXISTS idx_notes_created_by ON notes (created_by);

-- Org memberships lookups
CREATE INDEX IF NOT EXISTS idx_org_memberships_user_id ON org_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org_id ON org_memberships (org_id);

-- Composite unique index: one membership row per user per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_memberships_user_org
  ON org_memberships (user_id, org_id);

-- Note versions by parent note
CREATE INDEX IF NOT EXISTS idx_note_versions_note_id ON note_versions (note_id);

-- Files by org and by note
CREATE INDEX IF NOT EXISTS idx_files_org_id ON files (org_id);
CREATE INDEX IF NOT EXISTS idx_files_note_id ON files (note_id);

-- Audit logs: org lookups and time-range scans
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs (org_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at);

-- AI summaries by parent note
CREATE INDEX IF NOT EXISTS idx_ai_summaries_note_id ON ai_summaries (note_id);
