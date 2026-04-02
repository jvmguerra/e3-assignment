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
  console.log(JSON.stringify({ type: 'audit', ...logData }));

  // Use the security definer function to bypass RLS on audit_logs.
  // Users do not have a direct INSERT policy on audit_logs; the SECURITY DEFINER
  // function runs as the function owner (postgres) and is the sole write path.
  const { error } = await supabase.rpc('insert_audit_log', {
    p_org_id: entry.org_id,
    p_user_id: entry.user_id,
    p_action: entry.action,
    p_resource_type: entry.resource_type ?? null,
    p_resource_id: entry.resource_id ?? null,
    p_metadata: entry.metadata ?? {},
    p_ip_address: entry.ip_address ?? null,
  });

  if (error) {
    console.error('Failed to write audit log:', error);
  }
}
