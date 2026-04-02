import { createClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, getAuthUser, logError } from '@/lib/api-utils';

export async function POST() {
  try {
    const supabase = await createClient();

    // Capture the user before signing out so we can log who logged out
    const user = await getAuthUser(supabase);

    const { error } = await supabase.auth.signOut();

    if (error) {
      return apiError(error.message, 500);
    }

    // Auth events have no org context — emit structured console log only.
    console.log(JSON.stringify({
      type: 'audit',
      action: 'auth.logout',
      user_id: user?.id ?? null,
      email: user?.email ?? null,
      created_at: new Date().toISOString(),
    }));

    return apiSuccess({ message: 'Logged out successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    logError('/api/auth/logout', 'POST', message);
    return apiError('Internal server error', 500);
  }
}
