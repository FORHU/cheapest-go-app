/**
 * Resilient Duffel order placement.
 *
 * Extracted from /api/flights/book (web) so the mobile booking route can share the
 * same retry behaviour instead of doing a single fragile attempt. Different airlines
 * behave very differently at order-creation time — some hang, some return
 * `offer_no_longer_available`, some `price_changed` — and a single attempt turns any
 * of those transient conditions into a hard failure. This helper:
 *
 *   1. Places the order with a per-attempt timeout (Duffel sometimes hangs). A request
 *      that times out or errors is reconciled against Duffel's order list first — it may
 *      have landed — and only reported as a timeout when no matching order exists.
 *   2. On `price_changed`, runs a live Price Action and retries (up to 2×); the retry is
 *      reconciled the same way.
 *   3. On `offer_no_longer_available`, rebuilds an offer_request, re-quotes fresh offers,
 *      keeps only those with the identical itinerary, and tries them cheapest first.
 *
 * It is provider-internal: callers pass an already-built set of Duffel order
 * passengers and the raw offer, and receive a normalised result they map to HTTP.
 *
 * NOTE: the web /api/flights/book route still has its own inline copy of this logic,
 * used while FLIGHT_PAY_FIRST is off. The pay-first flow calls THIS helper, so it has to
 * stay at parity with that copy — in particular exact-itinerary matching on a refresh and
 * recovery of an order whose request timed out.
 */

import { cabinClassFromRawOffer } from './duffel-cabin';
import { findOrderFromTimedOutAttempt } from './duffel-order-reconcile';
import { withDuffelServicePrices } from './duffel-service-prices';
import { sameItineraryOffers } from './offer-itinerary-match';

const DUFFEL_ORDERS_URL = 'https://api.duffel.com/air/orders';
// Duffel's documented minimum: "You must set a HTTP client timeout of at least 130s".
// Order creation runs synchronously through to the airline, aborting does NOT cancel it —
// a shorter timeout orphans a real PNR without recording it.
export const DEFAULT_ORDER_TIMEOUT_MS = 130_000;
const PRICE_ACTION_TIMEOUT_MS = 10_000;

export interface PlaceDuffelOrderParams {
    duffelToken: string;
    /** The raw Duffel offer object (flight._rawOffer). */
    rawOffer: any;
    /** Duffel order passenger objects (id, title, given_name, …) for the current offer. */
    passengers: any[];
    /** Order total as a fixed-2 string, e.g. "332.00". */
    total: string;
    currency: string;
    seatServiceIds?: string[];
    bagServiceIds?: string[];
    /** Price the user has already agreed to (skips price_changed within tolerance). */
    confirmedPrice?: number;
    /** Absolute price delta (major units) treated as "unchanged". */
    priceTolerance: number;
    /** Idempotency key for the first attempt. Retries use fresh keys (Duffel requires it after a 4xx). */
    idempotencyKey: string;
    /** How many fresh offers to try when auto-refreshing an expired offer. */
    refreshPoolSize?: number;
    /** Per-attempt timeout. */
    orderTimeoutMs?: number;
}

export type PlaceDuffelOrderResult =
    | { kind: 'success'; order: any; finalTotal: string; finalCurrency: string; usedOffer: any }
    | { kind: 'price_changed'; oldPrice: number; newPrice: number; currency: string }
    /** A refreshed offer was needed but the original had seats/bags that don't carry over. */
    | { kind: 'offer_replaced'; newOfferId: string; newOffer: any }
    | { kind: 'error'; status: number; data: any };

interface TryPlaceOrderResult {
    isPriceChangedError: boolean;
    isOfferUnavailable: boolean;
    oldPrice?: number;
    newPrice?: number;
    newCurrency?: string;
    res?: Response;
    data?: any;
    finalTotal?: string;
    finalCurrency?: string;
}

