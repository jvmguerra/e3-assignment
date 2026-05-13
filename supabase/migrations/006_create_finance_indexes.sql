-- 006_create_finance_indexes.sql
-- Indexes for finance tables

CREATE INDEX IF NOT EXISTS idx_finance_documents_org_month
  ON finance_documents (org_id, statement_month);
CREATE INDEX IF NOT EXISTS idx_finance_documents_org_id
  ON finance_documents (org_id);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_org_date
  ON finance_transactions (org_id, occurred_on);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_document
  ON finance_transactions (document_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_merchant
  ON finance_transactions (org_id, merchant_normalized);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_kind
  ON finance_transactions (org_id, kind);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_chain
  ON finance_transactions (chain_id);

CREATE INDEX IF NOT EXISTS idx_finance_recurring_org
  ON finance_recurring (org_id);

CREATE INDEX IF NOT EXISTS idx_finance_patterns_org_status
  ON finance_patterns (org_id, status);

CREATE INDEX IF NOT EXISTS idx_finance_analyses_org_month
  ON finance_analyses (org_id, month);

CREATE INDEX IF NOT EXISTS idx_finance_fx_observations_org_pair
  ON finance_fx_observations (org_id, from_currency, to_currency, observed_on);

CREATE INDEX IF NOT EXISTS idx_finance_transfer_chains_org
  ON finance_transfer_chains (org_id);
