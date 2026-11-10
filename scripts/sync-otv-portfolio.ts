/**
 * Command-line entry to the OTV portfolio sync.
 *
 * The sync itself lives in src/lib/server/stays/travelgatex/portfolioSync.ts, because it also
 * runs nightly as /api/cron/otv-portfolio-sync on the app host. This file is the way to run it
 * against a database of your choosing; it holds no logic of its own, so the two cannot drift.
 *
 * Usage:
 *   npx tsx scripts/sync-otv-portfolio.ts [--dry-run] [--max-pages N]
 *
 * Reads DATABASE_URL, so it updates whichever database the environment points at: RDS on the
 * live container, localhost:5433 in development. There is deliberately no flag for choosing —
 * a script that can be pointed at production by a typo eventually is.
 *
 * Note that running this against production while the nightly job is going will be refused by
 * the advisory lock the route takes, which is the point of it.
 */

import 'dotenv/config';
import postgres from 'postgres';
import { syncOtvPortfolio } from '@/lib/server/stays/travelgatex/portfolioSync';

const DRY_RUN   = process.argv.includes('--dry-run');
const MAX_PAGES = (() => {
    const i = process.argv.indexOf('--max-pages');
    return i >= 0 ? Number(process.argv[i + 1]) : undefined;
})();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }

const sql = postgres(DATABASE_URL, { max: 2, idle_timeout: 30, connect_timeout: 30 });

syncOtvPortfolio(sql, { dryRun: DRY_RUN, maxPages: MAX_PAGES })
    .then(async (result) => {
        // An incomplete pull is not a success: it delisted nothing, and a caller that treats it
        // as one will go on to buy photographs on the strength of it.
        if (!result.complete && !DRY_RUN) process.exitCode = 1;
        await sql.end();
    })
    .catch(async (e) => {
        console.error('[otv-sync] failed:', e?.message ?? e);
        await sql.end().catch(() => {});
        process.exit(1);
    });
