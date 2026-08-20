/**
 * Per-night display pricing.
 *
 * TravelgateX quotes `property.price` as a gross **total for the whole stay**, but
 * every price surface in the app is labelled "/night". Each surface used to divide
 * by nights on its own, so the ones that forgot showed the stay total next to a
 * per-night label — a 4-night search rendered the same hotel as $31 on its map
 * marker and $8 on its card.
 *
 * Both helpers here are pure so the list, the cards and the markers can share one
 * definition; `useNights` (src/hooks/useNights.ts) supplies the nights count from
 * the search store.
 */

import { convertCurrency } from '@/lib/currency';

/** Whole nights between two dates; never less than 1, and 1 when dates are unset. */
export function nightsBetween(checkIn?: Date | null, checkOut?: Date | null): number {
    if (!checkIn || !checkOut) return 1;
    return Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000));
}

/**
 * Convert a stay total into a per-night amount in the customer's currency.
 *
 * @param stayTotal  Gross total for the whole stay, in `sourceCurrency`.
 * @param nights     Nights in the stay — pass `nightsBetween(...)` or `useNights()`.
 */
export function toPerNight(
    stayTotal: number,
    sourceCurrency: string | undefined,
    targetCurrency: string,
    nights: number,
): number {
    return convertCurrency(stayTotal || 0, sourceCurrency || 'USD', targetCurrency) / Math.max(1, nights);
}
