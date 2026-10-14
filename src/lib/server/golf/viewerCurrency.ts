import { cookies } from 'next/headers';
import { convertCurrencyStrict, refreshExchangeRates } from '@/lib/currency';
import type { ChargeCurrency } from '@/lib/constants/currencies';
import { roundToCurrency } from '@/lib/pricing';
import type { GolfCourse } from '@/lib/schemas/golf';
import { VIEWER_CURRENCY_COOKIE, readViewerCurrency } from '@/lib/golf/currency';

/**
 * The currency a golf page prices in for this viewer (ADR-0051): the URL's `?currency=`, else the
 * cookie the site mirrors their currency selector into, else null (the course's own, or USD).
 * Only Charge Currencies get through; both sources are untrusted input.
 */
export async function viewerCurrency(param?: string | string[] | null): Promise<ChargeCurrency | null> {
    const jar = await cookies();
    return readViewerCurrency({ param, cookie: jar.get(VIEWER_CURRENCY_COOKIE)?.value ?? null });
}

/**
 * A course as a storefront page shows it to this viewer: its indicative "green fee from" in their
 * currency. The figure is only ever a guide (the quote at checkout is the price), so a conversion
 * that cannot be made leaves the course's own figure in its own currency rather than showing none.
 */
export async function courseInCurrency(course: GolfCourse, currency: string): Promise<GolfCourse> {
    if (course.greenFeeFrom == null || course.currency === currency) return course;
    try {
        await refreshExchangeRates();
        const amount = roundToCurrency(convertCurrencyStrict(course.greenFeeFrom, course.currency, currency), currency);
        return { ...course, greenFeeFrom: amount, currency };
    } catch {
        return course;
    }
}
