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
    '20260905000001_support_chat.sql',
    '20260906000001_support_message_notice_code.sql',
    '20260906000002_support_turn_claim.sql',
    '20260906000003_support_escalation_reason.sql',
    '20260906000004_email_logs_support_escalation.sql',
    '20260906000005_support_agent_role.sql',
];

const dry = process.argv.includes('--dry');
const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g, '');
const sql = postgres(url, { ssl: { rejectUnauthorized: false }, max: 1, connect_timeout: 25 });

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
    console.table(await sql`select version, applied_at from schema_migrations order by version`);
}

await sql.end();
