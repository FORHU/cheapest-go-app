import { golfServiceFee, roundToCurrency } from '@/lib/pricing';
import { convertCurrencyStrict, refreshExchangeRates } from '@/lib/currency';

/**
 * The all-in price of a Golf Booking (CONTEXT.md, "All-in price"): green fee and extras plus the
 * service fee. Checkout and search both come through here, so the price a customer is shown in
 * the results is the amount their card is authorised for.
 *
 * A course prices in its own currency (the Supplier Currency); the customer is charged in a
 * Charge Currency of their choosing (ADR-0051). Each component is converted on its own and the
 * service fee is then put on the converted base, as `create-payment` does for hotels, so every
 * line in the charge currency adds up to its total exactly.
 */

export interface GolfQuote {
    /** The currency the customer is charged in. */
    currency: string;
    /** Charge currency per 1 unit of the course's currency; recorded on the booking as evidence. */
    rate: number;
    greenFee: number;
    /** Each extra's line, converted on its own, in the order given. */
    extraLines: number[];
    extras: number;
    /** Green fee + extras, before the service fee. */
    base: number;
    serviceFee: number;
    total: number;
    /** The service fee's rate, recorded on the PaymentIntent. */
    markupRate: number;
}

/**
 * Throws when either currency has no exchange rate, or rates are too old to charge on: never
 * quote a price we cannot charge.
 *
 * `currency` is the course's, `chargeCurrency` the customer's (defaulting to the course's, which
 * is the price as it was before customers could choose).
 */
export async function quoteGolf(
    { greenFeeTotal, extraLines = [], currency, chargeCurrency = currency }:
    { greenFeeTotal: number; extraLines?: number[]; currency: string; chargeCurrency?: string },
): Promise<GolfQuote> {
    const course = currency.trim().toUpperCase();
    const charge = chargeCurrency.trim().toUpperCase();
    if (course !== 'USD' || charge !== 'USD') await refreshExchangeRates();

    const convert = (amount: number) =>
        roundToCurrency(course === charge ? amount : convertCurrencyStrict(amount, course, charge), charge);

    const greenFee = convert(greenFeeTotal);
    const lines = extraLines.map(convert);
    const extras = roundToCurrency(lines.reduce((sum, line) => sum + line, 0), charge);
    const base = roundToCurrency(greenFee + extras, charge);

    const fee = golfServiceFee(base, charge, convertCurrencyStrict);
    const total = roundToCurrency(fee.chargedTotal, charge);
    return {
        currency: charge,
        rate: course === charge ? 1 : convertCurrencyStrict(1, course, charge),
        greenFee,
        extraLines: lines,
        extras,
        base,
        serviceFee: roundToCurrency(total - base, charge),
        total,
        markupRate: fee.markupRate,
    };
}