export async function placeDuffelOrder(params: PlaceDuffelOrderParams): Promise<PlaceDuffelOrderResult> {
    const {
        duffelToken,
        rawOffer,
        seatServiceIds,
        bagServiceIds,
        confirmedPrice,
        priceTolerance,
        idempotencyKey,
        refreshPoolSize = 3,
        orderTimeoutMs = DEFAULT_ORDER_TIMEOUT_MS,
    } = params;

    const getDuffelHeaders = (key: string) => ({
        'Authorization': `Bearer ${duffelToken}`,
        'Duffel-Version': 'v2',
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
    });

    const buildOrderBody = (
        offerId: string,
        paxList: any[],
        total: string,
        currency: string,
        includeServices: boolean,
    ) => ({
        type: 'instant',
        selected_offers: [offerId],
        passengers: paxList,
        payments: [{ type: 'balance', amount: total, currency }],
        ...(includeServices && (seatServiceIds?.length || bagServiceIds?.length)
            ? { services: [...(seatServiceIds ?? []), ...(bagServiceIds ?? [])].map(id => ({ id, quantity: 1 })) }
            : {}),
    });

    // ── Single order attempt, with an internal price_changed retry loop ──────────
    const tryPlaceOrder = async (
        offerId: string,
        paxList: any[],
        total: string,
        currency: string,
        includeServices: boolean,
        key: string,
    ): Promise<TryPlaceOrderResult> => {
        let currentTotal = total;
        let currentCurrency = currency;

        // Aborting (or losing the connection to) an order request does NOT cancel the booking
        // at Duffel — it proceeds regardless. Before reporting failure, check whether the
        // attempt that started at `sinceIso` actually landed; reporting failure invites the
        // caller to retry and create a second paid ticket for the same trip. Used by BOTH the
        // first request and the price_changed retry so the two cannot drift.
        const reconcileOrTimeout = async (sinceIso: string): Promise<TryPlaceOrderResult> => {
            const origin = rawOffer.slices?.[0]?.origin?.iata_code;
            const lastSlice = rawOffer.slices?.[rawOffer.slices.length - 1];
            const destination = lastSlice?.destination?.iata_code;
            const recovered = await findOrderFromTimedOutAttempt(duffelToken, {
                sinceIso,
                origin: origin ?? '',
                destination: destination ?? '',
                totalAmount: currentTotal,
                currency: currentCurrency,
                familyName: paxList?.[0]?.family_name,
            }).catch((e: any) => {
                console.warn('[placeDuffelOrder] reconciliation check failed:', e?.message);
                return null;
            });

            if (recovered) {
                console.warn(`[placeDuffelOrder] Timed-out attempt succeeded — adopting order ${recovered.id} (${recovered.booking_reference})`);
                return {
                    isPriceChangedError: false,
                    isOfferUnavailable: false,
                    res: new Response(null, { status: 200 }),
                    // The raw order, as a normal 201 would carry it: callers read slices,
                    // passengers and documents off it.
                    data: { data: recovered },
                    finalTotal: currentTotal,
                    finalCurrency: currentCurrency,
                };
            }

            return {
                isPriceChangedError: false,
                isOfferUnavailable: false,
                res: new Response(null, { status: 504 }),
                data: { errors: [{ code: 'timeout', message: 'Airline booking system timed out. Please try again.' }] },
                finalTotal: currentTotal,
                finalCurrency: currentCurrency,
            };
        };

        const orderAbort = new AbortController();
        const orderTimeout = setTimeout(() => orderAbort.abort(), orderTimeoutMs);

        // Stamped before the request so reconciliation can find orders created
        // during this window even when the response never arrived.
        const attemptStartedAt = new Date().toISOString();

        let res: Response;
        let data: any;
        try {
            res = await fetch(DUFFEL_ORDERS_URL, {
                method: 'POST',
                headers: getDuffelHeaders(key),
                body: JSON.stringify({ data: buildOrderBody(offerId, paxList, currentTotal, currentCurrency, includeServices) }),
                signal: orderAbort.signal,
            });
            data = await res.json();
        } catch (fetchErr: any) {
            clearTimeout(orderTimeout);
            if (fetchErr?.name === 'AbortError') {
                console.error(`[placeDuffelOrder] order timed out after ${orderTimeoutMs}ms for offer ${offerId}`);

                return reconcileOrTimeout(attemptStartedAt);
            }
            throw fetchErr;
        }
        clearTimeout(orderTimeout);

        if (res.status === 422 && data?.errors?.[0]?.code === 'offer_no_longer_available') {
            console.warn(`[placeDuffelOrder] 422 offer_no_longer_available on ${offerId}`);
            return { isPriceChangedError: false, isOfferUnavailable: true };
        }

        // Catch a fast-moving price: up to 2 live Price Action retries.
        let internalAttempts = 0;
        while (res.status === 422 && data?.errors?.[0]?.code === 'price_changed' && internalAttempts < 2) {
            internalAttempts++;
            const currentId = data?.errors?.[0]?.source?.offer_id ?? offerId;
            console.warn(`[placeDuffelOrder] 422 price_changed on ${currentId} (attempt ${internalAttempts}) — Price Action`);

            const priceAbort = new AbortController();
            const priceTimeout = setTimeout(() => priceAbort.abort(), PRICE_ACTION_TIMEOUT_MS);
            let liveRes: Response;
            let liveData: any;
            try {
                liveRes = await fetch(`https://api.duffel.com/air/offers/${currentId}/actions/price`, {
                    method: 'POST',
                    headers: getDuffelHeaders(crypto.randomUUID()),
                    body: JSON.stringify({ data: {} }),
                    signal: priceAbort.signal,
                });
                liveData = await liveRes.json();
            } catch (priceErr: any) {
                clearTimeout(priceTimeout);
                console.error(`[placeDuffelOrder] Price Action failed: ${priceErr.message}`);
                break;
            }
            clearTimeout(priceTimeout);

            if (!liveRes.ok || !liveData?.data) {
                console.error(`[placeDuffelOrder] Price Action ${liveRes.status} on ${currentId} — cannot retry`);
                break;
            }

            const pricedOffer = liveData.data;
            const pricedId = pricedOffer.id;

            // The price action returns no services at all, so extras priced from it came
            // to zero and Duffel refused the retried payment. Ask for them directly.
            let availableSvcs: any[] = [];
            if (includeServices) {
                try {
                    availableSvcs = (await withDuffelServicePrices(pricedOffer, seatServiceIds, bagServiceIds, duffelToken)).available_services ?? [];
                } catch (svcErr: any) {
                    console.error(`[placeDuffelOrder] could not re-price services on ${pricedId}: ${svcErr.message}`);
                    break;
                }
            }
            let newSeatExtra = 0;
            let newBagExtra = 0;
            if (includeServices) {
                for (const id of (seatServiceIds ?? [])) {
                    const svc = availableSvcs.find((s: any) => s.id === id);
                    if (svc) newSeatExtra += parseFloat(svc.total_amount ?? '0');
                }
                for (const id of (bagServiceIds ?? [])) {
                    const svc = availableSvcs.find((s: any) => s.id === id);
                    if (svc) newBagExtra += parseFloat(svc.total_amount ?? '0');
                }
            }

            const freshBase = parseFloat(pricedOffer.total_amount ?? '0');
            const newTotalNum = freshBase + newSeatExtra + newBagExtra;
            const oldTotalNum = parseFloat(currentTotal);
            // Signed, not absolute: only an increase is worth interrupting for.
            // A cheaper fare is adopted silently below.
            const priceDelta = newTotalNum - oldTotalNum;
            // Compare bare fares only — newTotalNum includes ancillaries but
            // confirmedPrice is the base fare the user approved, so total-vs-base
            // would read every seat/bag selection as an unexplained increase.
            const priceAlreadyConfirmed = confirmedPrice !== undefined && freshBase <= confirmedPrice + priceTolerance;
            currentCurrency = pricedOffer.total_currency ?? currentCurrency;

            if (priceDelta > priceTolerance && !priceAlreadyConfirmed) {
                return { isPriceChangedError: true, isOfferUnavailable: false, oldPrice: oldTotalNum, newPrice: newTotalNum, newCurrency: currentCurrency };
            }

            currentTotal = newTotalNum.toFixed(2);
            const retryAbort = new AbortController();
            const retryTimeout = setTimeout(() => retryAbort.abort(), orderTimeoutMs);
            // Stamped before the retry so a retry that lands but never answers can be found.
            const retryStartedAt = new Date().toISOString();
            try {
                res = await fetch(DUFFEL_ORDERS_URL, {
                    method: 'POST',
                    headers: getDuffelHeaders(crypto.randomUUID()),
                    body: JSON.stringify({ data: buildOrderBody(pricedId, paxList, currentTotal, currentCurrency, includeServices) }),
                    signal: retryAbort.signal,
                });
                data = await res.json();
            } catch (retryErr: any) {
                clearTimeout(retryTimeout);
                console.error(`[placeDuffelOrder] price_changed retry failed: ${retryErr.message}`);
                // Falling out of the loop here would leave the earlier 422 price_changed in
                // res/data, which the caller reads as "offer expired" and answers by booking
                // the same itinerary again under a fresh key — a second paid order if this
                // retry actually landed. Reconcile, and never report anything but the outcome
                // of THIS request (any thrown error, not just an abort, leaves it unknown).
                return reconcileOrTimeout(retryStartedAt);
            }
            clearTimeout(retryTimeout);
            if (res.ok) break;
        }

        return { isPriceChangedError: false, isOfferUnavailable: false, res, data, finalTotal: currentTotal, finalCurrency: currentCurrency };
    };

    // ── Attempt 1: the offer the user selected ──────────────────────────────────
    const attempt1 = await tryPlaceOrder(rawOffer.id, params.passengers, params.total, params.currency, true, idempotencyKey);
    if (attempt1.isPriceChangedError) {
        return { kind: 'price_changed', oldPrice: attempt1.oldPrice!, newPrice: attempt1.newPrice!, currency: attempt1.newCurrency ?? params.currency };
    }
    if (!attempt1.isOfferUnavailable && attempt1.res?.ok) {
        return { kind: 'success', order: attempt1.data.data, finalTotal: attempt1.finalTotal!, finalCurrency: attempt1.finalCurrency!, usedOffer: rawOffer };
    }
    // A non-422 hard error (e.g. phone, supplier 5xx, timeout) — surface it as-is.
    if (!attempt1.isOfferUnavailable && attempt1.res && attempt1.res.status !== 422) {
        return { kind: 'error', status: attempt1.res.status, data: attempt1.data };
    }

    // ── Auto-refresh: the offer expired — re-quote and find the identical itinerary ──
    console.warn('[placeDuffelOrder] offer expired — rebuilding offer_request');
    // An expiry answer carries no body, so give refresh failures one callers can map to
    // "flight no longer available". A non-expiry 422 keeps Duffel's real message.
    const refreshFailureData = attempt1.data ?? { errors: [{ code: 'offer_no_longer_available', message: 'The selected flight is no longer available' }] };
    try {
        const slices: any[] = (rawOffer.slices ?? []).map((sl: any) => {
            const origin = sl.origin?.iata_code ?? sl.segments?.[0]?.origin?.iata_code;
            const destination = sl.destination?.iata_code ?? sl.segments?.[sl.segments.length - 1]?.destination?.iata_code;
            const departure_date = sl.departure_date ?? sl.segments?.[0]?.departing_at?.slice(0, 10);
            return { origin, destination, departure_date };
        }).filter((s: any) => s.origin && s.destination && s.departure_date);

        if (slices.length === 0) return { kind: 'error', status: 422, data: refreshFailureData };

        const paxTypes: any[] = (rawOffer.passengers ?? []).map((p: any) => ({ type: p.type ?? 'adult' }));
        const cabinClass: string = cabinClassFromRawOffer(rawOffer);

        const orRes = await fetch('https://api.duffel.com/air/offer_requests?return_offers=true', {
            method: 'POST',
            headers: getDuffelHeaders(crypto.randomUUID()),
            body: JSON.stringify({ data: { slices, passengers: paxTypes, cabin_class: cabinClass } }),
        });
        const orData = await orRes.json();
        if (!orRes.ok) return { kind: 'error', status: 422, data: refreshFailureData };

        let offers: any[] = orData.data?.offers ?? [];
        if (offers.length === 0 && orData.data?.id) {
            const offersRes = await fetch(`https://api.duffel.com/air/offers?offer_request_id=${orData.data.id}&limit=50`, { headers: getDuffelHeaders(crypto.randomUUID()) });
            const offersData = await offersRes.json();
            offers = offersData.data ?? [];
        }
        if (offers.length === 0) return { kind: 'error', status: 422, data: refreshFailureData };

        // The same journey only: marketing carrier, flight number and departure instant,
        // segment by segment, cheapest first. A carrier-and-price match is not identity — it
        // can ticket a 22:00 departure for someone who chose 06:00. Nothing matching means the
        // flight is unavailable, not that a different one should be bought.
        const sortedPool = sameItineraryOffers(rawOffer, offers);
        if (sortedPool.length === 0) return { kind: 'error', status: 422, data: refreshFailureData };

        const hadAncillaries = (seatServiceIds?.length ?? 0) > 0 || (bagServiceIds?.length ?? 0) > 0;
        const maxAttempts = Math.min(sortedPool.length, refreshPoolSize);
        for (let i = 0; i < maxAttempts; i++) {
            const freshOffer = sortedPool[i];
            const freshBaseTotal = parseFloat(freshOffer.total_amount ?? '0');
            const oldPriceNum = parseFloat(rawOffer.total_amount ?? '0');
            // Signed: a refreshed offer that is cheaper needs no confirmation.
            const priceDelta = freshBaseTotal - oldPriceNum;
            const priceAlreadyConfirmed = confirmedPrice !== undefined && freshBaseTotal <= confirmedPrice + priceTolerance;

            if (priceDelta > priceTolerance && !priceAlreadyConfirmed) {
                return { kind: 'price_changed', oldPrice: oldPriceNum, newPrice: freshBaseTotal, currency: freshOffer.total_currency ?? params.currency };
            }

            // Seats/bags from the original offer can't carry to a re-quoted offer.
            if (hadAncillaries) {
                return { kind: 'offer_replaced', newOfferId: freshOffer.id, newOffer: freshOffer };
            }

            const freshPaxTemplates: any[] = freshOffer.passengers ?? [];
            const refreshedPassengers = params.passengers.map((pax: any, idx: number) => ({
                ...pax,
                id: freshPaxTemplates[idx]?.id ?? pax.id,
            }));

            const attempt2 = await tryPlaceOrder(freshOffer.id, refreshedPassengers, freshBaseTotal.toFixed(2), freshOffer.total_currency, false, crypto.randomUUID());

            if (attempt2.res?.status && attempt2.res.status >= 500) {
                return { kind: 'error', status: attempt2.res.status, data: attempt2.data };
            }
            if (attempt2.isOfferUnavailable) continue;
            if (attempt2.isPriceChangedError) {
                return { kind: 'price_changed', oldPrice: attempt2.oldPrice!, newPrice: attempt2.newPrice!, currency: attempt2.newCurrency ?? params.currency };
            }
            if (attempt2.res?.ok) {
                return { kind: 'success', order: attempt2.data.data, finalTotal: attempt2.finalTotal!, finalCurrency: attempt2.finalCurrency!, usedOffer: freshOffer };
            }
            // Non-OK, non-422 from this fresh offer — surface it.
            return { kind: 'error', status: attempt2.res?.status ?? 422, data: attempt2.data };
        }

        return { kind: 'error', status: 422, data: refreshFailureData };
    } catch (refreshErr: any) {
        console.error('[placeDuffelOrder] auto-refresh failed:', refreshErr.message);
        return { kind: 'error', status: 422, data: refreshFailureData };
    }
}
