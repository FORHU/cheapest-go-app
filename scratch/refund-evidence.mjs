// READ-ONLY. Pulls hotel bookings + policy snapshot + refund log from live RDS.
// Run from the repo root:  node scratch/refund-evidence.mjs
import fs from 'node:fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const url = env
  .split(/\r?\n/)
  .find((l) => l.startsWith('RDS_DATABASE_URL='))
  ?.slice('RDS_DATABASE_URL='.length)
  .trim()
  .replace(/^["']|["']$/g, '');
if (!url) throw new Error('RDS_DATABASE_URL not found in .env');

const sql = postgres(url, { max: 1, connect_timeout: 15, idle_timeout: 5, onnotice: () => {} });

const rows = await sql`
  SELECT b.booking_id,
         b.property_name,
         b.status,
         b.total_price, b.currency,
         b.payment_intent_id,
         b.provider_metadata,
         b.created_at, b.updated_at,
         s.policy_type, s.refundable_tag, s.free_cancel_deadline,
         s.raw_provider_response
  FROM bookings b
  LEFT JOIN booking_policy_snapshots s ON s.booking_id = b.booking_id
  WHERE b.created_at >= '2026-08-01'
  ORDER BY b.created_at DESC
`;

for (const r of rows) {
  console.log('---');
  console.log(`${r.created_at.toISOString()}  ${r.property_name}  $${r.total_price} ${r.currency}`);
  console.log(`  booking_id : ${r.booking_id}`);
  console.log(`  status     : ${r.status}   cancelled_at(updated): ${r.updated_at.toISOString()}`);
  console.log(`  pi         : ${r.payment_intent_id}`);
  console.log(`  policy     : ${r.policy_type} / ${r.refundable_tag} / deadline=${r.free_cancel_deadline}`);
  console.log(`  meta       : ${JSON.stringify(r.provider_metadata)}`);
  const raw = JSON.stringify(r.raw_provider_response ?? {});
  console.log(`  rawPolicy  : ${raw.length > 900 ? raw.slice(0, 900) + '…' : raw}`);
}
console.log('\nROWS:', rows.length);
await sql.end();
