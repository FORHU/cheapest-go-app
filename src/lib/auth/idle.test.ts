import { describe, it, expect } from 'vitest';
import { idleLimitMinutes, hasExceededIdleLimit } from './idle';
import type { Role } from './roles';

/**
 * Idle Limit — how long a Session survives without Presence (CONTEXT.md, ADR-0027).
 * Ten minutes for staff, thirty for travellers — the traveller figure matches the life of
 * a Price Hold, so the two things a traveller can lose lapse on the same scale.
 *
 * This module is the decision only: given when a session last saw real activity, is it
 * past its limit right now? It knows nothing about cookies, Postgres, or Lucia — that
 * plumbing lives in session.ts, which is what makes this fast and exhaustive to test here.
 */

describe('idleLimitMinutes', () => {
    it('gives travellers thirty minutes', () => {
        expect(idleLimitMinutes('user')).toBe(30);
    });

    it('gives admins ten minutes, same as any staff', () => {
        expect(idleLimitMinutes('admin')).toBe(10);
    });

    it('gives support agents ten minutes', () => {
        expect(idleLimitMinutes('support_agent')).toBe(10);
    });
});

describe('hasExceededIdleLimit', () => {
    const now = new Date('2026-09-23T12:00:00.000Z');

    it('is false for a traveller well inside the thirty-minute limit', () => {
        const lastActiveAt = new Date('2026-09-23T11:35:00.000Z'); // 25 min ago
        expect(hasExceededIdleLimit({ lastActiveAt, role: 'user', now })).toBe(false);
    });

    it('is true for a traveller past the thirty-minute limit', () => {
        const lastActiveAt = new Date('2026-09-23T11:29:00.000Z'); // 31 min ago
        expect(hasExceededIdleLimit({ lastActiveAt, role: 'user', now })).toBe(true);
    });

    it('is false for a traveller exactly at the boundary', () => {
        const lastActiveAt = new Date('2026-09-23T11:30:00.000Z'); // exactly 30 min ago
        expect(hasExceededIdleLimit({ lastActiveAt, role: 'user', now })).toBe(false);
    });

    it('is false for staff well inside the ten-minute limit', () => {
        const lastActiveAt = new Date('2026-09-23T11:52:00.000Z'); // 8 min ago
        expect(hasExceededIdleLimit({ lastActiveAt, role: 'admin', now })).toBe(false);
    });

    it('is true for staff past the ten-minute limit', () => {
        const lastActiveAt = new Date('2026-09-23T11:49:00.000Z'); // 11 min ago
        expect(hasExceededIdleLimit({ lastActiveAt, role: 'support_agent', now })).toBe(true);
    });

    it('treats a role it does not recognise as already expired, same bias as roles.ts', () => {
        // isRole()'s callers refuse an unrecognised role rather than guess at what it can
        // do; an idle check that can't look up a limit takes the same side and expires the
        // session instead of leaving it open indefinitely.
        const lastActiveAt = now; // this instant — would pass under any real limit
        expect(hasExceededIdleLimit({ lastActiveAt, role: 'nobody' as Role, now })).toBe(true);
    });
});
