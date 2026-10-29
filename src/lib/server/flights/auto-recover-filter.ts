export interface RecoverableSession {
    provider: string;
    payment_intent_id: string | null;
}

/**
 * Returns true only if this session should be retried by auto-recover.
 *
 * For Duffel: the Stripe PI must be 'succeeded' — the order was pre-created
 * before payment, so a non-succeeded PI means the user abandoned checkout
 * and we must NOT create a booking record for an unpaid order.
 *
 * For Mystifly: uses manual capture, so the PI status at recovery time is
 * 'requires_capture' (authorized). Auto-recover is still valid.
 */
export function shouldRecoverSession(
    session: RecoverableSession,
    piStatus: string,
): boolean {
    if (session.provider === 'duffel') {
        return piStatus === 'succeeded';
    }
    return true;
}

/** A held card that nobody finalised within this long is released rather than left for days. */
export const AUTHORISED_HOLD_GIVE_UP_MS = 2 * 60 * 60 * 1000;

/**
 * How long a booking session is worth waiting on for a card: its 30-minute life plus a margin.
 * Before this a traveller may still be entering a card or completing 3DS.
 */
export const AUTHORISED_SESSION_LIFETIME_MS = 35 * 60 * 1000;

/**
 * - `finalise`: the card is held, or already captured; buy (or record) the booking.
 * - `wait`: the traveller may still be paying; touch nothing.
 * - `release`: give up: cancel the intent so a late payment cannot leave a hold, and expire.
 * - `expire`: the intent is already inert; only the session needs closing.
 */
export type AuthorisedRecovery = 'finalise' | 'wait' | 'release' | 'expire';

/**
 * What auto-recover does with a session whose Duffel intent was created authorise-first.
 *
 * `requires_capture` is the card held and the booking not made (the webhook and /confirm both
 * missed): finalising is safe, because the claim makes it place one order. An intent still
 * awaiting the traveller is left alone until the session has run out; auto-recover looks at
 * sessions older than five minutes, which is well inside a 3DS challenge.
 */
export function decideAuthorisedRecovery(piStatus: string, sessionAgeMs: number): AuthorisedRecovery {
    if (piStatus === 'succeeded') return 'finalise';
    if (piStatus === 'canceled') return 'expire';
    if (piStatus === 'requires_capture') {
        return sessionAgeMs > AUTHORISED_HOLD_GIVE_UP_MS ? 'release' : 'finalise';
    }
    // requires_payment_method, requires_confirmation, requires_action, processing: not held yet.
    return sessionAgeMs > AUTHORISED_SESSION_LIFETIME_MS ? 'release' : 'wait';
}
