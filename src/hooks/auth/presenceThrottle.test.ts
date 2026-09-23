import { describe, it, expect } from 'vitest';
import { shouldSendPresencePing, PRESENCE_PING_MIN_INTERVAL_MS } from './presenceThrottle';

/**
 * Every click, keypress, scroll and touch on a signed-in page could fire this decision —
 * the point of it is to turn that into at most one `/api/auth/presence` POST per minute,
 * so `useIdlePresence` isn't itself the kind of traffic CONTEXT.md warns against treating
 * as Presence.
 */

describe('shouldSendPresencePing', () => {
    it('sends the first ping, when nothing has been sent yet', () => {
        expect(shouldSendPresencePing(null, Date.now())).toBe(true);
    });

    it('withholds a second ping inside the minimum interval', () => {
        const lastPingAt = 1_000_000;
        const now = lastPingAt + PRESENCE_PING_MIN_INTERVAL_MS - 1;
        expect(shouldSendPresencePing(lastPingAt, now)).toBe(false);
    });

    it('allows another ping once the minimum interval has fully elapsed', () => {
        const lastPingAt = 1_000_000;
        const now = lastPingAt + PRESENCE_PING_MIN_INTERVAL_MS;
        expect(shouldSendPresencePing(lastPingAt, now)).toBe(true);
    });
});
