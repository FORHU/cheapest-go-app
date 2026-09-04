// READ-ONLY. Pulls the stored raw TGX book response, looking for cancel deadlines.
import fs from 'node:fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const url = env
  .split(/\r?\n/)
  .find((l) => l.startsWith('RDS_DATABASE_URL='))
  ?.slice('RDS_DATABASE_URL='.length)
  .trim()
  .replace(/^["']|["']$/g, '');

const sql = postgres(url, { max: 1, connect_timeout: 15, idle_timeout: 5, onnotice: () => {} });

const rows = await sql`
  SELECT b.booking_id, b.property_name, b.total_price, b.created_at,
         jsonb_typeof(s.raw_liteapi_response) AS raw_type,
         s.raw_liteapi_response
  FROM bookings b
  JOIN booking_policy_snapshots s ON s.booking_id = b.booking_id
  WHERE b.created_at >= '2026-08-01'
  ORDER BY b.created_at DESC
`;

for (const r of rows) {
  let raw = r.raw_liteapi_response;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch {} }
  console.log('---');
  console.log(`${r.property_name}  $${r.total_price}  (${r.booking_id})  raw_type=${r.raw_type}`);
  console.log('  top-level keys:', raw && typeof raw === 'object' ? Object.keys(raw).join(', ') : String(raw).slice(0, 80));
  const s = JSON.stringify(raw ?? {});
  const hits = s.match(/"(cancelPolicy|cancelPenalt\w*|deadline|refundable|hoursBefore|deadLine)"\s*:\s*[^,}]{0,120}/gi);
  console.log('  policy hits:', hits ? hits.slice(0, 6).join(' | ') : 'NONE');
  console.log('  size:', s.length, 'chars');
}
await sql.end();
