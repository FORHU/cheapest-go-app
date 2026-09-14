/**
 * BG-2: which cabin_class values do flight deals carry, locally and on live? Read-only.
 *   node scratch/check-deal-cabins.mjs
 */
import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const read = (k) => env.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*?)\\s*$`, 'm'))?.[1].replace(/^["']|["']$/g, '');

for (const [label, url, ssl] of [['local', read('DATABASE_URL'), false], ['live', read('RDS_DATABASE_URL'), { rejectUnauthorized: false }]]) {
    const sql = postgres(url, { ssl, max: 1, connect_timeout: 25 });
    try {
        await sql`SET statement_timeout = '10s'`;
        const cabins = await sql`SELECT cabin_class, count(*)::int AS n FROM flight_deals GROUP BY 1 ORDER BY 2 DESC`;
        const mnl = await sql`SELECT origin, destination, cabin_class, return_date FROM flight_deals WHERE origin = 'MNL' AND destination IN ('SIN','HKG')`;
        console.log(label, 'cabins:', cabins.map(r => `${JSON.stringify(r.cabin_class)}×${r.n}`).join(', '));
        console.log(label, 'MNL deals:', mnl.map(r => `${r.origin}-${r.destination} ${JSON.stringify(r.cabin_class)} return=${r.return_date ? 'yes' : 'no'}`).join(' | '));
    } catch (e) { console.log(label, 'error:', e.message); }
    await sql.end();
}
