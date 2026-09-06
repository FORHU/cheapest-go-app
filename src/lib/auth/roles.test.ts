import { describe, it, expect } from 'vitest';
import {
    ROLES,
    canAdminister,
    canStaffSupport,
    landingFor,
    isRole,
    roleLabel,
    type Role,
} from './roles';

/**
 * What each role may do, in one place.
 *
 * Before this, every guard compared against the literal 'admin'. That was safe while there
 * were two roles — a third one is denied everywhere by default — but it means the answer to
 * "what can a support agent reach?" is spread across twenty files and can only be got by
 * reading all of them. Here it is a table, and these tests are that table's proof.
 *
 * The bias is deliberate: a role that is not explicitly allowed is refused.
 */

const everyRole: Role[] = ['user', 'admin', 'support_agent'];

describe('canAdminister', () => {
    it('is true only for an admin', () => {
        expect(canAdminister('admin')).toBe(true);
        expect(canAdminister('support_agent')).toBe(false);
        expect(canAdminister('user')).toBe(false);
    });

    it('refuses anything it does not recognise', () => {
        // A role read from a database that has moved ahead of this deployment. Refusing is
        // the only safe reading of a word we do not know.
        expect(canAdminister('superuser' as Role)).toBe(false);
        expect(canAdminister(null)).toBe(false);
        expect(canAdminister(undefined)).toBe(false);
    });
});

describe('canStaffSupport', () => {
    it('is true for an admin and for a support agent', () => {
        // An admin answering a chat is an Agent too — the Support Desk is not a place
        // admins are shut out of.
        expect(canStaffSupport('admin')).toBe(true);
        expect(canStaffSupport('support_agent')).toBe(true);
    });

    it('is false for a customer', () => {
        expect(canStaffSupport('user')).toBe(false);
    });

    it('refuses anything it does not recognise', () => {
        expect(canStaffSupport('agent' as Role)).toBe(false);
        expect(canStaffSupport(null)).toBe(false);
    });
});

describe('landingFor', () => {
    it('sends an admin to the back office', () => {
        expect(landingFor('admin')).toBe('/admin/overview');
    });

    it('sends a support agent to the desk', () => {
        // Not the homepage, and not a page telling them they are not supposed to be here.
        // They are staff; they just are not administrators.
        expect(landingFor('support_agent')).toBe('/admin/desk');
    });

    it('sends a customer nowhere in particular', () => {
        // null means "the caller decides" — the `next` param, or wherever they came from.
        expect(landingFor('user')).toBeNull();
        expect(landingFor(null)).toBeNull();
    });
});

describe('isRole', () => {
    it('recognises exactly the roles the database allows', () => {
        for (const role of everyRole) expect(isRole(role), role).toBe(true);
    });

    it('rejects anything else', () => {
        for (const not of ['support', 'agent', 'Admin', '', null, undefined, 7]) {
            expect(isRole(not), String(not)).toBe(false);
        }
    });
});

describe('roleLabel', () => {
    it('names each role the way a person would', () => {
        // The admin header says "Standard User" for anyone who is not an admin, which a
        // support agent is not — and reading that about yourself is quietly wrong.
        expect(roleLabel('admin')).toBe('Administrator');
        expect(roleLabel('support_agent')).toBe('Support Agent');
        expect(roleLabel('user')).toBe('Standard User');
    });

    it('has a label for every role the database allows', () => {
        for (const role of everyRole) expect(roleLabel(role).length, role).toBeGreaterThan(0);
    });

    it('lists every role exactly once', () => {
        expect([...ROLES].sort()).toEqual(['admin', 'support_agent', 'user']);
    });
});
