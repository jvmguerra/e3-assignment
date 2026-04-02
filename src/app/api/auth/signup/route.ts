import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, apiSuccess } from '@/lib/api-utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, display_name } = body as {
      email?: string;
      password?: string;
      display_name?: string;
    };

    if (!email || !password) {
      return apiError('email and password are required', 400);
    }

    const supabase = await createClient();

    // Create the auth user; Supabase triggers will create the profile row
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      return apiError(error.message, 400);
    }

    if (!data.user) {
      return apiError('Signup failed — no user returned', 500);
    }

    // Optionally set display_name on the auto-created profile
    if (display_name) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ display_name })
        .eq('id', data.user.id);

      if (profileError) {
        // Non-fatal: log and continue
        console.error('Failed to set display_name after signup:', profileError);
      }
    }

    return apiSuccess({ user: data.user }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('POST /api/auth/signup error:', message);
    return apiError('Internal server error', 500);
  }
}
