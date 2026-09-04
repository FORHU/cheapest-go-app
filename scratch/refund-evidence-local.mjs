// READ-ONLY. Same evidence query, but against the LOCAL dev DB (DATABASE_URL, port 5433).
// Run from the repo root:  node scratch/refund-evidence-local.mjs
import fs from 'node:fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const pick = (key) =>
  env
    .split(/\r?\n/)
    .find((l) => l.startsWith(key + '='))
    ?.slice(key.length + 1)
    .trim()
    .replace(/^["']|["']$/g, '');

const url = pick('DATABASE_URL');
if (!url) throw new Error('DATABASE_URL not found in .env');
console.log('host:', new URL(url).host, '\n');

const sql = postgres(url, { max: 1, connect_timeout: 10, idle_timeout: 5, onnotice: () => {} });

const rows = await sql`
  SELECT b.booking_id,
         b.property_name,
         b.status,
         b.total_price, b.currency,
         b.check_in, b.check_out,
         b.holder_first_name, b.holder_last_name,
         b.payment_intent_id,
         b.provider_metadata,
         b.created_at, b.updated_at,
         s.policy_type, s.refundable_tag, s.free_cancel_deadline
  FROM bookings b
  LEFT JOIN booking_policy_snapshots s ON s.booking_id = b.booking_id
  WHERE b.property_name ILIKE '%Miasageori%'
     OR b.total_price = 44.18
  ORDER BY b.created_at DESC
`;

for (const r of rows) {
  console.log('---');
  console.log(`${r.created_at.toISOString()}  ${r.property_name}  $${r.total_price} ${r.currency}`);
  console.log(`  booking_id : ${r.booking_id}`);
  console.log(`  guest      : ${r.holder_first_name} ${r.holder_last_name}`);
  console.log(`  stay       : ${r.check_in.toISOString().slice(0, 10)} -> ${r.check_out.toISOString().slice(0, 10)}`);
  console.log(`  status     : ${r.status}   updated: ${r.updated_at.toISOString()}`);
  console.log(`  pi         : ${r.payment_intent_id}`);
  console.log(`  policy     : ${r.policy_type} / ${r.refundable_tag} / deadline=${r.free_cancel_deadline}`);
  console.log(`  meta       : ${JSON.stringify(r.provider_metadata)}`);
}
console.log('\nROWS:', rows.length);
await sql.end();
