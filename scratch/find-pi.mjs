// READ-ONLY. Locate a booking by payment intent across both DBs, with fuzzy fallbacks.
// Usage: node scratch/find-pi.mjs pi_3U0ZDiC6cOjdwOIC13w89Ikx
import fs from 'node:fs';
import postgres from 'postgres';

const PI = process.argv[2] || 'pi_3U0ZDiC6cOjdwOIC13w89Ikx';
const env = fs.readFileSync('.env', 'utf8');
const pick = (k) =>
  env.split(/\r?\n/).find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim().replace(/^["']|["']$/g, '');

for (const [label, key] of [['LOCAL', 'DATABASE_URL'], ['LIVE', 'RDS_DATABASE_URL']]) {
  const url = pick(key);
  if (!url) { console.log(`${label}: ${key} missing`); continue; }
  const sql = postgres(url, { max: 1, connect_timeout: 15, idle_timeout: 5, onnotice: () => {} });
  console.log(`\n########## ${label}  (${new URL(url).host}) ##########`);
  try {
    const exact = await sql`
      SELECT booking_id, property_name, status, total_price, currency, created_at,
             holder_first_name, holder_last_name, provider_metadata
      FROM bookings WHERE payment_intent_id = ${PI}
    `;
    console.log(`exact PI match: ${exact.length}`);
    for (const r of exact) console.log('  ', r.created_at.toISOString(), r.property_name, r.total_price, r.currency, r.booking_id, r.provider_metadata);

    const aug4 = await sql`
      SELECT booking_id, property_name, status, total_price, currency, created_at,
             holder_first_name, holder_last_name, payment_intent_id, provider_metadata
      FROM bookings
      WHERE created_at >= '2026-08-03' AND created_at < '2026-08-06'
      ORDER BY created_at
    `;
    console.log(`\nAug 3-5 bookings: ${aug4.length}`);
    for (const r of aug4) {
      const live = /C6cOjdwOIC/.test(r.payment_intent_id || '') ? 'LIVE' : 'test';
      console.log(`   ${r.created_at.toISOString()}  ${r.property_name}  ${r.total_price} ${r.currency}  [${live}]  ${r.status}`);
      console.log(`      pi=${r.payment_intent_id}  ${r.holder_first_name} ${r.holder_last_name}`);
      console.log(`      meta=${JSON.stringify(r.provider_metadata)}`);
    }
    const total = await sql`SELECT count(*)::int AS n FROM bookings`;
    console.log(`\ntotal bookings in ${label}: ${total[0].n}`);
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }
  await sql.end();
}
