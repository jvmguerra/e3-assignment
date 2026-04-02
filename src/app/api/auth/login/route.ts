import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiError, apiSuccess } from '@/lib/api-utils';
import { auditLog } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return apiError('email and password are required', 400);
    }

    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return apiError(error.message, 401);
    }

    if (!data.user || !data.session) {
      return apiError('Login failed — no session returned', 500);
    }

    // Audit the login event using the admin client so that the log write
    // succeeds even when the user has no org memberships yet (RLS would
    // otherwise block the insert_audit_log call on the server client).
    const adminClient = createAdminClient();

    // Fetch the user's first org membership to associate the audit log;
    // if none exists yet we skip the DB audit log but still write to stdout.
    const { data: membership } = await adminClient
      .from('org_memberships')
      .select('org_id')
      .eq('user_id', data.user.id)
      .limit(1)
      .maybeSingle();

    if (membership?.org_id) {
      await auditLog(adminClient, {
        org_id: membership.org_id,
        user_id: data.user.id,
        action: 'auth.login',
        metadata: {
          email,
          ip_address: request.headers.get('x-forwarded-for') ?? undefined,
        },
        ip_address: request.headers.get('x-forwarded-for') ?? undefined,
      });
    } else {
      // No org yet — just emit a structured console log
      console.log(
        JSON.stringify({
          type: 'audit',
          action: 'auth.login',
          user_id: data.user.id,
          email,
          created_at: new Date().toISOString(),
        })
      );
    }

    return apiSuccess({ user: data.user, session: data.session });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('POST /api/auth/login error:', message);
    return apiError('Internal server error', 500);
  }
}
