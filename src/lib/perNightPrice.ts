/**
 * Per-night display pricing.
 *
 * ── What `property.price` is on a search result ──────────────────────────────────────
 *
 * A **Nightly Rate**, already. `/api/search/stream` divides the supplier's stay total by
 * the night count before it puts a price on the wire, so everything downstream — the list
 * card, the map marker, the popup — renders it as it arrives and converts currency only.
 *
 * It has not always been so, and the history is the reason this file still exists to say
 * it. TravelgateX quotes a **Stay Total**; each surface used to divide by nights itself,
 * and the ones that forgot showed a stay total under a per-night label — a 4-night search
 * rendering the same hotel as $31 on its marker and $8 on its card. The fix then was a
 * shared `toPerNight` helper. Later the same division was added on the server, and nobody
 * removed the client half, so for a while **every multi-night search advertised half the
 * real price**: ₱1,587 on the map for a room the property page sold at ₱3,173.
 *
 * `toPerNight` is deliberately gone rather than merely unused. Its name invited exactly the
 * mistake that produced the second bug — a helper called "to per night" reads as safe to
 * apply to any price, including one that is already per night, and dividing twice is
 * silent. There is nothing to call now; a search price needs converting, not dividing.
 *
 * A room price on the property page is a different figure from a different request, and
 * `RoomList` still divides it. That path reconstructs the stay total afterwards and is
 * self-consistent; do not "unify" the two without reading both.
 */

/** Whole nights between two dates; never less than 1, and 1 when dates are unset. */
export function nightsBetween(checkIn?: Date | null, checkOut?: Date | null): number {
    if (!checkIn || !checkOut) return 1;
    return Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000));
}
