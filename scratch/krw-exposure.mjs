/**
 * How many bookings are in a zero-decimal Charge Currency?
 *
 * `toStripeAmount` correctly sends KRW as whole won, but ~10 call sites read the
 * PaymentIntent back with a hardcoded `pi.amount / 100`. For KRW that is 100x too
 * small — including the refund quote shown to the customer before they cancel.
 * This counts the blast radius.
 *
 *   node scratch/krw-exposure.mjs                     # local dev database
 *   node scratch/krw-exposure.mjs RDS_DATABASE_URL    # live — the one that matters
 */
import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const key = process.argv[2] || 'DATABASE_URL';
const url = env.match(new RegExp('^' + key + '=(.*)$', 'm'))?.[1].trim().replace(/^"|"$/g, '');
if (!url) throw new Error(`${key} not found in .env`);
console.log(`reading ${key}`);
const sql = postgres(url, {
    ssl: url.includes('rds') ? { rejectUnauthorized: false } : false,
    max: 1,
    connect_timeout: 15,
});

const ZERO_DECIMAL = ['KRW', 'JPY', 'VND', 'CLP', 'ISK'];

for (const t of ['flight_bookings', 'bookings']) {
    const cols = await sql`
        select column_name from information_schema.columns where table_name = ${t}`;
    const names = cols.map(c => c.column_name);
    const currencyCol = ['payment_currency', 'currency'].find(c => names.includes(c));
    if (!currencyCol) { console.log(`${t}: no currency column`); continue; }

    const rows = await sql`
        select upper(${sql(currencyCol)}) as currency, count(*)::int as n
        from ${sql(t)} group by 1 order by 2 desc`;
    console.log(`\n── ${t} (by ${currencyCol})`);
    console.table(rows.map(r => ({
        ...r,
        'zero-decimal?': ZERO_DECIMAL.includes(r.currency) ? 'YES — affected' : 'no',
    })));
}

await sql.end();
