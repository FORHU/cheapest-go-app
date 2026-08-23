/**
 * Resilient Duffel order placement.
 *
 * Extracted from /api/flights/book (web) so the mobile booking route can share the
 * same retry behaviour instead of doing a single fragile attempt. Different airlines
 * behave very differently at order-creation time — some hang, some return
 * `offer_no_longer_available`, some `price_changed` — and a single attempt turns any
 * of those transient conditions into a hard failure. This helper:
 *
 *   1. Places the order with a per-attempt timeout (Duffel sometimes hangs).
 *   2. On `price_changed`, runs a live Price Action and retries (up to 2×).
 *   3. On `offer_no_longer_available`, rebuilds an offer_request, re-quotes a pool of
 *      fresh offers for the same carrier, and tries them in price order.
 *
 * It is provider-internal: callers pass an already-built set of Duffel order
 * passengers and the raw offer, and receive a normalised result they map to HTTP.
 *
 * NOTE: the web /api/flights/book route still has its own inline copy of this logic.
 * It should be migrated onto this helper in a follow-up (with sandbox QA) so the two
 * booking paths can't drift.
 */

import { cabinClassFromRawOffer } from './duffel-cabin';
import { findOrderFromTimedOutAttempt } from './duffel-order-reconcile';

const DUFFEL_ORDERS_URL = 'https://api.duffel.com/air/orders';
// Duffel's documented minimum: "You must set a HTTP client timeout of at least 130s".
// Order creation runs synchronously through to the airline, aborting does NOT cancel it —
// a shorter timeout orphans a real PNR without recording it.
const DEFAULT_ORDER_TIMEOUT_MS = 130_000;
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

                // Aborting does NOT cancel the booking at Duffel — the airline booking
                // proceeds regardless. Check whether this attempt actually landed before
                // reporting failure, which would invite the caller to retry and create a
                // second paid ticket for the same trip.
                const origin = rawOffer.slices?.[0]?.origin?.iata_code;
                const lastSlice = rawOffer.slices?.[rawOffer.slices.length - 1];
                const destination = lastSlice?.destination?.iata_code;
                const recovered = await findOrderFromTimedOutAttempt(duffelToken, {
                    sinceIso: attemptStartedAt,
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
                    console.warn(`[placeDuffelOrder] Timed-out attempt succeeded — adopting order ${recovered.orderId} (${recovered.pnr})`);
                    return {
                        isPriceChangedError: false,
                        isOfferUnavailable: false,
                        res: new Response(null, { status: 200 }),
                        data: { data: { id: recovered.orderId, booking_reference: recovered.pnr, documents: recovered.tickets.map((t: string) => ({ type: 'electronic_ticket', unique_identifier: t })) } },
                        finalTotal: currentTotal,
                        finalCurrency: currentCurrency,
                    };
                }

                const syntheticRes = new Response(null, { status: 504 });
                return {
                    isPriceChangedError: false,
                    isOfferUnavailable: false,
                    res: syntheticRes,
                    data: { errors: [{ code: 'timeout', message: 'Airline booking system timed out. Please try again.' }] },
                    finalTotal: currentTotal,
                    finalCurrency: currentCurrency,
                };
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

            const availableSvcs: any[] = pricedOffer.available_services ?? [];
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
                break;
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

    // ── Auto-refresh: the offer expired — re-quote fresh offers for the same carrier ──
    console.warn('[placeDuffelOrder] offer expired — rebuilding offer_request');
    try {
        const slices: any[] = (rawOffer.slices ?? []).map((sl: any) => {
            const origin = sl.origin?.iata_code ?? sl.segments?.[0]?.origin?.iata_code;
            const destination = sl.destination?.iata_code ?? sl.segments?.[sl.segments.length - 1]?.destination?.iata_code;
            const departure_date = sl.departure_date ?? sl.segments?.[0]?.departing_at?.slice(0, 10);
            return { origin, destination, departure_date };
        }).filter((s: any) => s.origin && s.destination && s.departure_date);

        if (slices.length === 0) return { kind: 'error', status: 422, data: attempt1.data };

        const paxTypes: any[] = (rawOffer.passengers ?? []).map((p: any) => ({ type: p.type ?? 'adult' }));
        const cabinClass: string = cabinClassFromRawOffer(rawOffer);

        const orRes = await fetch('https://api.duffel.com/air/offer_requests?return_offers=true', {
            method: 'POST',
            headers: getDuffelHeaders(crypto.randomUUID()),
            body: JSON.stringify({ data: { slices, passengers: paxTypes, cabin_class: cabinClass } }),
        });
        const orData = await orRes.json();
        if (!orRes.ok) return { kind: 'error', status: 422, data: attempt1.data };

        let offers: any[] = orData.data?.offers ?? [];
        if (offers.length === 0 && orData.data?.id) {
            const offersRes = await fetch(`https://api.duffel.com/air/offers?offer_request_id=${orData.data.id}&limit=50`, { headers: getDuffelHeaders(crypto.randomUUID()) });
            const offersData = await offersRes.json();
            offers = offersData.data ?? [];
        }
        if (offers.length === 0) return { kind: 'error', status: 422, data: attempt1.data };

        const targetCarrier = rawOffer.validating_carrier_iata_code
            ?? rawOffer.slices?.[0]?.segments?.[0]?.operating_carrier?.iata_code
            ?? rawOffer.slices?.[0]?.segments?.[0]?.marketing_carrier?.iata_code;
        const targetTotal = parseFloat(rawOffer.total_amount ?? '0');

        const matchingOffers = targetCarrier
            ? offers.filter((o: any) => {
                const carrier = o.validating_carrier_iata_code
                    ?? o.slices?.[0]?.segments?.[0]?.operating_carrier?.iata_code
                    ?? o.slices?.[0]?.segments?.[0]?.marketing_carrier?.iata_code;
                return carrier === targetCarrier;
            })
            : offers;

        const sortedPool = (matchingOffers.length > 0 ? matchingOffers : offers).sort((a: any, b: any) =>
            Math.abs(parseFloat(a.total_amount) - targetTotal) - Math.abs(parseFloat(b.total_amount) - targetTotal),
        );

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

        return { kind: 'error', status: 422, data: attempt1.data };
    } catch (refreshErr: any) {
        console.error('[placeDuffelOrder] auto-refresh failed:', refreshErr.message);
        return { kind: 'error', status: 422, data: attempt1.data };
    }
}
