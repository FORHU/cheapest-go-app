/**
 * ─── Markup & Pricing Strategy ────────────────────────────────────────────────
 *
 * CheapestGo's markup is set to break even on Stripe processing fees only.
 * Goal: collect exactly enough to cover Stripe (2.9% + $0.30 per transaction)
 * with a small buffer for refunds and disputes. No profit margin is intended.
 *
 * Stripe account: US-registered, USD default (confirmed 2026-07-21).
 * Stripe fee formula: chargedPrice × 0.029 + $0.30
 *
 * ## Break-even math
 *
 *   Break-even markup = (0.029 × basePrice + 0.30) / (0.971 × basePrice)
 *                     ≈ 3.0% for any ticket above ~$100
 *
 *   We use 3.5% for flights and 5% for hotels to add a buffer for:
 *     - Stripe refund fee (Stripe keeps the processing fee on refunds)
 *     - Stripe dispute fee ($15 per chargeback)
 *     - Stripe Radar fee ($0.05 per screened transaction if enabled)
 *
 * FLIGHTS — 4% markup
 *   Raised from 3.5% because sub-$60 routes are common (Korean/SEA market) and
 *   the Stripe $0.30 flat fee makes 3.5% go negative below ~$57.
 *   At 4%, net after Stripe fees is approximately:
 *     $50  flight → $52.00 charged → ~$0.19 buffer
 *     $100 flight → $104.00 charged → ~$0.71 buffer
 *     $300 flight → $312.00 charged → ~$2.75 buffer
 *     $500 flight → $520.00 charged → ~$4.62 buffer
 *
 * HOTELS — 5% markup
 *   Higher buffer to absorb the greater refund risk on multi-night stays.
 *   At 5%, net after Stripe fees is approximately:
 *     $300 hotel → $315.00 charged → ~$5.57 buffer
 *     $600 hotel → $630.00 charged → ~$11.43 buffer
 *
 * ## How it works technically
 *
 *   1. Provider prices the fare at e.g. $300 (original cost).
 *   2. We multiply by (1 + MARKUP_RATE) to get the customer price ($315).
 *   3. Stripe charges the customer $315.
 *   4. We pay the provider $300 from our Duffel balance / supplier account.
 *   5. We keep the $15 difference, minus Stripe's ~$9.44 fee = ~$5.57 buffer.
 *
 *   Both the original price and the charged price are stored in the DB so
 *   finance reporting always has an accurate margin view.
 *
 * ## Future: Bundles (flight + hotel)
 *   Blended rate of 4% — between the flight and hotel rates.
 *
 * ─── Changing rates ───────────────────────────────────────────────────────────
 *
 *   Override via environment variables (no code change needed):
 *     FLIGHT_MARKUP_PERCENTAGE=0.035   # 3.5%
 *     HOTEL_MARKUP_PERCENTAGE=0.05     # 5%
 *     BUNDLE_MARKUP_PERCENTAGE=0.04    # 4% — not yet active
 *
 *   Rates are clamped between 0 and 0.50 (50%) to prevent misconfiguration
 *   from charging customers absurd prices.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Default rates (overridable via env) ─────────────────────────────────────

/** 4% — covers Stripe fees (2.9% + $0.30) including sub-$60 routes (Korean market) */
export const FLIGHT_MARKUP = parseMarkupEnv('FLIGHT_MARKUP_PERCENTAGE', 0.04);

/** 5% — covers Stripe fees with a larger buffer for multi-night refund risk */
export const HOTEL_MARKUP = parseMarkupEnv('HOTEL_MARKUP_PERCENTAGE', 0.05);

/** 4% — blended rate for flight + hotel bundles; not yet active */
export const BUNDLE_MARKUP = parseMarkupEnv('BUNDLE_MARKUP_PERCENTAGE', 0.04);

// Log effective rates once at module load so they appear in Vercel/server startup logs.
// Makes misconfiguration immediately visible without needing to trace a booking.
if (typeof process !== 'undefined') {
    console.log(
        `[pricing] Effective markup rates — ` +
        `flights: ${(FLIGHT_MARKUP * 100).toFixed(1)}% ` +
        `hotels: ${(HOTEL_MARKUP * 100).toFixed(1)}% ` +
        `bundles: ${(BUNDLE_MARKUP * 100).toFixed(1)}%`
    );
}

// ── Flight price-change tolerance ────────────────────────────────────────────

/**
 * How far a fare may drift before we stop and ask the traveller to confirm.
 *
 * This MUST be a single value shared by every gate that can raise a
 * `price_changed` prompt — currently /api/internal/revalidate-flight (checked
 * when the booking starts) and /api/flights/book (checked again at order time).
 * When the two gates disagreed, a fare that drifted between the looser and the
 * stricter threshold sailed past the first check and was rejected by the
 * second, so the traveller was asked about a change the app had just decided
 * was immaterial. That is what made prices look like they changed constantly.
 *
 * Kept tight in production on purpose: markup is set to break even on Stripe
 * fees only (see the header of this file), so an increase absorbed silently is
 * a direct loss rather than a smaller margin.
 */
