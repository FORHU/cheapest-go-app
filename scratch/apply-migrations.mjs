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
 *   node scratch/apply-migrations.mjs          # apply to live (RDS_DATABASE_URL)
 *   node scratch/apply-migrations.mjs --local  # apply to local (DATABASE_URL, :5433)
 */
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import { versionOf, listMigrationFiles, auditVersions, upSection } from '../db/migration-version.mjs';

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
 * The version audit scans the whole directory, so a collision someone else introduces is
 * caught here even when the colliding file was already applied.
 */
const onDisk = listMigrationFiles(MIGRATIONS_DIR);
const { collisions, malformed } = auditVersions(onDisk);

// Every migration in the directory, in version order.
//
// This used to be a hand-maintained array, which drifted to 22 of the 59 files on disk —
// including 20260601000001_schema.sql and 20260601000002_auth.sql, so a database built
// with it came up without `users`. Nothing reported that: the preflight only checked the
// other direction, for names listed here but missing from disk, which is the mistake
// nobody makes. schema_migrations is what stops a migration applying twice, so reading
// the whole directory is safe and a new file needs no edit here to be picked up.
const FILES = onDisk;

if (collisions.length || malformed.length) {
    console.error('ABORT — db/migrations/ is not in a state worth applying:\n');

    for (const { version, files } of collisions) {
        console.error(`  version ${version} is shared by ${files.join(' and ')}`);
    }
    for (const f of malformed) {
        console.error(`  ${f} has no leading version digits — dbmate would have nothing to record`);
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
const readEnv = (name) => fileEnv
    .match(new RegExp(`^\\s*${name}\\s*=\\s*(.*?)\\s*$`, 'm'))?.[1]
    .replace(/^["']|["']$/g, '');

// `--local` migrates the database in .env's DATABASE_URL — the local one on :5433 — without
// any shell-specific way of setting a variable first, which differs between PowerShell,
// cmd and bash and is how a "local" run ended up somewhere else.
const local = process.argv.includes('--local');
const url = local
    ? readEnv('DATABASE_URL')
    : process.env.RDS_DATABASE_URL?.trim() || readEnv('RDS_DATABASE_URL');
if (!url) {
    console.error(local
        ? 'No DATABASE_URL in .env for --local.'
        : 'No database URL. Set RDS_DATABASE_URL in the environment or in .env.');
    process.exit(1);
}

// Say which one, every time. A migration runner that does not name its target is one
// nobody can tell they pointed at the wrong database until afterwards.
const host = url.match(/@([^/:?]+)/)?.[1] ?? 'unknown';
const loopback = /^(localhost|127\.0\.0\.1)$/.test(host);

// A loopback host is not proof of a local database. Production RDS has no public address,
// so the only way to reach it from a laptop is an SSM port-forward through the app box —
// and that arrives on 127.0.0.1 like any local Postgres. An explicit sslmode in the URL is
// what tells them apart: nothing asks for TLS to reach the dev Postgres on :5433, and RDS
// refuses a connection without it. Before this, such a run announced `(local)` while
// pointed at production and then died with `no pg_hba.conf entry ... no encryption` —
// the label being wrong was the more dangerous half.
const tunnelled = loopback && /[?&]ssl(mode)?=/i.test(url);
const isLocal = loopback && !tunnelled;
console.log(`target: ${host}${isLocal ? '  (local)' : `  ** LIVE **${tunnelled ? '  (via tunnel)' : ''}`}\n`);

// Asked for local and about to touch something that is not: stop rather than migrate it.
if (local && !isLocal) {
    console.error(`--local was given but DATABASE_URL points at ${host}. Nothing was run.`);
    process.exit(1);
}

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

/**
 * Versions already recorded. Read in dry mode too — a SELECT changes nothing, and without
 * it `--dry` printed every file on disk rather than the ones a real run would apply, which
 * is the only question it is asked. That mattered less when the list above was hand-kept
 * and short; now that it is the whole directory, a dry run that cannot tell applied from
 * pending is actively misleading.
 *
 * Tolerates the table not existing yet (42P01), which is the case on a database this script
 * has never touched — and only that. A blanket catch here would report every migration as
 * pending when the real problem was that the connection failed, which is the difference
 * between "nothing to do" and "about to re-run the entire history against production".
 */
const done = new Set(
    (await sql`select version from schema_migrations`.catch((e) => {
        if (e.code === '42P01') return [];
        throw e;
    })).map(r => r.version)
);

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
