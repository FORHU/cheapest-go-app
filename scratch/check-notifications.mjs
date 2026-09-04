// READ-ONLY. Did the CRITICAL save-failure notification fire for the orphaned charge?
import fs from 'node:fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const pick = (k) =>
  env.split(/\r?\n/).find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim().replace(/^["']|["']$/g, '');

const sql = postgres(pick('RDS_DATABASE_URL'), { max: 1, connect_timeout: 15, idle_timeout: 5, onnotice: () => {} });

const cols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'notifications' ORDER BY ordinal_position
`;
console.log('notifications columns:', cols.map((c) => c.column_name).join(', '), '\n');

const rows = await sql`
  SELECT * FROM notifications
  WHERE created_at >= '2026-08-01'
  ORDER BY created_at DESC
  LIMIT 40
`;
for (const r of rows) {
  console.log('---', r.created_at?.toISOString());
  for (const [k, v] of Object.entries(r)) {
    if (k === 'created_at') continue;
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    if (s && s !== 'null') console.log(`   ${k}: ${s.length > 300 ? s.slice(0, 300) + '…' : s}`);
  }
}
console.log('\nnotification rows since 2026-08-01:', rows.length);

await sql.end();
