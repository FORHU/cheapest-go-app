/**
 * Server-side authentication helpers.
 * Replaces the Supabase Auth version — no @supabase dependency.
 */

import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/utils/postgres/admin';
import type { SessionUser } from '@/lib/auth/session';

export interface AuthResult {
    user: SessionUser | null;
    error: string | null;
}

/**
 * Get the currently authenticated user from the session cookie.
 * Drop-in replacement for the previous Supabase-based implementation.
 * Returns { user, error } — callers decide how to handle unauthenticated state.
 */
export async function getAuthenticatedUser(): Promise<AuthResult> {
    const { user } = await getSession();
    if (!user) {
        return { user: null, error: 'Not authenticated' };
    }
    return { user, error: null };
}

/**
 * Fetch the user's full profile from the database.
 */
export async function getUserProfile(userId: string) {
    const db = createAdminClient();
    const { data, error } = await db
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) {
        console.error('[getUserProfile] Error fetching profile:', error);
        return null;
    }
    return data;
}
