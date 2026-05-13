-- 007_create_finance_rls.sql
-- RLS policies for finance tables. Mirrors the org-scoped pattern from 002.

-- ============================================================
-- finance_documents
-- ============================================================
CREATE POLICY finance_documents_select ON finance_documents FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY finance_documents_insert ON finance_documents FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT get_user_org_ids(auth.uid()))
    AND uploaded_by = auth.uid()
  );

CREATE POLICY finance_documents_update ON finance_documents FOR UPDATE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())))
  WITH CHECK (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY finance_documents_delete ON finance_documents FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT get_user_org_ids(auth.uid()))
    AND (uploaded_by = auth.uid() OR user_has_org_role(auth.uid(), org_id, ARRAY['owner','admin']))
  );

-- ============================================================
-- finance_transactions
-- ============================================================
CREATE POLICY finance_transactions_select ON finance_transactions FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY finance_transactions_insert ON finance_transactions FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY finance_transactions_update ON finance_transactions FOR UPDATE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())))
  WITH CHECK (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY finance_transactions_delete ON finance_transactions FOR DELETE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())));

-- ============================================================
-- finance_transfer_chains
-- ============================================================
CREATE POLICY finance_chains_select ON finance_transfer_chains FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY finance_chains_insert ON finance_transfer_chains FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY finance_chains_update ON finance_transfer_chains FOR UPDATE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())))
  WITH CHECK (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY finance_chains_delete ON finance_transfer_chains FOR DELETE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())));

-- ============================================================
-- finance_recurring
-- ============================================================
CREATE POLICY finance_recurring_select ON finance_recurring FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY finance_recurring_insert ON finance_recurring FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT get_user_org_ids(auth.uid()))
    AND created_by = auth.uid()
  );

CREATE POLICY finance_recurring_update ON finance_recurring FOR UPDATE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())))
  WITH CHECK (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY finance_recurring_delete ON finance_recurring FOR DELETE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())));

-- ============================================================
-- finance_patterns
-- ============================================================
CREATE POLICY finance_patterns_select ON finance_patterns FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY finance_patterns_insert ON finance_patterns FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY finance_patterns_update ON finance_patterns FOR UPDATE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())))
  WITH CHECK (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY finance_patterns_delete ON finance_patterns FOR DELETE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())));

-- ============================================================
-- finance_analyses
-- ============================================================
CREATE POLICY finance_analyses_select ON finance_analyses FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY finance_analyses_insert ON finance_analyses FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT get_user_org_ids(auth.uid()))
    AND created_by = auth.uid()
  );

CREATE POLICY finance_analyses_delete ON finance_analyses FOR DELETE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())));

-- ============================================================
-- finance_fx_observations
-- ============================================================
CREATE POLICY finance_fx_select ON finance_fx_observations FOR SELECT TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY finance_fx_insert ON finance_fx_observations FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY finance_fx_delete ON finance_fx_observations FOR DELETE TO authenticated
  USING (org_id IN (SELECT get_user_org_ids(auth.uid())));

-- ============================================================
-- TRIGGERS: keep updated_at fresh on finance_recurring
-- ============================================================
DROP TRIGGER IF EXISTS finance_recurring_updated_at ON finance_recurring;
CREATE TRIGGER finance_recurring_updated_at
  BEFORE UPDATE ON finance_recurring
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
