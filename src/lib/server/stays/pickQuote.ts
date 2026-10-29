/**
 * Choosing between the Quote responses that came back for one hotel.
 *
 * Prebook re-searches a hotel and quotes several candidate options at once, because a search
 * token expires quickly and a single quote often misses. Several of them succeed, and one has
 * to be the booking.
 *
 * It used to be whichever answered first — `Promise.any`. Candidates were ordered "preferred
 * room first" but a race ignores order, so the option a guest was charged for was settled by
 * network latency: a Jeju room chosen at ₩62,407 with a four-step cancellation ladder was
 * prebooked at ₩68,104 with a two-step one. Same room name, a different rate plan of it,
 * answering sooner.
 *
 * Separated from the route so the rule can be stated and tested on its own, rather than only
 * observed through a live supplier.
 */

/** The parts of a landed quote the choice depends on. */
export interface QuoteChoice {
    /** Quoted total, supplier currency. Compared only against quotes in the same response. */
    price: number;
    /** The room this quote is for, as the supplier named it. */
    roomName: string;
    /** Position in the candidate list, as a stable tiebreak. */
    order: number;
}

/**
 * The quote to book, or `null` when nothing landed.
 *
 * Two rules, in this order:
 *
 * 1. **The room the guest picked wins.** A cheaper quote for a different room is not a better
 *    answer to "book this one" — substituting a room to save money is not ours to do. Only
 *    when no quote for their room survives do the others become eligible at all.
 * 2. **Then the cheapest.** A room card advertises the cheapest option for that room, so the
 *    cheapest is the one the guest was looking at when they chose. Ties break on candidate
 *    order, so the result never depends on which response happened to arrive first.
 *
 * @param landed            Quotes that came back, in any order.
 * @param selectedRoomName  What the guest chose; empty means they expressed no preference.
 * @param matches           Room-name comparison, supplied by the caller that owns the naming.
 */
export function pickQuote<T extends QuoteChoice>(
    landed: readonly T[],
    selectedRoomName: string,
    matches: (candidate: string, selected: string) => boolean,
): T | null {
    if (landed.length === 0) return null;

    const sameRoom = selectedRoomName
        ? landed.filter((w) => matches(w.roomName, selectedRoomName))
        : [];
    const pool = sameRoom.length > 0 ? sameRoom : landed;

    return [...pool].sort((a, b) => a.price - b.price || a.order - b.order)[0] ?? null;
}
