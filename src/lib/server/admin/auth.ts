import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { env } from '@/utils/env';

export interface AdminAuthResult {
    user: { id: string; email: string };
    role: string;
    supabase: Awaited<ReturnType<typeof createClient>>;
}

/**
 * Verifies the caller is an authenticated admin.
 * Returns the user + supabase client on success, or a NextResponse error on failure.
 *
 * Profile role is read with the SERVICE ROLE KEY so RLS policies on the profiles
 * table do not affect the lookup. Previously this used the anon-key client, which
 * worked only because the own-row SELECT policy matched — fragile and undocumented.
 */
export async function requireAdmin(): Promise<AdminAuthResult | NextResponse> {
    // Use the SSR client (cookie-based) to verify the JWT / session
    const supabase = await createClient();
    let user = null;

    try {
        const { data } = await supabase.auth.getUser();
        user = data.user;
    } catch (err) {
        console.error('[requireAdmin] Auth error:', err);
    }

    if (!user) {
        return NextResponse.json(
            { success: false, error: 'Unauthorized' },
            { status: 401 }
        );
    }

    // Read profile role with service role client — bypasses RLS entirely,
    // so neither the own-row policy nor the admin policy is evaluated.
    const svcClient = createServiceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: profile, error: profileError } = await svcClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    // Fail closed: if the role cannot be read, deny access rather than assuming admin
    if (profileError || !profile) {
        console.error('[requireAdmin] Failed to read profile role for user', user.id, profileError);
        return NextResponse.json(
            { success: false, error: 'Forbidden' },
            { status: 403 }
        );
    }

    if (profile.role !== 'admin') {
        return NextResponse.json(
            { success: false, error: 'Forbidden' },
            { status: 403 }
        );
    }

    return {
        user: { id: user.id, email: user.email! },
        role: profile.role,
        supabase,
    };
}

/**
 * Type guard: checks if requireAdmin() returned an error response.
 */
export function isAuthError(
    result: AdminAuthResult | NextResponse
): result is NextResponse {
    return result instanceof NextResponse;
}
