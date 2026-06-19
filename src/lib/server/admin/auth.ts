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
q * The 'db' field is the admin PostgreSQL client so callers can continue
 * running privileged queries without creating a new client.
 */
export async function requireAdmin(): Promise<AdminAuthResult | NextResponse> {
    const { user } = await getSession();

    if (!user) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const db = createAdminClient();
    return { user: { id: user.id, email: user.email }, role: user.role, db };
}

/**
 * Type guard: checks if requireAdmin() returned an error response.
 */
export function isAuthError(result: AdminAuthResult | NextResponse): result is NextResponse {
    return result instanceof NextResponse;
}
