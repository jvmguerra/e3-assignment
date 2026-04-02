import { SupabaseClient } from '@supabase/supabase-js';

interface LogEntry {
  org_id: string;
  user_id: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
}

export async function auditLog(
  supabase: SupabaseClient,
  entry: LogEntry
) {
  const logData = {
    ...entry,
    metadata: entry.metadata ?? {},
    created_at: new Date().toISOString(),
  };

  // Always log to console for Railway log stream
  console.log(JSON.stringify({
    type: 'audit',
    ...logData,
  }));

  // Write to audit_logs table
  const { error } = await supabase
    .from('audit_logs')
    .insert(logData);

  if (error) {
    console.error('Failed to write audit log:', error);
  }
}
