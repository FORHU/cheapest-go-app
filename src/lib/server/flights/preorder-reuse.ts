/**
 * Reuse the ticket a previous attempt already bought, instead of buying another.
 *
 * `/api/flights/book` issues a real, paid Duffel order at Step 1.5 — before the
 * traveller has entered a card. The payment screen then offers "Back to details",
 * and re-submitting from there calls `/book` again, which opens a fresh booking
 * session and buys a **second** ticket for the same trip. That is how one CRK→NRT
 * attempt became two paid EVA tickets 61 seconds apart: the same fare, once
 * quoted in USD and once in PHP after a currency change.
 *
 * Matching is on the Duffel offer id, which is the tightest key available. The
 * offer is carried in `sessionStorage` across the back-and-forth, so a genuine
 * re-submit of the same trip presents the same offer id, while a new search
 * produces a different one and is correctly treated as a new booking.
 */

/** Statuses where the session's pre-order is still unpaid and therefore reusable. */
const REUSABLE_STATUSES = new Set(['initiated', 'payment_initiated', 'payment_authorized']);

/** Sessions live 30 minutes; never reuse a pre-order past that. */
export const REUSE_WINDOW_MS = 30 * 60 * 1000;

export interface CandidateSession {
    id: string;
    status: string;
    duffel_pre_order_id: string | null;
    duffel_pre_order_pnr?: string | null;
    duffel_pre_order_tickets?: string[] | null;
    duffel_pre_order_ticketed?: boolean | null;
    payment_intent_id?: string | null;
    flight?: any;
    created_at: string | Date;
}

export interface ReuseOptions {
    /** Duffel offer id of the booking being attempted now. */
    offerId: string;
    /** The session just created for this attempt — never match against itself. */
    excludeSessionId: string;
    now?: Date;
    maxAgeMs?: number;
}

/** The Duffel offer id a stored session was created from, if it kept one. */
export function sessionOfferId(session: CandidateSession): string | null {
    const id = session?.flight?._rawOffer?.id;
    return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Pick the most recent session holding a still-unpaid pre-order for this offer.
 *
 * Returns null when there is nothing safe to reuse — the caller then creates an
 * order as normal. Being wrong in that direction costs an extra ticket only in
 * the case we already had; being wrong the other way would attach a traveller to
 * an order for a different trip, so every clause here has to agree.
 */
export function findReusablePreOrder(
    sessions: CandidateSession[],
    opts: ReuseOptions,
): CandidateSession | null {
    const now = opts.now ?? new Date();
    const maxAge = opts.maxAgeMs ?? REUSE_WINDOW_MS;
    if (!opts.offerId) return null;

    const usable = (sessions ?? []).filter(s => {
        if (!s || s.id === opts.excludeSessionId) return false;
        if (!s.duffel_pre_order_id) return false;
        if (!REUSABLE_STATUSES.has(s.status)) return false;
        if (sessionOfferId(s) !== opts.offerId) return false;

        const created = new Date(s.created_at).getTime();
        if (!Number.isFinite(created)) return false;
        const age = now.getTime() - created;
        // Future-dated rows mean clock skew, not a valid candidate.
        if (age < 0 || age > maxAge) return false;

        return true;
    });

    if (usable.length === 0) return null;

    // Most recent wins: if several attempts somehow bought tickets, the newest
    // pre-order is the one whose price and services match this attempt.
    usable.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return usable[0];
}
