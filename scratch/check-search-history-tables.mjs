/** BG-12: is there any per-user search history table already? Read-only, live. */
import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/^\s*RDS_DATABASE_URL\s*=\s*(.*?)\s*$/m)[1].replace(/^["']|["']$/g, '');
const sql = postgres(url, { ssl: { rejectUnauthorized: false }, max: 1, connect_timeout: 25 });
await sql`SET statement_timeout = '20s'`;

const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (table_name ILIKE '%search%' OR table_name ILIKE '%recent%' OR table_name ILIKE '%history%' OR table_name ILIKE '%viewed%')
    ORDER BY 1`;
for (const { table_name } of tables) {
    const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${table_name} AND table_schema='public' ORDER BY ordinal_position`;
    const [{ n }] = await sql.unsafe(`SELECT count(*)::int AS n FROM "${table_name}"`);
    console.log(`${table_name} (${n} rows): ${cols.map(c => c.column_name).join(', ')}`);
}
await sql.end();
