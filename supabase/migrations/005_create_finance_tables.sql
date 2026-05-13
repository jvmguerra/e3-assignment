-- 005_create_finance_tables.sql
-- Finance planner tables. All scoped by org_id with RLS.

-- Uploaded statement documents (PDF / CSV) for a given month
CREATE TABLE IF NOT EXISTS finance_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT '',
  statement_month date NOT NULL,
  account_label text NOT NULL DEFAULT '',
  detected_currencies text[] NOT NULL DEFAULT '{}',
  extraction_status text NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending','processing','completed','failed')),
  extraction_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE finance_documents ENABLE ROW LEVEL SECURITY;

-- Transfer chains: groups the legs of a multi-hop transfer (e.g. Payoneer -> Wise -> Nubank)
CREATE TABLE IF NOT EXISTS finance_transfer_chains (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_transaction_id uuid,
  final_transaction_id uuid,
  leg_transaction_ids uuid[] NOT NULL DEFAULT '{}',
  total_fees_by_currency jsonb NOT NULL DEFAULT '{}',
  net_landed_amount numeric(18,4),
  net_landed_currency char(3),
  effective_rate jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE finance_transfer_chains ENABLE ROW LEVEL SECURITY;

-- Individual transactions extracted from a document
CREATE TABLE IF NOT EXISTS finance_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES finance_documents(id) ON DELETE CASCADE,
  occurred_on date NOT NULL,
  description text NOT NULL DEFAULT '',
  merchant_normalized text NOT NULL DEFAULT '',
  amount numeric(18,4) NOT NULL,
  currency char(3) NOT NULL,
  category text NOT NULL DEFAULT 'other',
  kind text NOT NULL DEFAULT 'expense'
    CHECK (kind IN ('income','expense','transfer_out','transfer_in','transfer_fee')),
  chain_id uuid REFERENCES finance_transfer_chains(id) ON DELETE SET NULL,
  raw_extracted jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;

-- Backfill the source/final/leg FKs after both tables exist
ALTER TABLE finance_transfer_chains
  ADD CONSTRAINT finance_transfer_chains_source_fk
    FOREIGN KEY (source_transaction_id) REFERENCES finance_transactions(id) ON DELETE SET NULL,
  ADD CONSTRAINT finance_transfer_chains_final_fk
    FOREIGN KEY (final_transaction_id) REFERENCES finance_transactions(id) ON DELETE SET NULL;

-- Approved recurring (fixed) spendings that power the calendar
CREATE TABLE IF NOT EXISTS finance_recurring (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  amount numeric(18,4) NOT NULL,
  currency char(3) NOT NULL,
  cadence text NOT NULL CHECK (cadence IN ('monthly','weekly','yearly','custom')),
  day_of_month integer,
  day_of_week integer,
  month_of_year integer,
  start_date date NOT NULL DEFAULT now(),
  end_date date,
  category text NOT NULL DEFAULT 'other',
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','detected')),
  detected_from_pattern_id uuid,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE finance_recurring ENABLE ROW LEVEL SECURITY;

-- AI-detected recurring patterns awaiting user approval
CREATE TABLE IF NOT EXISTS finance_patterns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  proposed jsonb NOT NULL DEFAULT '{}',
  confidence numeric(3,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE finance_patterns ENABLE ROW LEVEL SECURITY;

ALTER TABLE finance_recurring
  ADD CONSTRAINT finance_recurring_pattern_fk
    FOREIGN KEY (detected_from_pattern_id) REFERENCES finance_patterns(id) ON DELETE SET NULL;

-- Cached AI analysis reports for a month
CREATE TABLE IF NOT EXISTS finance_analyses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month date NOT NULL,
  prompt_kind text NOT NULL CHECK (prompt_kind IN ('preset','freeform')),
  prompt_key text,
  prompt_text text,
  result jsonb NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE finance_analyses ENABLE ROW LEVEL SECURITY;

-- FX observations derived from completed transfer chains (after-fees effective rate)
CREATE TABLE IF NOT EXISTS finance_fx_observations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_currency char(3) NOT NULL,
  to_currency char(3) NOT NULL,
  from_amount numeric(18,4) NOT NULL,
  to_amount numeric(18,4) NOT NULL,
  implied_rate numeric(18,8) NOT NULL,
  observed_on date NOT NULL,
  chain_id uuid REFERENCES finance_transfer_chains(id) ON DELETE CASCADE,
  source_transaction_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE finance_fx_observations ENABLE ROW LEVEL SECURITY;
