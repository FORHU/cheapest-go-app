/**
 * Apply dbmate-style migrations to the live database, up-section only.
 *
 * `psql -f` cannot be used on these files: each contains both `-- migrate:up` and
 * `-- migrate:down`, so psql would apply a change and then immediately undo it.
 * This splits on the marker and runs only the up half.
 *
 * Every file runs inside its own transaction — a failure rolls that file back
 * whole rather than leaving the schema half-changed. Applied files are recorded
 * in schema_migrations; without that ledger nothing tracks what has run, which is
 * how six migrations went missing.
 *
 * Rows are keyed the way dbmate keys them — on the version alone, never on the whole
 * filename — using the shared derivation in db/migration-version.mjs. This script
 * disagreed with dbmate on that until 2026-09-15, which made its skip-check dead (no row
 * it looked for could match one dbmate had written, so every file re-ran on every
 * invocation) and made the rows it wrote invisible to dbmate, which would then re-run
 * those migrations in turn.
 *
 * Nothing is applied until the whole of db/migrations/ has been checked for two files
 * sharing a version. Because the ledger key is that version alone, a collision means
 * applying either file marks the other applied forever, and it silently never runs.
 *
 *   node scratch/apply-migrations.mjs --dry    # print what would run, change nothing
 *   node scratch/apply-migrations.mjs          # apply
 */
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import { versionOf, listMigrationFiles, auditVersions, upSection } from '../db/migration-version.mjs';

const FILES = [
    // Already recorded — these print SKIP. Kept so a run shows the guard working
    // rather than silently doing nothing.
    '20260905000001_support_chat.sql',
    '20260906000001_support_message_notice_code.sql',
    '20260906000002_support_turn_claim.sql',
    '20260906000003_support_escalation_reason.sql',
    '20260906000004_email_logs_support_escalation.sql',
    '20260906000005_support_agent_role.sql',

    // Pending. In version order, which is the order dbmate would apply them in — keep it
    // that way, so this script and `dbmate up` can never produce different results from the
    // same directory. Order matters within it: support_assistant_retired_notice (…0001)
    // widens the notice_code CHECK constraint that start_waiting (…0002) then inserts
    // 'assistant_retired' against, and version order already puts them that way round.
    '20260906000006_rename_geomeego_to_airanggo.sql',
    '20260907000001_support_assistant_retired_notice.sql',
    '20260907000002_support_conversations_start_waiting.sql',
    '20260907000003_support_conversations_waiting_notified_at.sql',
    '20260907000004_supplier_booking_attempts.sql',

    // Chat Reference, Linked Bookings and Internal Notes (ADR-0038, ADR-0039).
    '20260909000001_support_chat_reference_bookings_notes.sql',

    // Support attachments, and the retention rule for them (ADR-0040).
    '20260910000001_support_message_attachments.sql',
    '20260910000002_support_attachment_retention.sql',

    // The stored machine translation beside each message (ADR-0033, ADR-0034).
    '20260911000001_support_message_translation.sql',
];

const dry = process.argv.includes('--dry');

const MIGRATIONS_DIR = 'db/migrations';

/**
 * Preflight: refuse to start if the directory or the list above is unsound.
 *
 * Loudly, and before touching a database, because a silent skip is the exact failure this
 * guards against — see the header of 20260907000004_supplier_booking_attempts.sql for what
 * one cost. Everything wrong is reported in a single pass: finding the second problem
 * should not cost another run.
 *
 * The version audit scans the whole directory rather than FILES, so a collision someone
 * else introduces is caught here even when neither colliding file was going to be applied.
 */
const onDisk = listMigrationFiles(MIGRATIONS_DIR);
const { collisions, malformed } = auditVersions(onDisk);

// Compared against the directory listing, never fs.existsSync: existsSync is
// case-insensitive on Windows and case-sensitive on Linux, so a case-typo in FILES would
// pass locally and then die mid-run in CI — precisely what this guard exists to prevent.
const present = new Set(onDisk);
const absent = FILES.filter((f) => !present.has(f));

if (collisions.length || malformed.length || absent.length) {
    console.error('ABORT — db/migrations/ is not in a state worth applying:\n');

    for (const { version, files } of collisions) {
        console.error(`  version ${version} is shared by ${files.join(' and ')}`);
    }
    for (const f of malformed) {
        console.error(`  ${f} has no leading version digits — dbmate would have nothing to record`);
    }
    for (const f of absent) {
        console.error(`  ${f} is listed in FILES but is not on disk (renamed? case wrong?)`);
    }

    if (collisions.length) {
        console.error('\ndbmate records the version, not the filename, so applying one of a colliding');
        console.error('pair marks the other applied forever and it never runs. Renumber whichever');
        console.error('file has NOT been applied yet to the next free version, then run this again.');
    }
    process.exit(1);
}

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

if (!dry) {
    await sql`CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version     text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
    )`;
    console.log('schema_migrations ready\n');
}

const done = dry ? new Set() : new Set((await sql`select version from schema_migrations`).map(r => r.version));

for (const f of FILES) {
    const version = versionOf(f);
    if (done.has(version)) { console.log(`SKIP  ${f}  (already recorded)`); continue; }

    const body = upSection(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
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
