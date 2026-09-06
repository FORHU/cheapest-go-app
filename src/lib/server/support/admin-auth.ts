import { getSession } from '@/lib/auth/session';

/**
 * The gate on every `/api/admin/support/*` route.
 *
 * The admin *pages* are already guarded twice — middleware checks a session cookie exists,
 * and `(dashboard)/layout.tsx` checks the role. Neither protects a route: middleware only
 * looks for a cookie, and a layout does not run for an API request. A route that trusted
 * either would be readable by any signed-in customer, and these routes carry every
 * customer's conversation.
 *
 * `users.role` is the authority (ADR-0003).
 */

export interface AdminActor {
    id: string;
}

export async function requireAgent(): Promise<AdminActor | null> {
    const { user } = await getSession();
    if (!user || user.role !== 'admin') return null;
    return { id: user.id };
}
