import { isRole, type Role } from '@/lib/auth/roles';

/**
 * Whether one account may be given a role by another.
 *
 * Separated from the route so the rules can be read in one place and tested without a
 * session. Two of them carry weight: an unknown value is refused rather than written — the
 * near-miss `support` instead of `support_agent` would otherwise fail at the CHECK
 * constraint as an opaque 500 — and an admin cannot remove their own access, because there
 * is no way back into a console you can no longer open.
 */

export interface RoleChangeInput {
    actorId: string;
    targetId: unknown;
    newRole: unknown;
}

export type RoleChangeResult =
    | { ok: true; targetId: string; newRole: Role }
    | { ok: false; error: string };

export function validateRoleChange({ actorId, targetId, newRole }: RoleChangeInput): RoleChangeResult {
    if (typeof targetId !== 'string' || !targetId) {
        return { ok: false, error: 'Missing or invalid userId' };
    }
    if (!isRole(newRole)) {
        return { ok: false, error: 'Invalid role. Must be "user", "admin" or "support_agent".' };
    }

    // Demoting yourself, in any direction, locks you out. `support_agent` looks like a
    // sideways move and is not — the Support Desk cannot promote anyone back.
    if (targetId === actorId && newRole !== 'admin') {
        return { ok: false, error: 'Cannot demote yourself' };
    }

    return { ok: true, targetId, newRole };
}
