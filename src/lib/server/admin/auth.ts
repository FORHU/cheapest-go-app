/**
 * Admin authentication helpers — no Supabase dependency.
 * Uses Lucia session validation and the PostgreSQL admin client.
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/utils/postgres/admin';
import type { DbClient } from '@/lib/db/query-builder';

export interface AdminAuthResult {
    user: { id: string; email: string };
    role: string;
    db: DbClient;
}

/**
 * Verifies the caller is an authenticated admin.
 * Returns { user, role, db } on success, or a NextResponse error on failure.
 *
 * The 'db' field is the admin PostgreSQL client (bypasses RLS) so callers
 * can continue running privileged queries without creating a new client.
 */
export async function requireAdmin(): Promise<AdminAuthResult | NextResponse> {
    const { user } = await getSession();

    if (!user) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Read role directly from the profiles table using the admin client (bypasses RLS)
    const db = createAdminClient();
    const { data: profile, error: profileError } = await db
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profileError || !profile) {
        console.error('[requireAdmin] Failed to read profile role for user', user.id, profileError);
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (profile.role !== 'admin') {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    return { user: { id: user.id, email: user.email }, role: profile.role, db };
}

/**
 * Type guard: checks if requireAdmin() returned an error response.
 */
export function isAuthError(result: AdminAuthResult | NextResponse): result is NextResponse {
    return result instanceof NextResponse;
}
