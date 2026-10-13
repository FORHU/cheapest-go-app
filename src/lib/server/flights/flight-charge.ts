import { applyMarkup, toStripeAmount, FLIGHT_MARKUP_SPEC } from '@/lib/pricing';
import { convertCurrencyStrict } from '@/lib/currency';

export interface FlightCharge {
    /** The supplier amount before markup, in `baseCurrency`. */
    originalPrice: number;
    markupRate: number;
    markupAmount: number;
    capped: boolean;
    /** What the traveller pays, in `chargeCurrency` major units. */
    chargePrice: number;
    /** `chargePrice` in the currency's minor units, as Stripe wants it. */
    stripeAmount: number;
}

/**
 * The charge for a Duffel fare: markup on the supplier total, then conversion into the traveller's
 * charge currency.
 *
 * This is the arithmetic /book applies to an order's locked total, lifted out so that the amount a
 * card is authorised for and the amount captured after the order is bought cannot disagree.
 * Keep it in lockstep with /book until the order-first path is deleted.
 *
 * The flat component of the markup is USD-denominated (it recovers Duffel's order fee and
 * Stripe's fixed fee), so it is converted into the supplier currency first. When that conversion
 * has no rate it is dropped rather than failing: under-recovering one booking's flat fee is
 * cheaper than refusing the booking. The final conversion into the charge currency throws,
 * because charging a number in the wrong unit is worse than not charging.
 */
export function quoteFlightCharge({ baseTotal, baseCurrency, chargeCurrency }: {
    baseTotal: number;
    baseCurrency: string;
    chargeCurrency: string;
}): FlightCharge {
    const base = baseCurrency.toLowerCase();
    const charge = chargeCurrency.toLowerCase();

    let flatInBase = FLIGHT_MARKUP_SPEC.flat;
    try {
        flatInBase = convertCurrencyStrict(FLIGHT_MARKUP_SPEC.flat, 'usd', base);
    } catch {
        flatInBase = 0;
    }

    const pricing = applyMarkup(baseTotal, FLIGHT_MARKUP_SPEC, flatInBase);
    const chargePrice = charge !== base
        ? Math.round(convertCurrencyStrict(pricing.chargedPrice, base, charge.toUpperCase()) * 100) / 100
        : pricing.chargedPrice;

    return {
        originalPrice: pricing.originalPrice,
        markupRate: pricing.markupRate,
        markupAmount: pricing.markupAmount,
        capped: pricing.capped,
        chargePrice,
        stripeAmount: toStripeAmount(chargePrice, charge),
    };
}
