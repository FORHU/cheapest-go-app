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
