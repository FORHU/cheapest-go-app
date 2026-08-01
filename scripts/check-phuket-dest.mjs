// Check failed_dest_codes table and cache state for Phuket code 1476
import postgres from 'postgres';

const DB_URL = 'postgresql://cheapestgo:cheapestgo@localhost:5433/cheapestgo?sslmode=disable';
const sql = postgres(DB_URL, { ssl: false, max: 1 });

console.log('\n═══ tgx_destination_cache — all rows ═══');
try {
    const rows = await sql`SELECT * FROM tgx_destination_cache ORDER BY city_key`;
    if (!rows.length) console.log('  (empty)');
    else rows.forEach(r => console.log(`  key=${r.city_key}  code=${r.destination_code}`));
} catch (e) { console.log('  error:', e.message); }

console.log('\n═══ failed_dest_codes (or tgx_failed_dest_codes) ═══');
try {
    // Try both possible table names
    for (const tbl of ['failed_dest_codes', 'tgx_failed_dest_codes', 'otv_failed_dest_codes']) {
        try {
            const rows = await sql.unsafe(`SELECT * FROM ${tbl} ORDER BY 1`);
            console.log(`  table=${tbl}  rows=${rows.length}`);
            rows.forEach(r => console.log(`  `, JSON.stringify(r)));
            break;
        } catch { /* table doesn't exist */ }
    }
} catch (e) { console.log('  error:', e.message); }

console.log('\n═══ FIX: insert phuket → 1476 into tgx_destination_cache ═══');
try {
    await sql`
        INSERT INTO tgx_destination_cache (city_key, destination_code)
        VALUES ('phuket', '1476')
        ON CONFLICT (city_key) DO UPDATE SET destination_code = EXCLUDED.destination_code
    `;
    console.log('  ✓ inserted phuket → 1476');
} catch (e) { console.log('  error:', e.message); }

console.log('\n═══ verify ═══');
const verify = await sql`SELECT * FROM tgx_destination_cache WHERE city_key = 'phuket'`;
console.log(' ', JSON.stringify(verify[0]));

await sql.end();
