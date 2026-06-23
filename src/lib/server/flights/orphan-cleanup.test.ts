import { describe, it, expect } from 'vitest';
import { isOrphanedSession, filterOrphanedSessions } from './orphan-cleanup';

const ORPHAN_AGE_MS = 35 * 60 * 1000; // 35 minutes

function makeSession(overrides: Record<string, any> = {}) {
    return {
        id: 'sess_1',
        provider: 'duffel',
        payment_intent_id: 'pi_123',
        duffel_pre_order_id: 'ord_abc',
        status: 'payment_initiated',
        created_at: new Date(Date.now() - ORPHAN_AGE_MS - 1000).toISOString(),
        ...overrides,
    };
}

describe('isOrphanedSession', () => {
    const now = new Date();

    it('flags a session as orphaned when it is old enough, has a pre-order, and PI did not succeed', () => {
        const session = makeSession();
        expect(isOrphanedSession(session, 'canceled', now)).toBe(true);
        expect(isOrphanedSession(session, 'requires_payment_method', now)).toBe(true);
    });

    it('does not flag a session that is younger than 35 minutes', () => {
        const young = makeSession({
            created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
        });
        expect(isOrphanedSession(young, 'canceled', now)).toBe(false);
    });

    it('does not flag a session with no duffel pre-order (nothing to cancel)', () => {
        const noOrder = makeSession({ duffel_pre_order_id: null });
        expect(isOrphanedSession(noOrder, 'canceled', now)).toBe(false);
    });

    it('does not flag a session whose PI succeeded (user paid, webhook may be delayed)', () => {
        const paid = makeSession();
        expect(isOrphanedSession(paid, 'succeeded', now)).toBe(false);
    });
});

describe('filterOrphanedSessions', () => {
    it('excludes sessions that already have a flight_bookings record', () => {
        const sessions = [makeSession({ id: 'sess_1' }), makeSession({ id: 'sess_2' })];
        const booked = new Set(['sess_1']);
        const result = filterOrphanedSessions(sessions, booked);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('sess_2');
    });

    it('returns all sessions when none are booked', () => {
        const sessions = [makeSession({ id: 'sess_1' }), makeSession({ id: 'sess_2' })];
        const result = filterOrphanedSessions(sessions, new Set());
        expect(result).toHaveLength(2);
    });
});
