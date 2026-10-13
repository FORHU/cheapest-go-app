import { describe, it, expect } from 'vitest';
import {
    shouldRecoverSession, decideAuthorisedRecovery,
    AUTHORISED_HOLD_GIVE_UP_MS, AUTHORISED_SESSION_LIFETIME_MS,
} from './auto-recover-filter';

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

describe('decideAuthorisedRecovery', () => {
    const young = 10 * 60 * 1000;
    const old = AUTHORISED_HOLD_GIVE_UP_MS + 1;

    it('finalises a held card, or one already captured, while the session is young', () => {
        expect(decideAuthorisedRecovery('requires_capture', young)).toBe('finalise');
        expect(decideAuthorisedRecovery('succeeded', young)).toBe('finalise');
    });

    it('releases a hold that has gone unfinalised for too long', () => {
        expect(decideAuthorisedRecovery('requires_capture', old)).toBe('release');
    });

    it('still records a captured booking however old the session is', () => {
        expect(decideAuthorisedRecovery('succeeded', old)).toBe('finalise');
    });

    it('waits for a card that is still being entered, within the life of the session', () => {
        // Auto-recover looks at sessions older than 5 minutes, and a traveller doing 3DS can be
        // well into that. Expiring the session under them leaves a hold nobody finalises.
        expect(decideAuthorisedRecovery('requires_payment_method', young)).toBe('wait');
        expect(decideAuthorisedRecovery('requires_confirmation', young)).toBe('wait');
        expect(decideAuthorisedRecovery('requires_action', young)).toBe('wait');
        expect(decideAuthorisedRecovery('processing', young)).toBe('wait');
    });

    it('releases a card that was never completed once the session has run out, so a late payment cannot leave a hold', () => {
        const expired = AUTHORISED_SESSION_LIFETIME_MS + 1;
        expect(decideAuthorisedRecovery('requires_payment_method', expired)).toBe('release');
        expect(decideAuthorisedRecovery('requires_action', expired)).toBe('release');
    });

    it('only expires a session whose intent is already cancelled', () => {
        expect(decideAuthorisedRecovery('canceled', young)).toBe('expire');
        expect(decideAuthorisedRecovery('canceled', old)).toBe('expire');
    });
});
