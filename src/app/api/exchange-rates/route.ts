import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Server-side cache: rates + timestamp
let cachedRates: Record<string, number> | null = null;
let cachedAt = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Currencies we need (matches EXCHANGE_RATES in src/lib/currency.ts)
const SUPPORTED = [
    'USD', 'PHP', 'KRW', 'JPY', 'EUR', 'GBP', 'AUD', 'SGD',
    'MYR', 'THB', 'VND', 'IDR', 'CNY', 'TWD', 'HKD', 'INR', 'AED', 'CAD',
];

/**
 * GET /api/exchange-rates
 *
 * Returns live exchange rates (USD-per-1-unit format) with 1-hour server-side cache.
 * Uses the free Frankfurter API (European Central Bank data, no API key needed).
 * Falls back to static rates if the API is unreachable.
 */
export async function GET() {
    const now = Date.now();

    // Return cached rates if still fresh
    if (cachedRates && now - cachedAt < CACHE_TTL) {
        return NextResponse.json({
            success: true,
            rates: cachedRates,
            cachedAt: new Date(cachedAt).toISOString(),
            source: 'cache',
        });
    }

    try {
        // Frankfurter API: base=USD returns { rates: { PHP: 55.6, KRW: 1333, ... } }
        // These are "1 USD = X units" format
        const symbols = SUPPORTED.filter(c => c !== 'USD').join(',');
        const res = await fetch(
            `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${symbols}`,
            { signal: AbortSignal.timeout(5000) }
        );

        if (!res.ok) {
            throw new Error(`Frankfurter API returned ${res.status}`);
        }

        const data = await res.json();
        const apiRates: Record<string, number> = data.rates;

        // Convert from "1 USD = X units" → "1 unit = Y USD" (our EXCHANGE_RATES format)
        const converted: Record<string, number> = { USD: 1.0 };
        for (const [currency, rate] of Object.entries(apiRates)) {
            if (rate > 0) {
                converted[currency] = 1 / rate;
            }
        }

        cachedRates = converted;
        cachedAt = now;

        return NextResponse.json({
            success: true,
            rates: converted,
            cachedAt: new Date(cachedAt).toISOString(),
            source: 'live',
        });
    } catch (err) {
        console.error('[exchange-rates] Failed to fetch live rates:', err);

        // If we have stale cached rates, return them
        if (cachedRates) {
            return NextResponse.json({
                success: true,
                rates: cachedRates,
                cachedAt: new Date(cachedAt).toISOString(),
                source: 'stale-cache',
            });
        }

        // No cache at all — let client use its static fallback
        return NextResponse.json(
            { success: false, error: 'Unable to fetch exchange rates' },
            { status: 503 }
        );
    }
}
