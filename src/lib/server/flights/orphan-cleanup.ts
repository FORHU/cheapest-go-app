const ORPHAN_AGE_MS = 35 * 60 * 1000; // 35 min — past the 30-min Stripe PI expiry window

export interface OrphanCandidate {
    id: string;
    provider: string;
    payment_intent_id: string | null;
    duffel_pre_order_id: string | null;
    status: string;
    created_at: string;
}

/**
 * Returns true if this booking_session holds an orphaned Duffel order that
 * should be cancelled and the session marked expired.
 *
 * A session is orphaned when ALL of the following are true:
 *  1. It is older than 35 minutes (the Stripe PI 30-min expiry has passed)
 *  2. It has a duffel_pre_order_id (an order was created and balance was debited)
 *  3. The Stripe PI did NOT succeed (user abandoned checkout, no payment received)
 */
export function isOrphanedSession(
    session: OrphanCandidate,
    piStatus: string,
    now: Date,
): boolean {
    const age = now.getTime() - new Date(session.created_at).getTime();
    if (age < ORPHAN_AGE_MS) return false;
    if (!session.duffel_pre_order_id) return false;
    if (piStatus === 'succeeded') return false;
    return true;
}

/**
 * Filters a list of candidate sessions down to only those that are truly
 * orphaned — i.e. not already recorded in flight_bookings.
 */
export function filterOrphanedSessions(
    sessions: OrphanCandidate[],
    bookedSessionIds: Set<string>,
): OrphanCandidate[] {
    return sessions.filter(s => !bookedSessionIds.has(s.id));
}
