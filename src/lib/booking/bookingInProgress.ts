import { useBookingStore } from '@/stores/bookingStore';
import { useCheckoutStore } from '@/stores/checkoutStore';

/**
 * A Booking in progress lives in the browser, not on an account.
 *
 * The hotel and room, the dates, and everything typed into checkout — the booker's name,
 * email and phone, guest and passenger details — are kept in local and session storage so
 * a page reload or a Stripe redirect does not lose them. Nothing tied that to who was
 * signed in, so after one account signed out and another signed in on the same browser,
 * the second account opened /checkout onto the first one's booking with the first one's
 * details filled in (QA BG-1). Payment was never at risk — it needs its own session — but
 * the personal details were on screen.
 *
 * Two rules:
 *   - Signing out wipes it. A shared computer is the case that matters.
 *   - Signing in keeps it only for the account that made it. Details entered while signed
 *     out are adopted by whoever signs in next — that is the browse-then-sign-in-to-pay
 *     path ADR-0027 keeps open — but if they were made under a different account (a
 *     session that expired without anyone signing out), they are wiped.
 */

/** Which account the Booking in progress in this browser belongs to. Absent = signed out. */
const OWNER_KEY = 'cheapestgo-booking-owner';

/** Session-storage entries the hotel and flight flows write outside the two stores. */
const SESSION_KEYS = [
    'hotelCheckoutSession',
    'bundleFlightId',
    'hasAlreadyBookedHotel',
    'hasAlreadyBookedFlight',
    'selectedFlight',
    'flightPassengers',
    'flightContact',
    'flightSearchPassengers',
    'flightBookingSessionId',
    'flightPaymentIntentId',
    'flightBookingTs',
];

function quietly(fn: () => void) {
    try { fn(); } catch { /* storage blocked (private mode, sandbox) — nothing stored to leak */ }
}

export function clearBookingInProgress(): void {
    if (typeof window === 'undefined') return;
    useBookingStore.getState().resetBooking();
    useCheckoutStore.getState().resetForm();
    quietly(() => {
        for (const key of SESSION_KEYS) sessionStorage.removeItem(key);
        localStorage.removeItem(OWNER_KEY);
    });
}

/** Called whenever an account becomes the signed-in one. */
export function claimBookingInProgress(userId: string): void {
    if (typeof window === 'undefined') return;
    let owner: string | null = null;
    quietly(() => { owner = localStorage.getItem(OWNER_KEY); });
    if (owner && owner !== userId) clearBookingInProgress();
    quietly(() => localStorage.setItem(OWNER_KEY, userId));
}
