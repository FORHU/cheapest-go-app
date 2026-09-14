/** Print a few hotel ids from the LOCAL database that a /property/[id] page can open. Read-only. */
import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/m)[1].replace(/^["']|["']$/g, '');
const sql = postgres(dbUrl, { ssl: false, max: 1 });
const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%hotel%' ORDER BY 1`;
console.log(tables.map(t => t.table_name).join(', '));
for (const { table_name } of tables) {
    const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name=${table_name}`;
    const names = cols.map(c => c.column_name);
    if (names.includes('latitude') || names.includes('lat')) {
        const rows = await sql.unsafe(`SELECT * FROM "${table_name}" LIMIT 2`);
        console.log(table_name, JSON.stringify(rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => /id|name|city|lat|lng|lon|country/i.test(k))))).slice(0, 600));
    }
}
await sql.end();
