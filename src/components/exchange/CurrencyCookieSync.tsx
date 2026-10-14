'use client';

import { useEffect } from 'react';
import { isChargeCurrency } from '@/lib/constants/currencies';
import { VIEWER_CURRENCY_COOKIE } from '@/lib/golf/currency';
import { useUserCurrency } from '@/stores/searchStore';

const YEAR = 60 * 60 * 24 * 365;

/**
 * Mirrors the viewer's selected currency into a cookie, so a server-rendered page can price in it
 * (ADR-0051). The selector, geo detection and checkout's card-country switch all write the store;
 * this is the one place that carries the result to the server, so none of them has to know.
 *
 * A preference, not a credential: it is only ever read back through `readViewerCurrency`, which
 * accepts nothing but a Charge Currency. A currency we do not charge in clears it, so the server
 * falls back to the course's own.
 */
export function CurrencyCookieSync() {
    const currency = useUserCurrency();

    useEffect(() => {
        const code = String(currency ?? '').toUpperCase();
        document.cookie = isChargeCurrency(code)
            ? `${VIEWER_CURRENCY_COOKIE}=${code}; path=/; max-age=${YEAR}; SameSite=Lax`
            : `${VIEWER_CURRENCY_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    }, [currency]);

    return null;
}
