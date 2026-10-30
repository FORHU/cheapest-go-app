/**
 * Turn a failed Duffel `POST /air/orders` answer into a stable code and a sentence.
 *
 * Match on Duffel's error code, not on the bare 422 status: Duffel answers 422 for every
 * rejected order — an expired offer, but equally a malformed passport number — so treating
 * the status alone as "expired" reported a stale fare for problems unrelated to the fare.
 * A balance problem is checked before an expired one because both arrive as 422 and the
 * cause is ours, not the fare's.
 */
export interface MappedOrderError { code: string; message: string }

const EXPIRED_CODES = new Set([
    'offer_no_longer_available',
    'offer_expired',
    'offer_request_not_found',
    'not_found',
]);

export function mapDuffelOrderError(status: number, data: any): MappedOrderError {
    const first = data?.errors?.[0];
    const rawMessage: string = first?.message ?? '';
    const code: string = first?.code ?? '';

    const isPhone = /phone_number/i.test(rawMessage);
    const isBalance = code === 'insufficient_balance' || /insufficient.*balance|balance.*insufficient/i.test(rawMessage);
    const isExpired = !isBalance && (EXPIRED_CODES.has(code) || /expired|no longer available|select another offer/i.test(rawMessage));
    const isSeat = /seat|service.*unavailable|no longer.*available.*service/i.test(rawMessage) && !isExpired && !isBalance;

    if (isPhone) return { code: 'phone_number_invalid', message: 'The airline rejected the contact phone number.' };
    if (isBalance) return { code: 'balance_insufficient', message: 'Flight booking is temporarily unavailable. Please try again shortly.' };
    if (isExpired) return { code: 'flight_unavailable', message: 'This flight is no longer available.' };
    if (isSeat) return { code: 'seats_unavailable', message: 'The seats or bags you selected are no longer available.' };
    if (status >= 500) return { code: 'supplier_outage', message: 'The airline booking system is not responding right now.' };
    return { code: 'booking_failed', message: rawMessage || 'Flight booking failed. Please try again.' };
}
