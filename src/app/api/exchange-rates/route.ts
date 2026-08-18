import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { getLiveRates } from '@/lib/server/exchange-rates';

export const dynamic = 'force-dynamic';

/**
 * GET /api/exchange-rates
 *
 * Returns live exchange rates in USD-per-1-unit format, cached for 1 hour.
 *
 * Rates come from ExchangeRate-API with ECB/Frankfurter as fallback; the provider
 * chain and cache live in src/lib/server/exchange-rates.ts so that server-side
 * callers can reach them directly instead of round-tripping through this route.
 *
 * On total upstream failure this returns 503 and the client keeps its static table.
 */
export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 60, windowMs: 60_000, prefix: 'exchange-rates' });
    if (!rl.success) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const result = await getLiveRates();

    if (!result) {
        return NextResponse.json(
            { success: false, error: 'Unable to fetch exchange rates' },
            { status: 503 }
        );
    }

    return NextResponse.json({
        success: true,
        rates: result.rates,
        cachedAt: new Date(result.fetchedAt).toISOString(),
        source: result.source,
        provider: result.provider,
        ...(result.missing.length ? { missing: result.missing } : {}),
    });
}
