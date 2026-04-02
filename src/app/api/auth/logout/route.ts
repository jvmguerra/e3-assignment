import { createClient } from '@/lib/supabase/server';
import { apiError, apiSuccess } from '@/lib/api-utils';

export async function POST() {
  try {
    const supabase = await createClient();

    const { error } = await supabase.auth.signOut();

    if (error) {
      return apiError(error.message, 500);
    }

    return apiSuccess({ message: 'Logged out successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('POST /api/auth/logout error:', message);
    return apiError('Internal server error', 500);
  }
}
