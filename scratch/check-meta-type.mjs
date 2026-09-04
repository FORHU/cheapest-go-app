// READ-ONLY. Is provider_metadata a jsonb object, or a jsonb *string* (double-encoded)?
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
  SELECT booking_id,
         jsonb_typeof(provider_metadata)                        AS jsonb_type,
         provider_metadata ->> 'supplierRef'                     AS direct_lookup,
         (provider_metadata #>> '{}')::jsonb ->> 'supplierRef'   AS unwrapped_lookup
  FROM bookings
  WHERE created_at >= '2026-08-01'
  ORDER BY created_at DESC
`;
console.table(rows);

// What the Node driver hands the app code:
const [one] = await sql`
  SELECT provider_metadata FROM bookings WHERE created_at >= '2026-08-01' ORDER BY created_at DESC LIMIT 1
`;
console.log('typeof provider_metadata in JS :', typeof one.provider_metadata);
console.log('meta?.supplierRef              :', one.provider_metadata?.supplierRef);

await sql.end();
