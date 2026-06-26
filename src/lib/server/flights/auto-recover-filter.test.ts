import { describe, it, expect } from 'vitest';
import { shouldRecoverSession } from './auto-recover-filter';

describe('shouldRecoverSession', () => {
    it('skips a Duffel session when the Stripe PI has not succeeded', () => {
        const session = { provider: 'duffel', payment_intent_id: 'pi_123' };
        expect(shouldRecoverSession(session, 'requires_payment_method')).toBe(false);
        expect(shouldRecoverSession(session, 'requires_action')).toBe(false);
        expect(shouldRecoverSession(session, 'canceled')).toBe(false);
        expect(shouldRecoverSession(session, 'processing')).toBe(false);
    });

    it('recovers a Duffel session when the Stripe PI succeeded', () => {
        const session = { provider: 'duffel', payment_intent_id: 'pi_123' };
        expect(shouldRecoverSession(session, 'succeeded')).toBe(true);
    });

    it('always recovers a Mystifly session regardless of PI status', () => {
        const session = { provider: 'mystifly_v2', payment_intent_id: 'pi_456' };
        expect(shouldRecoverSession(session, 'requires_capture')).toBe(true);
        expect(shouldRecoverSession(session, 'succeeded')).toBe(true);
    });
});