export const FLIGHT_PRICE_TOLERANCE_LIVE = 0.50;

/**
 * Duffel's test environment returns noisy, rapidly-moving prices that do not
 * reflect real fare behaviour, so a tight threshold there produces a confirm
 * prompt on nearly every attempt.
 */
export const FLIGHT_PRICE_TOLERANCE_SANDBOX = 10.00;

/**
 * How long a persisted hotel prebook quote stays chargeable.
 *
 * TGX option tokens expire quickly — prebook already re-searches because search
 * tokens go stale — so this is deliberately short. Past it, create-payment
 * rejects the prebookId and the user re-quotes rather than being charged against
 * a rate the supplier will no longer honour at Book time.
 */
export const PREBOOK_QUOTE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * How far the client's displayed hotel total may differ from the server's own
 * conversion of the supplier quote before checkout stops and re-confirms.
 *
 * The customer is never billed more than the figure they were shown. Within this
 * band the server honours the displayed price and absorbs the difference; beyond
 * it, checkout returns the updated total for the customer to approve.
 *
 * 0.5% is chosen against the margin, not picked for roundness. Markup is sized to
 * break even on Stripe fees, which leaves roughly 1.77% of the charge on a $300
 * hotel — so absorbing a 2% gap would turn the booking into a loss. Half a percent
 * stays comfortably inside the buffer while being wide enough that ordinary
 * intra-hour rate movement never interrupts a checkout.
 */
export const HOTEL_FX_DISPLAY_TOLERANCE = 0.005; // 0.5%

/**
 * Effective tolerance for the current environment.
 *
 * Compare **base fares** with this, never a total that includes seats or bags:
 * the revalidation gate can only see the bare fare, so a total-vs-base
 * comparison would read the ancillary cost as a price increase and reject a
 * price the traveller had already confirmed.
 */
export function getFlightPriceTolerance(): number {
    // Explicit override, so a sandbox run can rehearse live behaviour.
    //
    // The default sandbox threshold is 20× looser than production, which means a
    // fare drifting by, say, $2 books cleanly in testing and is rejected with
    // `price_changed` against real airlines. Set FLIGHT_PRICE_TOLERANCE=0.5 when
    // you want a local booking to be a faithful rehearsal of a live one.
    // Guard the empty string explicitly: Number('') is 0, so a declared-but-blank
    // FLIGHT_PRICE_TOLERANCE= would otherwise set the tolerance to zero and
    // reject every fare that moved by a cent.
    const rawOverride = process.env.FLIGHT_PRICE_TOLERANCE?.trim();
    if (rawOverride) {
        const override = Number(rawOverride);
        if (Number.isFinite(override) && override >= 0) return override;
    }

    // The env var is DUFFEL_ACCESS_TOKEN; `env.DUFFEL_TOKEN` is an alias for it.
    // Read the real name (and the alias, in case a deployment sets that instead)
    // rather than importing @/utils/env, which would make this module depend on
    // env validation it does not otherwise need.
    const token = process.env.DUFFEL_ACCESS_TOKEN ?? process.env.DUFFEL_TOKEN ?? '';
    return token.startsWith('duffel_test_')
        ? FLIGHT_PRICE_TOLERANCE_SANDBOX
        : FLIGHT_PRICE_TOLERANCE_LIVE;
}

// ── Stripe fee constants ─────────────────────────────────────────────────────

/** Stripe percentage fee per transaction (2.9%) */
export const STRIPE_RATE = 0.029;

/** Stripe flat fee per transaction in major currency units (USD $0.30, GBP £0.20, etc.) */
export const STRIPE_FLAT_FEE = 0.30;

// ── Core functions ───────────────────────────────────────────────────────────

/**
 * Apply a markup rate to a base price.
 *
 * @param basePrice  - Raw provider fare (what we pay the supplier)
 * @param markupRate - Decimal markup (e.g. 0.08 for 8%)
 * @returns          - Object with both the original and marked-up price
 *
 * @example
 *   const { originalPrice, chargedPrice, markupAmount } = applyMarkup(500, FLIGHT_MARKUP);
 *   // originalPrice: 500, chargedPrice: 540, markupAmount: 40
 */
export function applyMarkup(basePrice: number, markupRate: number): {
    originalPrice: number;
    chargedPrice: number;
    markupAmount: number;
    markupRate: number;
} {
    const chargedPrice = round2(basePrice * (1 + markupRate));
    return {
        originalPrice: round2(basePrice),
        chargedPrice,
        markupAmount: round2(chargedPrice - basePrice),
        markupRate,
    };
}

