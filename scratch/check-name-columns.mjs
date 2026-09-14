/** BG-9: how long can a stored name be, and how long are they today? Read-only, local + live. */
import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const read = (k) => env.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*?)\\s*$`, 'm'))?.[1].replace(/^["']|["']$/g, '');

for (const [label, url, ssl] of [['local', read('DATABASE_URL'), false], ['live', read('RDS_DATABASE_URL'), { rejectUnauthorized: false }]]) {
    const sql = postgres(url, { ssl, max: 1, connect_timeout: 25 });
    try {
        await sql`SET statement_timeout = '20s'`;
        const cols = await sql`
            SELECT table_name, column_name, data_type, character_maximum_length AS max
            FROM information_schema.columns
            WHERE column_name IN ('first_name', 'last_name')
              AND table_schema = 'public'
            ORDER BY table_name, column_name`;
        console.log(`${label} columns:`, cols.map(c => `${c.table_name}.${c.column_name} ${c.data_type}${c.max ? `(${c.max})` : ''}`).join(', '));
        const longest = await sql`
            SELECT max(length(first_name))::int AS first_max, max(length(last_name))::int AS last_max,
                   count(*) FILTER (WHERE length(first_name) > 30 OR length(last_name) > 30)::int AS over_30,
                   count(*)::int AS users
            FROM users`;
        console.log(`${label} users:`, longest[0]);
    } catch (e) { console.log(label, 'error:', e.message); }
    await sql.end();
}
