/**
 * Read-only: what is the live database busy with right now? Lists non-idle queries by age.
 *
 *   node scratch/check-live-db-activity.mjs
 */
import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/^\s*RDS_DATABASE_URL\s*=\s*(.*?)\s*$/m)[1].replace(/^["']|["']$/g, '');
const sql = postgres(url, { ssl: { rejectUnauthorized: false }, max: 1, connect_timeout: 25, idle_timeout: 5 });

const t0 = Date.now();
const rows = await sql`
    SELECT pid, state, wait_event_type, wait_event,
           now() - query_start AS age,
           left(regexp_replace(query, '\\s+', ' ', 'g'), 140) AS query
      FROM pg_stat_activity
     WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle'
     ORDER BY query_start
`;
console.log(`answered in ${Date.now() - t0}ms — ${rows.length} active\n`);
for (const r of rows) {
    console.log(`pid ${r.pid}  ${String(r.age).padEnd(18)} ${r.state}${r.wait_event ? ` (${r.wait_event_type}:${r.wait_event})` : ''}`);
    console.log(`   ${r.query}`);
}
await sql.end();
