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
 *   node scratch/backfill-migrations.mjs --dry   # list what would be recorded
 *   node scratch/backfill-migrations.mjs         # record
 */
import fs from 'fs';
import postgres from 'postgres';

const CUTOFF = '20260905000001';           // exclusive: this file and later are run, not backfilled
const dry = process.argv.includes('--dry');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g, '');
const sql = postgres(url, { ssl: { rejectUnauthorized: false }, max: 1, connect_timeout: 25 });

const versions = fs.readdirSync('db/migrations')
    .filter(f => f.endsWith('.sql'))
    .filter(f => f < CUTOFF)
    .map(f => f.replace(/\.sql$/, ''))
    .sort();

await sql`CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version     text PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now()
)`;

const done = new Set((await sql`select version from schema_migrations`).map(r => r.version));
const todo = versions.filter(v => !done.has(v));

console.log(`${versions.length} historical files, ${done.size} already recorded, ${todo.length} to record\n`);
todo.forEach(v => console.log(`  ${dry ? 'would record' : 'record'}  ${v}`));

if (!dry && todo.length) {
    await sql`insert into schema_migrations ${sql(todo.map(version => ({ version })))}
              on conflict (version) do nothing`;
    console.log(`\nRecorded ${todo.length}.`);
}
if (dry) console.log('\nDry run — nothing written.');

console.log(`\nschema_migrations now holds ${(await sql`select count(*) c from schema_migrations`)[0].c} rows.`);
await sql.end();
