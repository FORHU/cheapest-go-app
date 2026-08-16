/**
 * Currency conversion utilities.
 *
 * Rates are sourced from ExchangeRate-API (open.er-api.com) with ECB/Frankfurter as
 * a fallback — see src/lib/server/exchange-rates.ts for the provider chain.
 *
 * `refreshExchangeRates()` works in both runtimes:
 *   - browser → GET /api/exchange-rates
 *   - server   → calls the provider chain directly (no HTTP round-trip to ourselves)
 *
 * This matters because server code — including the booking routes that decide what a
 * customer is charged — previously could never refresh: the old implementation issued
 * a relative fetch('/api/exchange-rates'), which is unresolvable in Node, failed
 * silently, and left every server-side conversion pinned to the static table below.
 */

/**
 * Static fallback rates (USD-per-1-unit format).
 *
 * Last refreshed from live rates on 2026-08-16. These exist only to keep the UI
 * rendering something sane before the first successful fetch — they drift, so never
 * treat them as authoritative for money. `convertCurrencyStrict()` refuses to use
 * them for charge amounts once rates are known to be stale.
 */
const STATIC_RATES: Record<string, number> = {
    'USD': 1.0,
    'PHP': 0.01626866,
    'KRW': 0.00070678,
    'JPY': 0.00628039,
    'EUR': 1.15640492,
    'GBP': 1.35322941,
    'AUD': 0.7077762,
    'SGD': 0.78186511,
    'MYR': 0.24472328,
    'THB': 0.03018687,
    'VND': 0.00003835,
    'IDR': 0.00005611,
    'CNY': 0.1479156,
    'TWD': 0.03126238,
    'HKD': 0.12742761,
    'INR': 0.01047082,
    'AED': 0.27229408,
    'CAD': 0.72072799,
};

/**
 * The live exchange rates object. Starts with static values and is
 * updated in-place when `refreshExchangeRates()` succeeds.
 * All consumers of `convertCurrency()` automatically use the latest rates.
 */
export const EXCHANGE_RATES: Record<string, number> = { ...STATIC_RATES };

const REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour

/** Timestamp of the last successful live rate update (0 = never). */
let _lastRefresh = 0;

/** De-dupes concurrent refreshes (important on the server, where many requests race). */
let _inFlight: Promise<boolean> | null = null;

/** True when EXCHANGE_RATES has never been populated from a live source. */
export function ratesAreStatic(): boolean {
    return _lastRefresh === 0;
}

/** Age of the current rates in ms, or Infinity if never refreshed. */
export function ratesAgeMs(): number {
    return _lastRefresh === 0 ? Infinity : Date.now() - _lastRefresh;
}

function applyRates(rates: Record<string, number>): void {
    // Update in-place so all imported references see the new values.
    for (const [currency, rate] of Object.entries(rates)) {
        if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
            EXCHANGE_RATES[currency] = rate;
        }
    }
    _lastRefresh = Date.now();
}

/**
 * Fetch live exchange rates and update EXCHANGE_RATES in-place.
 * Safe to call repeatedly and concurrently; skips if refreshed within the last hour.
 *
 * @param force Refresh even if the current rates are still fresh.
 * @returns true if rates were updated, false if skipped or errored.
 */
export async function refreshExchangeRates(force = false): Promise<boolean> {
    if (!force && _lastRefresh && Date.now() - _lastRefresh < REFRESH_INTERVAL) {
        return false;
    }
    if (_inFlight) return _inFlight;

    _inFlight = (async () => {
        try {
            if (typeof window === 'undefined') {
                // Server: go straight to the providers. A relative fetch cannot work here.
                const { getLiveRates } = await import('@/lib/server/exchange-rates');
                const result = await getLiveRates(force);
                if (!result) return false;
                applyRates(result.rates);
                return true;
            }

            const res = await fetch('/api/exchange-rates');
            if (!res.ok) return false;

            const json = await res.json();
            if (!json.success || !json.rates) return false;

            applyRates(json.rates as Record<string, number>);
            return true;
        } catch {
            // Network/provider error — keep using static/previous rates.
            return false;
        } finally {
            _inFlight = null;
        }
    })();

    return _inFlight;
}

/**
 * Convert an amount between currencies.
 *
 * Display-safe: on an unknown currency it warns and returns the amount unchanged.
 * Use `convertCurrencyStrict()` for anything that determines money movement — a
 * silent passthrough there would charge the wrong number in the wrong currency.
 */
export function convertCurrency(amount: number, fromCurrency: string, toCurrency: string): number {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    if (from === to) return amount;

    const fromRate = EXCHANGE_RATES[from];
    const toRate = EXCHANGE_RATES[to];

    if (!fromRate || !toRate) {
        console.warn(`Exchange rate not found for ${from} or ${to}`);
        return amount; // Fallback to original amount
    }

    // Convert: (Amount * FromRate) / ToRate
    // e.g. 5800 PHP -> USD: 5800 * 0.01626 / 1 = 94.35
    return (amount * fromRate) / toRate;
}

/** Raised when a charge-path conversion cannot be performed safely. */
export class ExchangeRateError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ExchangeRateError';
    }
}

/**
 * Convert an amount for a money-movement path (Stripe charges, refunds, payouts).
 *
 * Unlike `convertCurrency()` this throws rather than returning an unconverted amount,
 * because silently passing e.g. 5800 through a PHP→USD conversion would charge 5800 USD.
 *
 * Callers should `await refreshExchangeRates()` first. If rates have never been
 * fetched this throws, so a provider outage fails the booking loudly instead of
 * charging at a stale hardcoded rate.
 *
 * @param maxAgeMs Reject rates older than this. Defaults to 24h.
 */
export function convertCurrencyStrict(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    maxAgeMs = 24 * 60 * 60 * 1000,
): number {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    if (from === to) return amount;

    if (!Number.isFinite(amount)) {
        throw new ExchangeRateError(`Refusing to convert non-finite amount: ${amount}`);
    }

    const fromRate = EXCHANGE_RATES[from];
    const toRate = EXCHANGE_RATES[to];

    if (!fromRate || !toRate) {
        throw new ExchangeRateError(
            `No exchange rate for ${!fromRate ? from : to} — cannot convert ${from}→${to} safely.`
        );
    }

    const age = ratesAgeMs();
    if (age > maxAgeMs) {
        throw new ExchangeRateError(
            `Exchange rates are ${age === Infinity ? 'unfetched' : `${Math.round(age / 3600_000)}h old`}; ` +
            `refusing to convert ${from}→${to} for a charge.`
        );
    }

    return (amount * fromRate) / toRate;
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(currency: string): string {
    switch (currency.toUpperCase()) {
        case 'USD': return '$';
        case 'PHP': return '₱';
        case 'KRW': return '₩';
        case 'JPY': return '¥';
        case 'EUR': return '€';
        case 'GBP': return '£';
        case 'AUD': return 'A$';
        case 'CAD': return 'C$';
        case 'SGD': return 'S$';
        case 'HKD': return 'HK$';
        case 'CNY': return '¥';
        case 'INR': return '₹';
        case 'THB': return '฿';
        case 'VND': return '₫';
        case 'TWD': return 'NT$';
        default: return currency;
    }
}

/** Test seam: restore the static table and mark rates as never-refreshed. */
export function __resetExchangeRates() {
    for (const key of Object.keys(EXCHANGE_RATES)) delete EXCHANGE_RATES[key];
    Object.assign(EXCHANGE_RATES, STATIC_RATES);
    _lastRefresh = 0;
    _inFlight = null;
}
