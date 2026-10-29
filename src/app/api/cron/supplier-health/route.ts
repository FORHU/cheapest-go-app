import { NextRequest, NextResponse } from 'next/server';
import { getAdminSettings, saveAdminSettings } from '@/lib/server/admin/settings';
import { createNotification } from '@/lib/server/admin/notify';
import { requireAdmin, isAuthError } from '@/lib/server/admin';
import { resolveTgxDestinationCode } from '@/lib/server/search';
import { tgxGraphQL, getTgxConfig, getTgxSettings } from '@/lib/server/stays/travelgatex/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Is the hotel supplier still selling?
 *
 * One search against a canary destination, on a schedule. The canary is the whole idea:
 * a user's search returning nothing is ambiguous — "Seoul has no rooms for those dates"
 * and "this account is being served nothing" come back byte-identical, `status: ok` with
 * an empty array and no error. Reading that ambiguity wrongly is what put nineteen
 * destination codes on the blacklist for a week.
 *
 * London at three weeks out removes the ambiguity. It is never legitimately empty, so
 * zero options there is a fact about us, not about London. On 2026-10-26 it returned
 * zero for the first time and the outage had already been running unnoticed for about
 * two weeks, because nothing watched this.
 */

/** Never legitimately sold out. GB so the dest-code lookup can reject a Londons-elsewhere row. */
const CANARY = { city: 'London', country: 'GB' };

/** Consecutive verdicts required before the public site is changed either way. */
const FAILS_TO_ENGAGE = 3;
const PASSES_TO_CLEAR = 2;

/** `YYYY-MM-DD`, `days` from today. Computed, never hardcoded — a literal date would
 *  slip into the past and then report a permanent outage from its own staleness. */
function isoDaysOut(days: number): string {
    return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    // Two callers: the scheduled job with the shared secret, and the "Check now" button
    // in Admin → Settings, which has a session instead.
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        const auth = await requireAdmin();
        if (isAuthError(auth)) return auth;
    }

    const checkin = isoDaysOut(21);
    const checkout = isoDaysOut(23);

    let options = 0;
    let detail = '';
    let probeFailed = false;

    try {
        const code = await resolveTgxDestinationCode(CANARY.city, CANARY.country);
        if (!code) {
            probeFailed = true;
            detail = `no destination code for ${CANARY.city}`;
        } else {
            const cfg = getTgxConfig();
            const result = await tgxGraphQL(
                'query Health($criteria:HotelCriteriaSearchInput!,$settings:HotelSettingsInput){hotelX{search(criteria:$criteria,settings:$settings){options{hotelCode paymentType status}errors{code description}}}}',
                {
                    criteria: {
                        checkIn: checkin,
                        checkOut: checkout,
                        occupancies: [{ paxes: [{ age: 30 }, { age: 30 }] }],
                        nationality: 'GB',
                        currency: 'USD',
                        destinations: [code],
                    },
                    settings: getTgxSettings(cfg, 18_000, true),
                },
                25_000,
            );
            const opts = result?.data?.hotelX?.search?.options ?? [];
            options = opts.filter((o: any) => o.paymentType === 'MERCHANT').length;
            detail = `${CANARY.city} (${code}) ${checkin}→${checkout}: ${options} merchant options`;
        }
    } catch (e: any) {
        // A thrown probe says our call failed, not that the supplier is empty. Those are
        // different facts, and only the second one should ever darken the site.
        probeFailed = true;
        detail = `probe error: ${String(e?.message ?? e).slice(0, 200)}`;
    }

    const cfg = await getAdminSettings();
    const maintenanceOn = cfg.stays_maintenance === true;

    // An unreachable probe is recorded and surfaced, but never counted as a verdict.
    if (probeFailed) {
        await saveAdminSettings({
            stays_health_status: 'unknown',
            stays_health_detail: detail,
            stays_health_checked_at: new Date().toISOString(),
        });
        console.warn('[supplier-health]', detail);
        return NextResponse.json({ ok: false, status: 'unknown', detail, maintenance: maintenanceOn });
    }

    const status = options > 0 ? 'healthy' : 'down';
    const streak = cfg.stays_health_status === status ? (Number(cfg.stays_health_streak) || 0) + 1 : 1;

    const next: Record<string, any> = {
        stays_health_status: status,
        stays_health_streak: streak,
        stays_health_detail: detail,
        stays_health_checked_at: new Date().toISOString(),
    };

    let switched: string | null = null;

    if (status === 'down' && !maintenanceOn && streak >= FAILS_TO_ENGAGE) {
        next.stays_maintenance = true;
        switched = 'on';
        createNotification(
            'Stays maintenance switched ON automatically',
            `The hotel supplier returned no availability for ${CANARY.city} on ${streak} consecutive checks (${detail}). ` +
            `Hotel search and booking are now showing a maintenance notice. Flights are unaffected.`,
            'alert',
        );
    } else if (status === 'healthy' && maintenanceOn && streak >= PASSES_TO_CLEAR) {
        next.stays_maintenance = false;
        switched = 'off';
        createNotification(
            'Stays maintenance switched OFF automatically',
            `The hotel supplier returned availability on ${streak} consecutive checks (${detail}). Hotel search and booking are live again.`,
            'system',
        );
    }

    await saveAdminSettings(next);
    console.log(`[supplier-health] ${status} streak=${streak} ${detail}${switched ? ` — maintenance ${switched}` : ''}`);

    return NextResponse.json({
        ok: true,
        status,
        streak,
        detail,
        checkedAt: next.stays_health_checked_at,
        maintenance: switched ? switched === 'on' : maintenanceOn,
        switched,
    });
}
