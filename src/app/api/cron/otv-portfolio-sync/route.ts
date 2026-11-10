/**
 * GET /api/cron/otv-portfolio-sync
 *
 * Keeps hotel_content in line with what OTV will actually sell, and gives the newly listed
 * hotels their photographs. Replaces a person downloading a 187 MB CSV from the TGX dashboard
 * each week and running an importer against each database by hand.
 *
 * Moved here from .github/workflows/cron-otv-portfolio-sync.yml on 2026-11-10, for the same
 * reason the ETG dump moved on 2026-10-14: that workflow ran on a GitHub-hosted runner and
 * connected straight to DATABASE_URL, which is a private RDS with no public endpoint. It had
 * never once completed, and a failing scheduled workflow is quiet unless someone opens the
 * Actions tab.
 *
 * It belongs here rather than in a workflow calling the public URL: Cloudflare cuts an origin
 * response off at about 100 seconds and this runs for an hour or more. The cron sidecar reaches
 * the app over the Docker network, so nothing in between can time it out.
 *
 * Query params:
 *   ?dry_run=true        read the portfolio and report, writing nothing
 *   ?skip_backfill=true  sync the portfolio only, skip the content backfill
 *   ?max_pages=N         stop after N pages (a smoke test; delisting is then skipped)
 *   ?limit=N             hotels for the backfill to ask about, or `all` for the whole backlog
 *
 * Auth: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';
import { syncOtvPortfolio } from '@/lib/server/stays/travelgatex/portfolioSync';
import { backfillHotelContent, DEFAULT_BACKFILL_LIMIT } from '@/lib/server/stays/travelgatex/contentBackfill';

export const dynamic     = 'force-dynamic';
export const maxDuration = 300;

/**
 * Two of these must never overlap.
 *
 * The sync stages the codes it has seen in a table it truncates on entry, so a second run
 * starting mid-flight would empty the first run's evidence — and the first would then conclude
 * that everything it had already passed is missing from the portfolio and delist it. The
 * workflow this replaced got that from a GitHub `concurrency` group; a cron entry has no such
 * thing, and the danger is now larger, because a person can also start one by hand while the
 * nightly run is going.
 *
 * An arbitrary constant, chosen once and never derived: `hashtext` would be shorter but its
 * value is not contractual across major versions, and a lock key that quietly changes under a
 * database upgrade is a lock that stops locking.
 */
const SYNC_LOCK_KEY = 4820_1114;

function parseLimit(raw: string | null): number {
    if (raw === 'all') return Infinity;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_BACKFILL_LIMIT;
}

export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp           = new URL(req.url).searchParams;
    const dryRun       = sp.get('dry_run')       === 'true';
    const skipBackfill = sp.get('skip_backfill') === 'true';
    const maxPages     = Number(sp.get('max_pages')) > 0 ? Number(sp.get('max_pages')) : undefined;
    const limit        = parseLimit(sp.get('limit'));

    // One connection for the whole run, holding the lock and doing the work. The pool is five
    // wide and shared with everything else the app does; a job of this length must not sit on
    // more of it than it needs.
    const held = await getSqlAdmin().reserve();
    let locked = false;

    try {
        const [{ got }] = await held<{ got: boolean }[]>`
            SELECT pg_try_advisory_lock(${SYNC_LOCK_KEY}) AS got
        `;
        if (!got) {
            console.warn('[otv-sync] another run holds the lock — standing down');
            return NextResponse.json(
                { error: 'A portfolio sync is already running', running: true },
                { status: 409 },
            );
        }
        locked = true;

        const portfolio = await syncOtvPortfolio(held, { dryRun, maxPages });

        // Only after a clean sync. A sync that stopped early already refuses to delist
        // anything, and there is no sense buying photographs on the strength of a run that did
        // not finish.
        if (!portfolio.complete) {
            return NextResponse.json({ ok: false, portfolio, backfill: null }, { status: 500 });
        }

        const backfill = dryRun || skipBackfill
            ? null
            : await backfillHotelContent(held, { limit });

        return NextResponse.json({ ok: true, portfolio, backfill });
    } catch (e: any) {
        console.error('[otv-sync] failed:', e?.message ?? e);
        return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
    } finally {
        // Releasing the connection would drop the lock with it, but only once this process
        // lets go of it. Unlocking first keeps a crashed run from leaving a lock behind for as
        // long as the pool holds the connection open.
        if (locked) {
            await held`SELECT pg_advisory_unlock(${SYNC_LOCK_KEY})`.catch(() => {});
        }
        held.release();
    }
}
