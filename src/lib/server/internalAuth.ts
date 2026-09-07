/**
 * Gate for the internal function routes under /api/fn/*.
 *
 * These are ordinary public HTTP endpoints as far as the network is concerned, and some of
 * them spend money: /api/fn/travelgatex-book creates real hotel reservations on the live
 * OTV access code. The only thing between the open internet and live inventory is this
 * check.
 *
 * It used to fail OPEN — four copies of `if (!secret) return true`, one per route — so an
 * instance that started without FUNCTIONS_SECRET served an unauthenticated booking endpoint
 * and looked completely normal doing it. The secret is set in production today; nothing
 * would have told us if a deploy dropped it.
 *
 * Now it fails closed, and lives in one place so the four routes cannot drift apart.
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Returns a 401 response when the caller is not authorised, or null to proceed.
 *
 * In development the secret is optional: local work and the documented curl booking
 * procedure both run without one, and a dev server is not reachable from outside the
 * machine. The warning is deliberately noisy — the same relaxation in production is the
 * hole this closes.
 */
export function requireInternalSecret(req: NextRequest, routeName: string): NextResponse | null {
    const secret = process.env.FUNCTIONS_SECRET || process.env.INTERNAL_SECRET;

    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            console.error(
                `[internal-auth] ${routeName} refused: neither FUNCTIONS_SECRET nor INTERNAL_SECRET ` +
                `is set. This endpoint reaches a live supplier, so it fails closed rather than ` +
                `serving unauthenticated callers.`
            );
            return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });
        }
        console.warn(`[internal-auth] ${routeName} is UNAUTHENTICATED — no secret set (development only).`);
        return null;
    }

    if (req.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return null;
}
