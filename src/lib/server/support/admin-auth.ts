import { getSession } from '@/lib/auth/session';
import { canStaffSupport } from '@/lib/auth/roles';

/**
 * The gate on every `/api/admin/support/*` route.
 *
 * The admin *pages* are already guarded twice — middleware checks a session cookie exists,
 * and `(dashboard)/layout.tsx` checks the role. Neither protects a route: middleware only
 * looks for a cookie, and a layout does not run for an API request. A route that trusted
 * either would be readable by any signed-in customer, and these routes carry every
 * customer's conversation.
 *
 * This is also the single place a **Support Agent** is admitted. Everything else in the
 * admin asks `canAdminister`, so the new role is refused across the back office without a
 * line of those routes changing — access is granted by writing it here, never by a role
 * quietly satisfying a check that was written for someone else.
 *
 * `users.role` is the authority (ADR-0003).
 */

export interface AdminActor {
    id: string;
}

export async function requireAgent(): Promise<AdminActor | null> {
    const { user } = await getSession();
    if (!user || !canStaffSupport(user.role)) return null;
    return { id: user.id };
}
