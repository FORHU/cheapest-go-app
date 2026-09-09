/**
 * ─── Markup & Pricing Strategy ────────────────────────────────────────────────
 *
 * The markup recovers **Platform Cost** — Stripe's fees plus the supplier
 * platform's own fees — and nothing else. No margin is intended, and hosting,
 * monitoring and mapping are deliberately outside the set: they scale with the
 * product rather than with bookings, so recovering them through a fare would be
 * a margin under another name. See ADR-0036.
 *
 * ## Platform Cost is flat plus proportional, so the markup is too
 *
 * This file used to model Stripe alone. It did not know Duffel charged
 * anything. Duffel invoice INV07982 (Aug 2026) showed otherwise:
 *
 *     Paid Order        7 × $3.00              = $21.00   flat, per order
 *     Managed Content   1% × $5,812.44         = $58.12   proportional to fare
 *     Paid Ancillary    0 × $2.00              = $0.00    flat, per ancillary
 *     Excess Search     0 × $0.005             = $0.00    per search over allowance
 *
 * So a flight order costs 1% + $3.00 at Duffel and STRIPE_RATE + STRIPE_FLAT_FEE
 * at Stripe. Break-even on a base fare P is:
 *
 *     m = (0.039·P + 3.30) / (0.971·P)
 *
 * which converges to 4.017% as P → ∞ — above the 4% this file used to charge.
 * There was no ticket price at which the old rate was solvent. A single
 * percentage cannot fix that: it is too thin on cheap fares and too fat on
 * expensive ones, because the cost it recovers is not a single percentage.
 *
 * ## Cancellations are socialised, which is why the rate exceeds break-even
 *
 * A cancelled booking costs exactly what a completed one costs — Duffel billed
 * all seven August orders including the six that were cancelled, and Stripe
 * keeps its fee on a refund — but the refund returns the markup in full, so it
 * recovers nothing. Spreading that across everyone means solving
 *
 *     M = (3.30 + 0.039·P) / (0.971 − c)      c = cancellation rate
 *
 * The denominator has a pole at c = 0.971: past a 97.1% cancellation rate no
 * finite markup recovers anything. The curve is gentle at low c and violent at
 * high c, so this choice is only safe while c stays low — hence the true-up
 * rules in ADR-0036. Defaults below assume **c = 20%**, which is an assumption
 * awaiting real data, not a measurement.
 *
 * ## FLIGHTS — $4.40 + 7.2%, effective fee capped at 12%
 *
 * The cap bounds the checkout jump on cheap fares, where the flat component is
 * a large share of a small number. Two thresholds matter and they are not the
 * same fare: the cap **binds** below ~$90, where 7.2% + $4.40 first exceeds 12%
 * of the fare, but it only stops **covering cost** below ~$54. Between the two
 * it still recovers Platform Cost, just with less left over for the cancellation
 * buffer. Below $54 the shortfall grows towards the $3.45 flat break-even as the
 * fare tends to zero, and never exceeds it.
 *
 * The cap is 12% rather than 10% because what was agreed was a *fare threshold*,
 * not a percentage: at the old rates a 10% cap bound below $88. Measuring Stripe
 * at 4.4% would have pushed a 10% cap out to $153 — capping well inside
 * loss-making territory. 12% holds the threshold at ~$90.
 *
 *     $50   → fee $6.00  (capped; break-even would be $7.94)
 *     $100  → fee $11.60
 *     $300  → fee $26.00
 *     $830  → fee $64.16
 *
 * ## HOTELS — $0.40 + 5.9%
 *
 * There is no hotel equivalent of the Duffel invoice: the OTV monthly invoice
 * *is* the room cost on a credit line, already funded by the fare. TravelgateX
 * does charge a connection fee but the account is on the **Free** development
 * tier, which must change before go-live.
 *
 * Hotels were held at a flat 5% on the belief that it over-recovered by ~1.2
 * points and so carried a provision against that incoming fee. Measuring Stripe
 * at 4.4% removed the provision outright: 5% covers a hotel only if nobody ever
 * cancels, and a $300 stay netted $0.84. At c = 20% the requirement is
 * $0.40 + 5.82%, so hotels now carry a flat component too — small, and covering
 * Stripe's $0.30 rather than any supplier fee.
 *
 * **There is still no provision for TravelgateX.** When they quote the STD/SUP
 * schedule this rate rises again by whatever it is; nothing here absorbs it.
 *
 * ## Bundles
 *
 * Retired. Bundling swapped HOTEL_MARKUP for BUNDLE_MARKUP and nothing else,
 * so the advertised "saving" was funded from the hotel provision. A bundle is
 * still one Duffel order, one OTV booking and two Stripe charges — there is no
 * cost saving to pass on. See ADR-0036.
 *
 * ─── Changing rates ───────────────────────────────────────────────────────────
 *
 *   Override via environment variables (no code change needed):
 *     FLIGHT_MARKUP_PERCENTAGE=0.072   # 7.2%
 *     FLIGHT_MARKUP_FLAT_USD=4.40      # flat component, USD
 *     HOTEL_MARKUP_PERCENTAGE=0.059    # 5.9%
 *     HOTEL_MARKUP_FLAT_USD=0.40       # covers Stripe's $0.30, not a supplier fee
 *     MARKUP_CAP=0.12                  # max effective fee as a share of base
 *     STRIPE_RATE=0.044                # MEASURED, not Stripe's headline 2.9%
 *
 *   These are not independent. STRIPE_RATE is an input to all of them, and to
 *   HOTEL_FX_DISPLAY_TOLERANCE — changing it without recomputing the rest is how
 *   the model came to charge 4% against a 4.017% floor. The arithmetic is in this
 *   header; the monthly reconciliation checks the result.
 *
 *   Rates are clamped to [0, 0.50] and the flat component to [0, 50] USD, to
 *   stop a misconfiguration charging customers absurd prices.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Default rates (overridable via env) ─────────────────────────────────────

/**
 * How much a booking is marked up, in the two shapes Platform Cost actually
 * takes plus a ceiling on the result.
 *
 * `flat` is denominated in **USD** because that is how the costs it recovers are
 * quoted (Duffel's $3.00 order fee, Stripe's $0.30). It must therefore be
 * converted into the currency the base price is in before use — see the
 * `flatInBaseCurrency` argument to {@link applyMarkup}.
 */
