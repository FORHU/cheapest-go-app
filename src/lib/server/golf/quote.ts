import { golfServiceFee } from '@/lib/pricing';
import { convertCurrencyStrict, refreshExchangeRates } from '@/lib/currency';

/**
 * The all-in price of a Golf Booking (CONTEXT.md, "All-in price"): green fee and extras plus the
 * service fee. Checkout and search both come through here, so the price a customer is shown in
 * the results is the amount their card is authorised for.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface GolfQuote {
    /** Green fee + extras, before the service fee. */
    base: number;
    serviceFee: number;
    total: number;
    /** The service fee's rate, recorded on the PaymentIntent. */
    markupRate: number;
}

/** Throws when `currency` has no exchange rate: never quote a price we cannot charge. */
export async function quoteGolf(
    { greenFeeTotal, extrasTotal = 0, currency }: { greenFeeTotal: number; extrasTotal?: number; currency: string },
): Promise<GolfQuote> {
    const base = round2(greenFeeTotal + extrasTotal);
    if (currency !== 'USD') await refreshExchangeRates();
    const fee = golfServiceFee(base, currency, convertCurrencyStrict);
    const total = round2(fee.chargedTotal);
    return { base, serviceFee: round2(total - base), total, markupRate: fee.markupRate };
}
