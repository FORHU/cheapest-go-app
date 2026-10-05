import { describe, it, expect } from 'vitest';
import { cancellationFor, decideBy, freeCancelUntil, holdExpiresAt, isBookableStart } from './rules';

const at = (iso: string) => new Date(iso);

describe('holdExpiresAt', () => {
    it('is fifteen minutes on', () => {
        expect(holdExpiresAt(at('2026-10-06T10:00:00Z')).toISOString()).toBe('2026-10-06T10:15:00.000Z');
    });
});

describe('decideBy', () => {
    it('gives the team 48 hours when the tee time is far off', () => {
        expect(decideBy(at('2026-10-06T10:00:00Z'), at('2026-10-20T00:00:00Z')).toISOString()).toBe('2026-10-08T10:00:00.000Z');
    });

    it('ends two hours before the tee time when that comes first', () => {
        expect(decideBy(at('2026-10-06T10:00:00Z'), at('2026-10-07T16:00:00Z')).toISOString()).toBe('2026-10-07T14:00:00.000Z');
    });
});

describe('freeCancelUntil', () => {
    it('counts back from the tee time', () => {
        expect(freeCancelUntil(at('2026-10-10T00:00:00Z'), 48).toISOString()).toBe('2026-10-08T00:00:00.000Z');
    });
});

describe('isBookableStart', () => {
    const now = at('2026-10-06T00:00:00Z');
    it('needs a day for the team to check, and stays inside the horizon', () => {
        expect(isBookableStart(at('2026-10-06T23:00:00Z'), now)).toBe(false);
        expect(isBookableStart(at('2026-10-07T00:00:00Z'), now)).toBe(true);
        expect(isBookableStart(at('2026-12-10T00:00:00Z'), now)).toBe(false);
    });
});

describe('cancellationFor', () => {
    const cutoff = at('2026-10-08T00:00:00Z');
    const confirmed = { status: 'confirmed' as const, total: 5300, freeCancelUntil: cutoff };

    it('releases a request that was never charged', () => {
        expect(cancellationFor({ ...confirmed, status: 'requested' }, at('2026-10-07T00:00:00Z')))
            .toEqual({ allowed: true, refund: 0, charged: false });
    });

    it('refunds a confirmed booking in full before the cutoff', () => {
        expect(cancellationFor(confirmed, at('2026-10-07T23:59:00Z'))).toEqual({ allowed: true, refund: 5300, charged: true });
    });

    it('refuses once free cancellation has ended', () => {
        expect(cancellationFor(confirmed, cutoff)).toEqual({ allowed: false, reason: 'free_cancellation_ended' });
    });

    it('refuses anything that is not waiting or confirmed', () => {
        for (const status of ['held', 'expired', 'declined', 'cancelled'] as const) {
            expect(cancellationFor({ ...confirmed, status }, at('2026-10-01T00:00:00Z'))).toEqual({ allowed: false, reason: 'not_cancellable' });
        }
    });
});
