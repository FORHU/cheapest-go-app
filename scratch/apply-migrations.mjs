/**
 * Apply dbmate-style migrations to the live database, up-section only.
 *
 * `psql -f` cannot be used on these files: each contains both `-- migrate:up` and
 * `-- migrate:down`, so psql would apply a change and then immediately undo it.
 * This splits on the marker and runs only the up half.
 *
 * Every file runs inside its own transaction — a failure rolls that file back
 * whole rather than leaving the schema half-changed. Applied files are recorded
 * in schema_migrations, which the live database does not currently have; without
 * it nothing tracks what has run, which is how six migrations went missing.
 *
 *   node scratch/apply-migrations.mjs --dry    # print what would run, change nothing
 *   node scratch/apply-migrations.mjs          # apply
 */
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

const FILES = [
    // Already recorded — these print SKIP. Kept so a run shows the guard working
    // rather than silently doing nothing.
    '20260905000001_support_chat.sql',
    '20260906000001_support_message_notice_code.sql',
    '20260906000002_support_turn_claim.sql',
    '20260906000003_support_escalation_reason.sql',
    '20260906000004_email_logs_support_escalation.sql',
    '20260906000005_support_agent_role.sql',

    // Pending. Order matters: support_assistant_retired_notice widens the notice_code
    // CHECK constraint that start_waiting then inserts 'assistant_retired' against.
    '20260906000001_rename_geomeego_to_airanggo.sql',
    '20260907000001_supplier_booking_attempts.sql',
    '20260907000001_support_assistant_retired_notice.sql',
    '20260907000002_support_conversations_start_waiting.sql',
    '20260907000003_support_conversations_waiting_notified_at.sql',

    // Chat Reference, Linked Bookings and Internal Notes (ADR-0038, ADR-0039).
    '20260909000001_support_chat_reference_bookings_notes.sql',

    // Support attachments, and the retention rule for them (ADR-0040).
    '20260910000001_support_message_attachments.sql',
    '20260910000002_support_attachment_retention.sql',

    // The stored machine translation beside each message (ADR-0033, ADR-0034).
    '20260911000001_support_message_translation.sql',
];

const dry = process.argv.includes('--dry');

/**
 * The database to migrate, from the environment first and only then from `.env`.
 *
 * It used to read `.env` alone, which quietly ignored `RDS_DATABASE_URL=… node …` — the
 * obvious way to point this at a local database. On 2026-09-10 a run meant for localhost
 * went to production instead, and the only clue was a timestamp. Reading the environment
 * first makes the override do what it looks like it does.
 *
 *   RDS_DATABASE_URL="$(...)" node scratch/apply-migrations.mjs   # explicit target
 *   node scratch/apply-migrations.mjs                             # .env, i.e. live
 */
const fileEnv = fs.readFileSync('.env', 'utf8');
const fromFile = fileEnv.match(/^RDS_DATABASE_URL=(.*)$/m)?.[1].trim().replace(/^"|"$/g, '');
const url = process.env.RDS_DATABASE_URL?.trim() || fromFile;
if (!url) {
    console.error('No database URL. Set RDS_DATABASE_URL in the environment or in .env.');
    process.exit(1);
}

// Say which one, every time. A migration runner that does not name its target is one
// nobody can tell they pointed at the wrong database until afterwards.
const host = url.match(/@([^/:?]+)/)?.[1] ?? 'unknown';
const isLocal = /^(localhost|127\.0\.0\.1)$/.test(host);
console.log(`target: ${host}${isLocal ? '  (local)' : '  ** LIVE **'}\n`);

const sql = postgres(url, {
    // A local database has no TLS to negotiate; insisting on it fails the connection.
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 1,
    connect_timeout: 25,
});

const upOnly = (text) => {
    const body = text.split(/^--\s*migrate:down\s*$/m)[0];
    return body.replace(/^--\s*migrate:up\s*$/m, '').trim();
};

if (!dry) {
    await sql`CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version     text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
    )`;
    console.log('schema_migrations ready\n');
}

const done = dry ? new Set() : new Set((await sql`select version from schema_migrations`).map(r => r.version));

for (const f of FILES) {
    const version = f.replace(/\.sql$/, '');
    if (done.has(version)) { console.log(`SKIP  ${f}  (already recorded)`); continue; }

    const body = upOnly(fs.readFileSync(path.join('db/migrations', f), 'utf8'));
    if (!body) { console.log(`SKIP  ${f}  (empty up section)`); continue; }

    if (dry) {
        console.log(`\n───── ${f} ─────`);
        console.log(body.split('\n').filter(l => l.trim() && !l.trim().startsWith('--')).join('\n'));
        continue;
    }

    try {
        await sql.begin(async (tx) => {
            await tx.unsafe(body);
            await tx`insert into schema_migrations (version) values (${version})
                     on conflict (version) do nothing`;
        });
        console.log(`OK    ${f}`);
    } catch (e) {
        console.error(`FAIL  ${f}\n      ${e.message}`);
        console.error('\nStopped. Nothing from this file was applied; earlier files stand.');
        await sql.end();
        process.exit(1);
    }
}

if (!dry) {
    console.log('\n── schema_migrations now ──');
    // `applied_at` is this script's column, not dbmate's. Where the table was created by
    // dbmate it holds `version` alone, and `CREATE TABLE IF NOT EXISTS` above leaves such a
    // table exactly as it found it — so the summary must ask what is there rather than
    // assume. It threw on the local database on 2026-09-10, after every migration had
    // already succeeded, which made a clean run look like a failed one.
    const hasAppliedAt = (await sql`
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'schema_migrations'
           AND column_name = 'applied_at'`).length > 0;

    console.table(hasAppliedAt
        ? await sql`select version, applied_at from schema_migrations order by version`
        : await sql`select version from schema_migrations order by version`);
}

await sql.end();
