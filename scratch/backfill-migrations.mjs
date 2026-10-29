/**
 * Record the historical migrations as applied WITHOUT running any of their SQL.
 *
 * The live database was built by hand long before anything tracked migrations, so its
 * schema already contains the effect of every file dated before 20260905000001 — 37 of
 * them — while `schema_migrations` holds only the six applied on 2026-09-09. Any runner
 * that treats "unrecorded" as "not yet applied" would re-run all 37 against a database
 * that already has them.
 *
 * This writes the version rows and nothing else. It executes no migration SQL, so it
 * cannot change the schema; the worst it can do is mark a file applied that in fact was
 * not, which is why the cutoff is a date already known to be live.
 *
 * Two jobs, because the ledger went wrong in two ways:
 *
 *   1. Files applied before anything recorded them — the date cutoff below.
 *   2. Rows written under the whole filename instead of the version. This script and
 *      apply-migrations.mjs both did that until 2026-09-15. The note here used to say the
 *      ledger held no such rows and only minting them needed stopping; that was true of
 *      local and false of live, where 52 of them sat unnoticed until a run on 2026-09-29
 *      found every one of their files unrecorded and started replaying applied migrations
 *      against production. It got two files in before an old CHECK constraint, long since
 *      widened, was rejected by rows that now legitimately violate it — which is the only
 *      reason it stopped there.
 *
 * A same-version row is restated, never moved: the old full-name row is left where it is,
 * because deleting rows to repair a ledger is how a ledger stops being evidence.
 *
 *   node scratch/backfill-migrations.mjs --dry   # list what would be recorded
 *   node scratch/backfill-migrations.mjs         # record
 */
import fs from 'fs';
import postgres from 'postgres';
import { versionOf, listMigrationFiles } from '../db/migration-version.mjs';

const MIGRATIONS_DIR = 'db/migrations';
const CUTOFF = '20260905000001';           // exclusive: this file and later are run, not backfilled
const dry = process.argv.includes('--dry');

// Environment first, then `.env` — same reason as apply-migrations.mjs: an override that
// is silently ignored sends a run meant for localhost to production.
const fileEnv = fs.readFileSync('.env', 'utf8');
const fromFile = fileEnv.match(/^RDS_DATABASE_URL=(.*)$/m)?.[1].trim().replace(/^"|"$/g, '');
const url = process.env.RDS_DATABASE_URL?.trim() || fromFile;
if (!url) {
    console.error('No database URL. Set RDS_DATABASE_URL in the environment or in .env.');
    process.exit(1);
}

const host = url.match(/@([^/:?]+)/)?.[1] ?? 'unknown';
const isLocal = /^(localhost|127\.0\.0\.1)$/.test(host);
console.log(`target: ${host}${isLocal ? '  (local)' : '  ** LIVE **'}\n`);

const sql = postgres(url, {
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 1,
    connect_timeout: 25,
});

/**
 * The versions to record, derived the way dbmate derives them.
 *
 * This wrote `20260601000001_schema` — the whole filename — until 2026-09-15, which is a
 * row dbmate does not recognise: it looks for `20260601000001`, would not find it, and
 * would re-run a migration against a database that already has it. The ledger currently
 * holds no such row, so nothing needs repairing; this only stops them being minted.
 *
 * The cutoff is compared against the version rather than the filename too. `f < CUTOFF`
 * was measuring a full filename against a bare 14-digit constant and happened to give the
 * right answer only because `_` sorts after every digit.
 */
const malformed = [];
const found = [];

for (const f of listMigrationFiles(MIGRATIONS_DIR)) {
    const version = versionOf(f);
    if (version === null) {
        malformed.push(f);
        continue;
    }
    // String comparison is sound because every version here is 14 digits — the convention
    // src/__tests__/db/migrations.test.ts enforces — so lexical and numeric order agree.
    if (version < CUTOFF) found.push(version);
}

if (malformed.length) {
    console.error(`ABORT — these have no leading version digits, so there is nothing to record:\n${malformed.map(f => `  ${f}`).join('\n')}`);
    process.exit(1);
}

// Deduplicated, which keying on the version rather than the filename newly makes possible:
// two files sharing a version collapse to one row, and counting them twice would overstate
// what this recorded. Such a pair is rejected by the migrations test and by the preflight in
// apply-migrations.mjs, so reaching here with one means something upstream was bypassed.
const versions = [...new Set(found)].sort();

await sql`CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version     text PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now()
)`;

const done = new Set((await sql`select version from schema_migrations`).map(r => r.version));

/**
 * Rows keyed on the whole filename, restated under the version a runner looks for.
 *
 * Derived from the ledger itself rather than from the directory, so the claim is only ever
 * one the database already made: every row here says that migration ran. No cutoff applies
 * — a mis-keyed row is wrong whatever its date — and a file that has since been renamed
 * still repairs correctly, because the version is read off the row, not matched to disk.
 */
const misKeyed = [...done]
    .map(row => ({ row, version: /^(\d+)_/.exec(row)?.[1] }))
    .filter(({ row, version }) => version && version !== row && !done.has(version));

const todo = [...new Set([...versions.filter(v => !done.has(v)), ...misKeyed.map(m => m.version)])].sort();

console.log(`${versions.length} historical files, ${done.size} rows in the ledger, ${todo.length} versions to record`);
console.log(`  from ${misKeyed.length} rows keyed on the whole filename\n`);
misKeyed.forEach(({ row, version }) => console.log(`  ${dry ? 'would restate' : 'restate'}  ${row}  ->  ${version}`));
todo.filter(v => !misKeyed.some(m => m.version === v))
    .forEach(v => console.log(`  ${dry ? 'would record' : 'record'}    ${v}`));

/**
 * Two mis-keyed rows landing on one version means the file was renumbered after it ran.
 *
 * Reported rather than resolved: both migrations really were applied, so one row standing
 * for both loses nothing — but the file now on disk under the old number is a DIFFERENT
 * migration, and it is about to be read as already applied. Worth a person's eye, because
 * the alternative reading is that a real migration silently never runs.
 */
const byVersion = new Map();
for (const m of misKeyed) byVersion.set(m.version, [...(byVersion.get(m.version) ?? []), m.row]);
const collided = [...byVersion].filter(([, rows]) => rows.length > 1);
if (collided.length) {
    console.log('\nNOTE — one version, more than one recorded migration. A file was renumbered after it ran:');
    for (const [version, rows] of collided) console.log(`  ${version}\n${rows.map(r => `      ${r}`).join('\n')}`);
}

if (!dry && todo.length) {
    await sql`insert into schema_migrations ${sql(todo.map(version => ({ version })))}
              on conflict (version) do nothing`;
    console.log(`\nRecorded ${todo.length}.`);
}
if (dry) console.log('\nDry run — nothing written.');

console.log(`\nschema_migrations now holds ${(await sql`select count(*) c from schema_migrations`)[0].c} rows.`);
await sql.end();