export interface MarkupSpec {
    /** Proportional component, as a decimal (0.051 = 5.1%). */
    rate: number;
    /** Flat component per booking, in USD. */
    flat: number;
    /** Ceiling on the whole fee, as a share of the base price (0.10 = 10%). */
    cap: number;
}

/**
 * 5.1% + $4.30, capped at 10%.
 *
 * Recovers Duffel's 1% + $3.00 and Stripe's rate + flat fee, grossed up for
 * Stripe's cut of the markup itself and for an assumed 20% cancellation rate.
 * The cap binds below roughly $88 of base fare.
 */
export const FLIGHT_MARKUP_SPEC: MarkupSpec = {
    rate: parseMarkupEnv('FLIGHT_MARKUP_PERCENTAGE', 0.072),
    flat: parseFlatEnv('FLIGHT_MARKUP_FLAT_USD', 4.40),
    cap: parseMarkupEnv('MARKUP_CAP', 0.12),
};

/**
 * 5%, no flat component.
 *
 * Hotels have no per-booking supplier fee to recover — the OTV monthly invoice
 * is the room cost itself, and TravelgateX's connection fee is not yet billed.
 * ~1.2 points of this is an earmarked provision against that incoming fee
 * rather than margin; see the header and ADR-0036.
 */
export const HOTEL_MARKUP_SPEC: MarkupSpec = {
    rate: parseMarkupEnv('HOTEL_MARKUP_PERCENTAGE', 0.059),
    flat: parseFlatEnv('HOTEL_MARKUP_FLAT_USD', 0.40),
    cap: parseMarkupEnv('MARKUP_CAP', 0.12),
};

