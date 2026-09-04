// READ-ONLY. Hunts for the $44.18 Miasageori booking across bookings + unified_bookings.
// Usage: node scratch/find-44-18.mjs [live|local]     (default: live)
import fs from 'node:fs';
import postgres from 'postgres';

const target = (process.argv[2] || 'live').toLowerCase();
const key = target === 'local' ? 'DATABASE_URL' : 'RDS_DATABASE_URL';

const env = fs.readFileSync('.env', 'utf8');
const url = env
  .split(/\r?\n/)
  .find((l) => l.startsWith(key + '='))
  ?.slice(key.length + 1)
  .trim()
  .replace(/^["']|["']$/g, '');
if (!url) throw new Error(`${key} not found in .env`);
console.log(`target=${target}  host=${new URL(url).host}\n`);

const sql = postgres(url, { max: 1, connect_timeout: 15, idle_timeout: 5, onnotice: () => {} });

console.log('=== bookings: Miasageori OR 44.18 OR Aug-4 window (no date floor) ===');
const b = await sql`
  SELECT booking_id, property_name, status, total_price, currency,
         holder_first_name, holder_last_name, payment_intent_id,
         provider_metadata->>'supplierRef' AS ratehawk_order,
         created_at, updated_at
  FROM bookings
  WHERE property_name ILIKE '%Miasageori%'
     OR total_price IN (44.18, 45.14)
     OR payment_intent_id IN ('pi_3U0bNcC6cOjdwOIC3e90l7OR')
     OR provider_metadata->>'supplierRef' IN ('967778226', '989201060', '920518808')
  ORDER BY created_at DESC
`;
console.table(
  b.map((r) => ({
    created: r.created_at?.toISOString().slice(0, 16),
    property: r.property_name,
    price: `${r.total_price} ${r.currency}`,
    status: r.status,
    order: r.ratehawk_order,
    guest: `${r.holder_first_name} ${r.holder_last_name}`,
    pi: r.payment_intent_id,
  }))
);
console.log('bookings rows:', b.length, '\n');

console.log('=== unified_bookings: hotel rows around the same amounts ===');
const u = await sql`
  SELECT id, type, provider, external_id, status, total_price, currency, created_at,
         metadata->>'bookingId'   AS booking_id,
         metadata->>'supplierRef' AS ratehawk_order,
         metadata->>'propertyName' AS property_name
  FROM unified_bookings
  WHERE total_price IN (44.18, 45.14)
     OR metadata::text ILIKE '%Miasageori%'
     OR external_id IN ('967778226', '989201060', '920518808')
  ORDER BY created_at DESC
`;
console.table(
  u.map((r) => ({
    created: r.created_at?.toISOString().slice(0, 16),
    type: r.type,
    provider: r.provider,
    external_id: r.external_id,
    property: r.property_name,
    price: `${r.total_price} ${r.currency}`,
    status: r.status,
    booking_id: r.booking_id,
  }))
);
console.log('unified rows:', u.length, '\n');

console.log('=== bookings count by day, Aug 2026 ===');
const c = await sql`
  SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS n
  FROM bookings
  WHERE created_at >= '2026-08-01' AND created_at < '2026-09-04'
  GROUP BY 1 ORDER BY 1
`;
console.table(c);

await sql.end();
