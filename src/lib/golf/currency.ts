import { isChargeCurrency, type ChargeCurrency } from '@/lib/constants/currencies';

/**
 * Which currency a golf price is shown and charged in (ADR-0051). Client-safe and pure, so a page,
 * the route behind it and the checkout agree on one answer.
 *
 * A golf price is always one of the Charge Currencies (KRW, USD, PHP). The viewer's choice comes
 * from the URL (a shared link names what it was shared in) and otherwise from the cookie the site
 * mirrors their currency selector into; anything that is not a Charge Currency is ignored, never
 * trusted.
 */

/** The cookie `CurrencyCookieSync` writes and golf pages read. */
export const VIEWER_CURRENCY_COOKIE = 'cg_currency';

const asChargeCurrency = (value: string | string[] | null | undefined): ChargeCurrency | null => {
    const first = Array.isArray(value) ? value[0] : value;
    if (!first) return null;
    const code = first.trim().toUpperCase();
    return isChargeCurrency(code) ? (code as ChargeCurrency) : null;
};

/** The viewer's own choice, or null when they have not made one (or made one we cannot charge). */
export function readViewerCurrency(
    { param, cookie }: { param?: string | string[] | null; cookie?: string | null },
): ChargeCurrency | null {
    return asChargeCurrency(param) ?? asChargeCurrency(cookie);
}

/** What a course is priced in, when that can be charged; USD otherwise. */
export function defaultChargeCurrency(courseCurrency: string): ChargeCurrency {
    return asChargeCurrency(courseCurrency) ?? 'USD';
}

/** The currency to quote in: the viewer's choice, or the course's default. */
export function chargeCurrencyFor(viewer: ChargeCurrency | null, courseCurrency: string): ChargeCurrency {
    return viewer ?? defaultChargeCurrency(courseCurrency);
}
