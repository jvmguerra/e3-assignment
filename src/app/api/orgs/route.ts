import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiError, apiSuccess, getAuthUser } from '@/lib/api-utils';
import { auditLog } from '@/lib/logger';

// GET /api/orgs
// List all organizations the authenticated user belongs to.
// Does NOT require x-org-id because the user is in the process of selecting an org.
export async function GET() {
  try {
    const supabase = await createClient();

    const user = await getAuthUser(supabase);
    if (!user) {
      return apiError('Not authenticated', 401);
    }

    // Join org_memberships → organizations to get the full org object + role
    const { data, error } = await supabase
      .from('org_memberships')
      .select(`
        id,
        role,
        created_at,
        organization:organizations (
          id,
          name,
          slug,
          created_at,
          updated_at
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('GET /api/orgs error:', error);
      return apiError('Failed to fetch organizations', 500);
    }

    return apiSuccess({ orgs: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('GET /api/orgs unexpected error:', message);
    return apiError('Internal server error', 500);
  }
}

// POST /api/orgs
// Create a new organization and make the caller its owner.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const user = await getAuthUser(supabase);
    if (!user) {
      return apiError('Not authenticated', 401);
    }

    const body = await request.json();
    const { name, slug } = body as { name?: string; slug?: string };

    if (!name || !slug) {
      return apiError('name and slug are required', 400);
    }

    // Validate slug format: lowercase letters, numbers, hyphens only
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return apiError('slug may only contain lowercase letters, numbers, and hyphens', 400);
    }

    // Use admin client for org creation because:
    // 1. The INSERT policy allows it (WITH CHECK true)
    // 2. But the chained .select() triggers the SELECT policy
    // 3. The SELECT policy requires membership, which doesn't exist yet
    // So we use admin to insert org + first membership atomically,
    // then all subsequent operations use the user's client with RLS.
    const admin = createAdminClient();

    // Insert the organization
    const { data: org, error: orgError } = await admin
      .from('organizations')
      .insert({ name, slug })
      .select()
      .single();

    if (orgError) {
      if (orgError.code === '23505') {
        return apiError('An organization with that slug already exists', 409);
      }
      console.error('POST /api/orgs org insert error:', orgError);
      return apiError('Failed to create organization', 500);
    }

    // Insert the owner membership
    const { error: membershipError } = await admin
      .from('org_memberships')
      .insert({
        user_id: user.id,
        org_id: org.id,
        role: 'owner',
      });

    if (membershipError) {
      // Attempt cleanup — best effort
      await admin.from('organizations').delete().eq('id', org.id);
      console.error('POST /api/orgs membership insert error:', membershipError);
      return apiError('Failed to create organization membership', 500);
    }

    // Audit log
    await auditLog(supabase, {
      org_id: org.id,
      user_id: user.id,
      action: 'org.created',
      resource_type: 'organization',
      resource_id: org.id,
      metadata: { name, slug },
      ip_address: request.headers.get('x-forwarded-for') ?? undefined,
    });

    return apiSuccess({ org }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('POST /api/orgs unexpected error:', message);
    return apiError('Internal server error', 500);
  }
}
