import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export interface AdminAuthResult {
    user: { id: string; email: string };
    supabase: Awaited<ReturnType<typeof createClient>>;
}

/**
 * Verifies the caller is an authenticated admin.
 * Returns the user + supabase client on success, or a NextResponse error on failure.
 */
export async function requireAdmin(): Promise<AdminAuthResult | NextResponse> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json(
            { success: false, error: 'Unauthorized' },
            { status: 401 }
        );
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin') {
        return NextResponse.json(
            { success: false, error: 'Forbidden' },
            { status: 403 }
        );
    }

    return {
        user: { id: user.id, email: user.email! },
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
