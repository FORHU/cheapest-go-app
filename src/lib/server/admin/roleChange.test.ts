import { describe, it, expect } from 'vitest';
import { validateRoleChange } from './roleChange';

/**
 * Who may be given which role, and the one change that cannot be undone.
 *
 * Extracted from the route so the rules can be read and tested without a session. They are
 * short, but two of them matter: an unknown role must be refused rather than written, and
 * the last admin must not be able to remove their own access — there is no other way back
 * in except editing the database by hand.
 */

const actor = 'admin-1';

describe('validateRoleChange', () => {
    it('allows promoting a customer to support agent', () => {
        const result = validateRoleChange({ actorId: actor, targetId: 'u-9', newRole: 'support_agent' });

        expect(result.ok).toBe(true);
    });

    it('allows promoting to admin and demoting to customer', () => {
        expect(validateRoleChange({ actorId: actor, targetId: 'u-9', newRole: 'admin' }).ok).toBe(true);
        expect(validateRoleChange({ actorId: actor, targetId: 'u-9', newRole: 'user' }).ok).toBe(true);
    });

    it('refuses a role the database would not accept', () => {
        // 'support' is the obvious near-miss for 'support_agent'. Writing it would fail at
        // the CHECK constraint; refusing here says which value was wrong.
        for (const bad of ['support', 'agent', 'Admin', '', null, 7]) {
            const result = validateRoleChange({ actorId: actor, targetId: 'u-9', newRole: bad });
            expect(result.ok, String(bad)).toBe(false);
        }
    });

    it('refuses a missing target', () => {
        expect(validateRoleChange({ actorId: actor, targetId: '', newRole: 'admin' }).ok).toBe(false);
        expect(validateRoleChange({ actorId: actor, targetId: null, newRole: 'admin' }).ok).toBe(false);
    });

    it('will not let an admin take away their own access', () => {
        // Including to support_agent, which looks like a sideways move and is not: there is
        // no way back to admin from a console you can no longer open.
        for (const role of ['user', 'support_agent']) {
            const result = validateRoleChange({ actorId: actor, targetId: actor, newRole: role });
            expect(result.ok, role).toBe(false);
            if (!result.ok) expect(result.error).toMatch(/yourself/i);
        }
    });

    it('lets an admin re-apply their own role, which changes nothing', () => {
        expect(validateRoleChange({ actorId: actor, targetId: actor, newRole: 'admin' }).ok).toBe(true);
    });
});
