/**
 * Command-line entry to the hotel content backfill.
 *
 * The backfill itself lives in src/lib/server/stays/travelgatex/contentBackfill.ts, because it
 * also runs nightly as part of /api/cron/otv-portfolio-sync on the app host. This file is the
 * way to run it against a database of your choosing; it holds no logic of its own, so the two
 * cannot drift.
 *
 * Usage:
 *   npx tsx scripts/backfill-hotel-content.ts [--limit N] [--all] [--dry-run]
 */

import 'dotenv/config';
import postgres from 'postgres';
import { backfillHotelContent, DEFAULT_BACKFILL_LIMIT } from '@/lib/server/stays/travelgatex/contentBackfill';

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT   = (() => {
    const i = process.argv.indexOf('--limit');
    if (i >= 0) return Number(process.argv[i + 1]);
    return process.argv.includes('--all') ? Infinity : DEFAULT_BACKFILL_LIMIT;
})();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }

const sql = postgres(DATABASE_URL, { max: 2, idle_timeout: 30, connect_timeout: 30 });

backfillHotelContent(sql, { dryRun: DRY_RUN, limit: LIMIT })
    .then(async () => { await sql.end(); })
    .catch(async (e) => {
        console.error('[backfill] failed:', e?.message ?? e);
        await sql.end().catch(() => {});
        process.exit(1);
    });
