// Database entity types

export type Role = 'owner' | 'admin' | 'member';
export type Visibility = 'private' | 'shared' | 'public';
export type SummaryStatus = 'pending' | 'accepted' | 'rejected';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface OrgMembership {
  id: string;
  user_id: string;
  org_id: string;
  role: Role;
  created_at: string;
  // Joined fields
  profile?: Profile;
  organization?: Organization;
}

export interface Note {
  id: string;
  org_id: string;
  created_by: string;
  title: string;
  content: string;
  visibility: Visibility;
  tags: string[];
  current_version: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  creator?: Profile;
  shares?: NoteShare[];
}

export interface NoteVersion {
  id: string;
  note_id: string;
  version_number: number;
  title: string;
  content: string;
  changed_by: string;
  change_summary: string | null;
  created_at: string;
  // Joined
  changer?: Profile;
}

export interface NoteShare {
  id: string;
  note_id: string;
  user_id: string;
  created_at: string;
  // Joined
  profile?: Profile;
}

export interface FileRecord {
  id: string;
  org_id: string;
  note_id: string | null;
  uploaded_by: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  // Joined
  uploader?: Profile;
}

export interface AISummary {
  id: string;
  note_id: string;
  version_number: number;
  summary: {
    overview: string;
    key_points: string[];
    action_items: string[];
    tags_suggested: string[];
  };
  status: SummaryStatus;
  generated_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
}

export interface AuditLog {
  id: string;
  org_id: string;
  user_id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  // Joined
  profile?: Profile;
}

// ============================================================
// Finance planner
// ============================================================

export type TransactionKind =
  | 'income'
  | 'expense'
  | 'transfer_out'
  | 'transfer_in'
  | 'transfer_fee';

export type ExtractionStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type RecurringCadence = 'monthly' | 'weekly' | 'yearly' | 'custom';
export type RecurringSource = 'manual' | 'detected';
export type PatternStatus = 'pending' | 'approved' | 'rejected';
export type AnalysisPromptKind = 'preset' | 'freeform';

export interface FinanceDocument {
  id: string;
  org_id: string;
  uploaded_by: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  statement_month: string;
  account_label: string;
  detected_currencies: string[];
  extraction_status: ExtractionStatus;
  extraction_error: string | null;
  created_at: string;
  uploader?: Profile;
  transaction_count?: number;
}

export interface FinanceTransaction {
  id: string;
  org_id: string;
  document_id: string;
  occurred_on: string;
  description: string;
  merchant_normalized: string;
  amount: number;
  currency: string;
  category: string;
  kind: TransactionKind;
  chain_id: string | null;
  raw_extracted: Record<string, unknown>;
  created_at: string;
}

export interface FinanceTransferChain {
  id: string;
  org_id: string;
  source_transaction_id: string | null;
  final_transaction_id: string | null;
  leg_transaction_ids: string[];
  total_fees_by_currency: Record<string, number>;
  net_landed_amount: number | null;
  net_landed_currency: string | null;
  effective_rate: Record<string, number>;
  created_at: string;
}

export interface FinanceRecurring {
  id: string;
  org_id: string;
  label: string;
  amount: number;
  currency: string;
  cadence: RecurringCadence;
  day_of_month: number | null;
  day_of_week: number | null;
  month_of_year: number | null;
  start_date: string;
  end_date: string | null;
  category: string;
  source: RecurringSource;
  detected_from_pattern_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface FinancePatternProposal {
  label: string;
  amount: number;
  currency: string;
  cadence: RecurringCadence;
  day_of_month: number | null;
  category: string;
  sample_transaction_ids: string[];
}

export interface FinancePattern {
  id: string;
  org_id: string;
  proposed: FinancePatternProposal;
  confidence: number;
  status: PatternStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface FinanceAnalysisResult {
  overview: string;
  findings: Array<{
    title: string;
    detail: string;
    severity: 'info' | 'warn' | 'critical';
  }>;
  suggestions: Array<{
    action: string;
    estimated_savings: number | null;
    currency: string | null;
  }>;
  cited_transaction_ids: string[];
}

export interface FinanceAnalysis {
  id: string;
  org_id: string;
  month: string;
  prompt_kind: AnalysisPromptKind;
  prompt_key: string | null;
  prompt_text: string | null;
  result: FinanceAnalysisResult;
  created_by: string;
  created_at: string;
}

export interface FinanceFxObservation {
  id: string;
  org_id: string;
  from_currency: string;
  to_currency: string;
  from_amount: number;
  to_amount: number;
  implied_rate: number;
  observed_on: string;
  chain_id: string | null;
  source_transaction_ids: string[];
  created_at: string;
}
