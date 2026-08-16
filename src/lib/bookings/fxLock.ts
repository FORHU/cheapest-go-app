/**
 * Capture the exchange rate a booking was taken at.
 *
 * See docs/adr/0008-fx-locked-at-booking-in-usd.md. Revenue is reported in USD at the
 * rate in force when the payment was taken, so every booking row carries the dollar
 * amount, the rate used, and when that rate was read. The rate is evidence — it is
 * written once and never recalculated.
 *
 * This runs *after* Stripe has taken the money, so it must never throw and must never
 * block a write. If no rate can be obtained the booking is still recorded, with the FX
 * fields left null; `get_revenue_stats` counts those in `unconvertedCount` and
 * `scripts/backfill-booking-fx.mjs` fills them in later.
 */

import { EXCHANGE_RATES, refreshExchangeRates } from '@/lib/currency';

export interface FxLock {
    /** The amount restated into USD. Null when no rate was available. */
    usd_amount: number | null;
    /** USD per 1 unit of the booking's currency. */
    fx_rate: number | null;
    fx_captured_at: string | null;
    /** 'identity' (already USD), 'live', or null when unresolved. */
    fx_source: string | null;
}

const EMPTY: FxLock = { usd_amount: null, fx_rate: null, fx_captured_at: null, fx_source: null };

/**
 * @param amount   Gross charged to the customer, in `currency`.
 * @param currency The booking's Charge Currency (ISO 4217).
 */
export async function lockFx(amount: number | null | undefined, currency: string | null | undefined): Promise<FxLock> {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || !currency) return EMPTY;

    const ccy = String(currency).toUpperCase();
    const now = new Date().toISOString();

    // A USD booking needs no rate and no provider call.
    if (ccy === 'USD') {
        return { usd_amount: amount, fx_rate: 1, fx_captured_at: now, fx_source: 'identity' };
    }

    try {
        await refreshExchangeRates();
        const rate = EXCHANGE_RATES[ccy];
        if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
            console.warn(`[fxLock] No rate for ${ccy} — booking recorded unconverted, backfill will resolve it.`);
            return EMPTY;
        }
        return {
            usd_amount: amount * rate,
            fx_rate: rate,
            fx_captured_at: now,
            fx_source: 'live',
        };
    } catch (err) {
        // Money has already moved; never let this fail the write.
        console.error('[fxLock] Rate capture failed — booking recorded unconverted:', err);
        return EMPTY;
    }
}