// Log effective rates once at module load so they appear in Vercel/server startup logs.
// Makes misconfiguration immediately visible without needing to trace a booking.
if (typeof process !== 'undefined') {
    console.log(
        `[pricing] Effective markup — ` +
        `flights: ${(FLIGHT_MARKUP_SPEC.rate * 100).toFixed(1)}% + $${FLIGHT_MARKUP_SPEC.flat.toFixed(2)} ` +
        `hotels: ${(HOTEL_MARKUP_SPEC.rate * 100).toFixed(1)}% + $${HOTEL_MARKUP_SPEC.flat.toFixed(2)} ` +
        `cap: ${(FLIGHT_MARKUP_SPEC.cap * 100).toFixed(0)}%`
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
 * Kept tight in production on purpose: markup is sized to recover Platform Cost
 * and nothing more (see the header of this file), so an increase absorbed
 * silently is a direct loss rather than a smaller margin.
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
 * Chosen against the margin, not picked for roundness — and it moved when the
 * margin did. At 5% and an assumed 2.9% Stripe rate, a $300 hotel left ~1.77% of
 * the charge, and 0.5% consumed 28% of that. Measuring Stripe at 4.4% cut the
 * real buffer to 0.27%, which put the old 0.5% tolerance *above the entire
 * margin*: a gap inside tolerance, silently absorbed by design, made the booking
 * a loss.
 *
 * Raising the hotel rate to $0.40 + 5.9% restores the buffer to ~1.19% of the
 * charge. 0.3% keeps the same 28% share of it that the original design intended,
 * while staying wide enough that ordinary intra-hour rate movement never
 * interrupts a checkout.
 *
 * This number is a function of STRIPE_RATE and the hotel rate. Change either and
 * recompute it; do not carry it over.
 */
export const HOTEL_FX_DISPLAY_TOLERANCE = 0.003; // 0.3%

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

/**
 * Stripe percentage fee per transaction.
 *
 * **4.4%, measured — not Stripe's headline 2.9%.** Every live charge on this
 * account settles at exactly 2.9% + 1.5% + $0.30: the base rate plus the
 * international-card surcharge, because the Stripe account is US-registered and
 * the customers are not. Read off `balance_transaction` on 2026-09-08 — six live
 * charges, all Philippine cards, every one landing on 4.40% to the cent.
 *
 * Six is enough because the fee is a **deterministic tier, not a distribution**.
 * One charge establishes the rate; a larger sample would add the *mix* of tiers
 * across markets, not precision within one.
 *
 * The 1.5 points this was understated by are worth more than the whole Duffel
 * gap that prompted rebuilding this file — and unlike the flat component, the
 * error is proportional, so it cost most on the largest bookings.
 *
 * ## What changes this next
 *
 * A KRW charge is international *and* converted, so it attracts a further 1% —
 * around 5.4%. AirangGo is Korea-locked, so its launch moves this number.
 * **Re-run `node scratch/stripe-fees.mjs` and read the KR tier before AirangGo
 * takes live bookings**, rather than learning it from a month of under-recovery.
 * It is not pre-emptively set to 5.4%, because that would over-recover a full
 * point on every Philippine booking — margin under another name.
 *
 * Failing that, the monthly reconciliation notifies on drift beyond half a
 * point; see `src/lib/server/admin/platform-cost.ts`.
 */
export const STRIPE_RATE = parseMarkupEnv('STRIPE_RATE', 0.044);

/** Stripe flat fee per transaction in major currency units (USD $0.30, GBP £0.20, etc.) */
export const STRIPE_FLAT_FEE = parseFlatEnv('STRIPE_FLAT_FEE', 0.30);

// ── Core functions ───────────────────────────────────────────────────────────

/**
 * Apply a markup to a base price: a proportional part, a flat part, and a cap
 * on the total.
 *
 * The flat component of a {@link MarkupSpec} is in USD, because the costs it
 * recovers are quoted in USD. `basePrice` is whatever currency the caller is
 * working in — the supplier's, for flights, since markup is applied before the
 * charge-currency conversion. So a caller working in anything but USD **must**
 * pass `flatInBaseCurrency`, converted at the booking's Locked Rate per
 * ADR-0008. Defaulting it to the raw USD figure is correct only when the base
 * price is already USD.
 *
 * `markupRate` on the way out is the **effective** rate — markup over base,
 * after the flat component and the cap. That is what belongs in `markup_pct`,
 * because it is the only rate consistent with the amounts stored beside it.
 *
 * @param basePrice          - Raw provider price (what we pay the supplier)
 * @param spec               - Rate, flat component and cap
 * @param flatInBaseCurrency - `spec.flat` converted into `basePrice`'s currency
 *
 * @example
 *   applyMarkup(500, FLIGHT_MARKUP_SPEC);
 *   // originalPrice: 500, markupAmount: 29.80, chargedPrice: 529.80, markupRate: 0.0596
 *
 *   applyMarkup(50, FLIGHT_MARKUP_SPEC);
 *   // capped: true — 5.1% + $4.30 is $6.85, above the 10% ceiling of $5.00
 */
export function applyMarkup(
    basePrice: number,
    spec: MarkupSpec,
    flatInBaseCurrency: number = spec.flat,
): {
    originalPrice: number;
    chargedPrice: number;
    markupAmount: number;
    markupRate: number;
    markupFlat: number;
    capped: boolean;
} {
    const originalPrice = round2(basePrice);

    // A zero or negative base has no proportional part and nothing to cap
    // against, so charging a flat fee on it would be unbounded as a rate.
    if (!(originalPrice > 0)) {
        return {
            originalPrice,
            chargedPrice: originalPrice,
            markupAmount: 0,
            markupRate: 0,
            markupFlat: 0,
            capped: false,
        };
    }

    const flat = Math.max(0, flatInBaseCurrency);
    const uncapped = originalPrice * spec.rate + flat;
    const ceiling = originalPrice * spec.cap;
    const capped = uncapped > ceiling;

    const markupAmount = round2(capped ? ceiling : uncapped);
    const chargedPrice = round2(originalPrice + markupAmount);

    return {
        originalPrice,
        chargedPrice,
        markupAmount,
        markupRate: Math.round((markupAmount / originalPrice) * 10000) / 10000,
        markupFlat: round2(flat),
        capped,
    };
}

/**
 * The saving a traveller receives by bundling a hotel with a flight.
 *
 * Always zero, and kept as a function rather than deleted so the call site
 * stays honest about there being nothing to advertise.
 *
 * There was never a discount line in the payment flow: bundling swapped
 * HOTEL_MARKUP for BUNDLE_MARKUP in create-payment and nothing else, so the
 * "saving" was the gap between two multipliers. That gap was funded out of the
 * hotel rate — which is now an earmarked provision against TravelgateX's
 * incoming connection fee, so spending it on a discount spends money that is
 * already committed.
 *
 * There is also no cost saving to pass on. A bundle is one Duffel order, one
 * OTV booking and *two* Stripe charges; the only real saving available is the
 * $0.30 of a merged PaymentIntent, which is far too small to advertise. See
 * ADR-0036.
 *
 * @returns 0 — callers should render no savings banner.
 */
export function bundleSavingPercent(): number {
    return 0;
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
 * Read a Stripe amount back into major currency units. The inverse of
 * {@link toStripeAmount}, and the only correct way to interpret `pi.amount`,
 * `refund.amount`, `balance.available[].amount` or any other Stripe integer.
 *
 * This exists because it did not. `toStripeAmount` was always used to *send*
 * money, but every read-back hardcoded `amount / 100` — in fourteen places,
 * including the refund quote shown to a customer before they cancel. For a
 * two-decimal currency that is right by accident; for a zero-decimal one it is
 * out by a factor of a hundred. A ₩1,200,000 booking quoted a ₩12,000 refund.
 *
 * KRW is a **Charge Currency** and AirangGo is Korea-locked, so this is not a
 * theoretical currency — it is a primary market.
 *
 * @param amount   - Stripe's integer amount, in the smallest currency unit
 * @param currency - ISO 4217 currency code (case-insensitive)
 * @returns        - Price in major currency units
 */
export function fromStripeAmount(amount: number, currency: string): number {
    return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
        ? amount
        : round2(amount / 100);
}

/**
 * What is left of the markup after Stripe, for a hypothetical booking.
 *
 * Useful for finance reporting — not used in the payment flow itself. Note that
 * a positive result is not profit: the supplier platform's own fees (Duffel's
 * $3.00 + 1%) arrive on a monthly invoice and are not visible on any single
 * booking, so this figure is what is available to pay them with, not what is
 * kept. See the header and ADR-0036.
 *
 * @param basePrice - Raw provider fare
 * @param spec      - The markup applied
 * @returns         - Markup remaining after Stripe's cut
 */
export function estimateNetProfit(basePrice: number, spec: MarkupSpec): number {
    const { chargedPrice, markupAmount } = applyMarkup(basePrice, spec);
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
 *
 * ## Why this no longer falls back to the configured rate
 *
 * It used to recover a missing supplier cost as `totalAmount / (1 + markupRate)`,
 * taking `markupRate` from FLIGHT_MARKUP / HOTEL_MARKUP when the booking had no
 * stored rate. That inverse has no term for a flat component, so from the moment
 * flights gained one it would have been wrong — and because this is the *fallback*
 * path for bookings with missing financial data, it would have quietly produced
 * plausible, incorrect margins in admin revenue reporting rather than failing.
 *
 * So the estimate now runs only from a rate the booking itself recorded
 * (`markup_pct`), which is correct for every booking taken while markup was
 * purely proportional, and is exactly what a post-flat-fee booking stores as its
 * *effective* rate. Where no such rate exists, the booking is reported with a
 * zero markup and `isEstimated: true` rather than a guess: a visibly missing
 * figure gets investigated, an invented one gets banked.
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
    // Only the booking's own recorded rate can be inverted. A configured default
    // cannot: it may carry a flat component this formula has no term for, and the
    // rate in force today is not the rate this booking was sold at.
    const markupRate = booking.markup_pct ?? 0;

    let supplierCost = booking.supplierCost;
    let markupAmount = booking.markupAmount;
    let isEstimated = false;

    if (supplierCost === 0 || supplierCost === booking.totalAmount) {
        if (markupRate > 0) {
            // supplierCost = totalPrice / (1 + rate)
            supplierCost = round2(booking.totalAmount / (1 + markupRate));
            markupAmount = round2(booking.totalAmount - supplierCost);
        } else {
            // Nothing recorded and nothing to infer from. Report the gap rather
            // than inventing a margin that finance would go on to bank.
            supplierCost = round2(booking.totalAmount);
            markupAmount = 0;
        }
        isEstimated = true;
    } else if (markupAmount === 0 && supplierCost < booking.totalAmount) {
        markupAmount = round2(booking.totalAmount - supplierCost);
    }

    const stripeFee = calculateStripeFee(booking.totalAmount);
    const netProfit = round2(markupAmount - stripeFee);

    // The rate this booking actually carried, read off its own amounts rather
    // than off a configured constant. Displaying the configured rate — as this
    // used to — showed today's number against a booking sold at a different one,
    // and would now put "5.1%" beside every 4% booking taken before the change.
    // Falls back to the recorded rate only when there is no supplier cost to
    // divide by, which is the same case that sets isEstimated.
    const effectiveRate = supplierCost > 0 ? markupAmount / supplierCost : markupRate;

    return {
        ...booking,
        supplierCost,
        markupAmount,
        profit: netProfit,
        markupPercentage: Number((effectiveRate * 100).toFixed(2)),
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

/**
 * Read a flat markup component (USD) from an environment variable.
 *
 * Clamped to [0, 50] for the same reason the rate is clamped to [0, 0.50]: a
 * stray decimal point in a deployment's env should not charge a traveller
 * hundreds of dollars in fees on a cheap fare.
 */
function parseFlatEnv(key: string, defaultValue: number): number {
    const raw = process.env[key];
    if (!raw) return defaultValue;
    const parsed = parseFloat(raw);
    if (isNaN(parsed)) return defaultValue;
    return Math.max(0, Math.min(50, parsed));
}