/**
 * The saving a traveller actually receives by bundling a hotel with a flight,
 * as a percentage of the standalone price.
 *
 * There is no discount line anywhere in the payment flow — bundling simply
 * swaps HOTEL_MARKUP for BUNDLE_MARKUP in create-payment, so the "discount" is
 * the gap between the two multipliers and nothing else:
 *
 *   saving = 1 − (1 + BUNDLE_MARKUP) / (1 + HOTEL_MARKUP)
 *
 * Derive it rather than hardcoding a figure in the UI. The banner previously
 * advertised a fixed 3% while the rates gave ~1%, and the claim silently
 * drifts every time the markup env vars are retuned.
 *
 * Server-only: the markup rates come from non-public env vars, so a client
 * component reading this would silently fall back to the defaults. Compute it
 * in a server component and pass the number down.
 *
 * @returns Percentage points (e.g. 0.9 for a 0.9% saving), floored to one
 *          decimal — rounding up would advertise a saving we don't give.
 */
export function bundleSavingPercent(): number {
    const saving = (1 - (1 + BUNDLE_MARKUP) / (1 + HOTEL_MARKUP)) * 100;
    if (!Number.isFinite(saving) || saving <= 0) return 0;
    return Math.floor(saving * 10) / 10;
}

/**
 * Convert a price to the integer amount Stripe expects.
 *
 * Stripe uses the smallest currency unit (cents for USD/EUR/GBP, etc.).
 * Zero-decimal currencies (JPY, KRW, etc.) are passed as-is.
 *
 * @param price    - Price in major currency units (e.g. 540.00 USD)
 * @param currency - ISO 4217 currency code (case-insensitive)
 * @returns        - Integer amount for Stripe `amount` field
 */
export function toStripeAmount(price: number, currency: string): number {
    return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
        ? Math.round(price)
        : Math.round(price * 100);
}

/**
 * Estimate net profit after applying markup and deducting Stripe fees.
 * Useful for finance reporting — not used in the payment flow itself.
 *
 * @param basePrice  - Raw provider fare
 * @param markupRate - Decimal markup applied
 * @returns          - Approximate net profit after Stripe fees
 */
export function estimateNetProfit(basePrice: number, markupRate: number): number {
    const { chargedPrice, markupAmount } = applyMarkup(basePrice, markupRate);
    const stripeFee = calculateStripeFee(chargedPrice);
    return round2(markupAmount - stripeFee);
}

/**
 * Calculate Stripe fees for a given charged price.
 *
 * @param chargedPrice - Amount the customer actually paid
 * @returns - Stripe fee amount
 */
export function calculateStripeFee(chargedPrice: number): number {
    return round2(chargedPrice * STRIPE_RATE + STRIPE_FLAT_FEE);
}

/**
 * Enriches a booking object with financial details (markup, supplier cost, net profit).
 * Uses estimated formulas if data is missing from the database.
 * 
 * Formulas:
 * - Standard (Flight): totalPrice / 1.04  (4% markup)
 * - Standard (Hotel):  totalPrice / 1.05  (5% markup)
 * - Bundle:           totalPrice / 1.04   (4% markup)
 */
export function enrichBookingFinances<T extends { 
    type: string; 
    totalAmount: number; 
    supplierCost: number; 
    markupAmount: number; 
    profit: number;
    markup_pct?: number;
}>(booking: T): T & { 
    markupPercentage: number; 
    stripeFee: number;
    isEstimated: boolean;
} {
    let markupRate = HOTEL_MARKUP; // default
    if (booking.type === 'flight') markupRate = FLIGHT_MARKUP;
    if (booking.type === 'bundle' || booking.type === 'hotel_bundle') markupRate = BUNDLE_MARKUP;

    // Use stored markup percentage if available
    if (booking.markup_pct) {
        markupRate = booking.markup_pct;
    }

    let supplierCost = booking.supplierCost;
    let markupAmount = booking.markupAmount;
    let isEstimated = false;

    // Fallback logic for missing financial data
    if (supplierCost === 0 || supplierCost === booking.totalAmount) {
        // supplierCost = totalPrice / (1 + rate)
        supplierCost = round2(booking.totalAmount / (1 + markupRate));
        markupAmount = round2(booking.totalAmount - supplierCost);
        isEstimated = true;
    } else if (markupAmount === 0 && supplierCost < booking.totalAmount) {
        markupAmount = round2(booking.totalAmount - supplierCost);
    }

    const stripeFee = calculateStripeFee(booking.totalAmount);
    const netProfit = round2(markupAmount - stripeFee);

    return {
        ...booking,
        supplierCost,
        markupAmount,
        profit: netProfit,
        markupPercentage: Number((markupRate * 100).toFixed(2)),
        stripeFee,
        isEstimated
    };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Currencies where Stripe expects the amount in whole units (no cents) */
const ZERO_DECIMAL_CURRENCIES = new Set([
    'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
    'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/**
 * Read a markup rate from an environment variable.
 * Clamps to [0, 0.50] to prevent misconfiguration from overcharging customers.
 */
function parseMarkupEnv(key: string, defaultValue: number): number {
    const raw = process.env[key];
    if (!raw) return defaultValue;
    const parsed = parseFloat(raw);
    if (isNaN(parsed)) return defaultValue;
    return Math.max(0, Math.min(0.50, parsed));
}
