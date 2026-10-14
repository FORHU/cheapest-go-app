export type OrderErrorCode =
    | 'phone_number_invalid'
    | 'balance_insufficient'
    | 'flight_unavailable'
    | 'seats_unavailable'
    | 'supplier_outage';

export interface OrderFailure {
    /** Our bucket. Several Duffel codes collapse into each one. */
    errorCode: OrderErrorCode | null;
    httpStatus: number;
    /** Duffel's own wording, only when we have no code of our own. */
    error?: string;
    /** Duffel's code, echoed for diagnosis. */
    duffelCode?: string;
    requestId?: string;
}

const EXPIRED_CODES = new Set(['offer_no_longer_available', 'offer_expired', 'offer_request_not_found', 'not_found']);

/**
 * Turn a refused `POST /air/orders` into one of our codes.
 *
 * Match on Duffel's error code, not the bare 422: Duffel answers 422 for every rejected order,
 * an expired offer but equally a malformed passport number. A balance error is checked before
 * expiry because both arrive as 422 and only one of them is the fare's fault.
 */
export function mapDuffelOrderFailure(status: number, data: any): OrderFailure {
    const first = data?.errors?.[0];
    const rawMessage: string = first?.message ?? '';
    const code: string = first?.code ?? '';
    const requestId: string = data?.meta?.request_id ?? '';

    const isPhone = /phone_number/i.test(rawMessage);
    const isBalance = code === 'insufficient_balance' || /insufficient.*balance|balance.*insufficient/i.test(rawMessage);
    const isExpired = !isBalance && (EXPIRED_CODES.has(code) || /expired|no longer available|select another offer/i.test(rawMessage));
    const isSeat = /seat|service.*unavailable|no longer.*available.*service/i.test(rawMessage) && !isExpired && !isBalance;
    const isOutage = status >= 500;

    let errorCode: OrderErrorCode | null = null;
    if (isPhone) errorCode = 'phone_number_invalid';
    else if (isBalance) errorCode = 'balance_insufficient';
    else if (isExpired) errorCode = 'flight_unavailable';
    else if (isSeat) errorCode = 'seats_unavailable';
    else if (isOutage) errorCode = 'supplier_outage';

    let httpStatus = 400;
    if (isBalance) httpStatus = 503;
    else if (isExpired) httpStatus = 409;
    else if (isOutage) httpStatus = 502;

    return {
        errorCode,
        httpStatus,
        error: isBalance
            ? 'Flight booking is temporarily unavailable. Please try again shortly.'
            : errorCode ? undefined : (rawMessage || 'Flight booking failed. Please try again.'),
        duffelCode: code || undefined,
        requestId: requestId || undefined,
    };
}
