/**
 * Read-only: which version of the translation migration (if any) a database has.
 *
 * Two branches wrote 20260911000001_support_message_translation.sql with different contents —
 * one adds translated_body alone, the other translated_body, translated_lang and
 * translation_status. The runner keys on the filename, so a database that ran either records
 * the same version and would SKIP the other. This says which one it actually has.
 *
 *   node scratch/check-translation-schema.mjs           # live (RDS_DATABASE_URL)
 *   node scratch/check-translation-schema.mjs --local   # local (DATABASE_URL)
 */
import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const read = (name) => env.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*?)\\s*$`, 'm'))?.[1].replace(/^["']|["']$/g, '');
const local = process.argv.includes('--local');
const url = local ? read('DATABASE_URL') : read('RDS_DATABASE_URL');
const host = url.match(/@([^/:?]+)/)?.[1];
const isLocal = /^(localhost|127\.0\.0\.1)$/.test(host);
console.log(`target: ${host}${isLocal ? '  (local)' : '  ** LIVE ** (read-only)'}`);

const sql = postgres(url, { ssl: isLocal ? false : { rejectUnauthorized: false }, max: 1, connect_timeout: 25 });

const hasTable = (await sql`SELECT to_regclass('public.schema_migrations') AS t`)[0].t;
const recorded = hasTable
    ? (await sql`SELECT version FROM schema_migrations WHERE version LIKE '20260911%'`).map(r => r.version)
    : [];
const cols = (await sql`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'support_messages'
       AND column_name IN ('translated_body', 'translated_lang', 'translation_status')`).map(r => r.column_name);
const cons = (await sql`
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.support_messages'::regclass AND conname LIKE '%translation%'`).map(r => r.conname);
const translatedRows = cols.includes('translated_body')
    ? (await sql`SELECT count(*)::int AS n FROM support_messages WHERE translated_body IS NOT NULL`)[0].n
    : 0;

console.log(`recorded 20260911*: ${recorded.join(', ') || '(none)'}`);
console.log(`columns:            ${cols.join(', ') || '(none)'}`);
console.log(`constraints:        ${cons.join(', ') || '(none)'}`);
console.log(`rows translated:    ${translatedRows}`);
await sql.end();
