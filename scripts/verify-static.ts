import 'dotenv/config';
import postgres from 'postgres';

async function main() {
    const url = process.env.DATABASE_URL;
    if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
    const ssl = url.includes('sslmode=require') ? { rejectUnauthorized: false } : false;
    const sql = postgres(url, { ssl } as any);

    const total = await sql`SELECT COUNT(*) AS n FROM tgx_hotel_static`;
    console.log('Total rows:', total[0].n);

    const bangkok = await sql`
        SELECT hotel_code, hotel_name, city, country_code, latitude, longitude, category_code
        FROM tgx_hotel_static WHERE city ILIKE '%Bangkok%' LIMIT 5
    `;
    console.log('\nBangkok samples:', bangkok.length);
    for (const r of bangkok) {
        console.log(` ${r.hotel_code} | ${r.hotel_name?.slice(0,40)} | ${r.city} | ${r.country_code} | ${r.latitude},${r.longitude} | stars:${r.category_code}`);
    }

    // Check if any of the known TGX search result codes are in the static table
    const known = ['13757443', '13378646', '13386270', '13921011', '9891499'];
    const found = await sql`SELECT hotel_code, hotel_name, city FROM tgx_hotel_static WHERE hotel_code = ANY(${known})`;
    console.log(`\nKnown TGX codes found in static table: ${found.length}/${known.length}`);
    for (const r of found) console.log(` ${r.hotel_code} | ${r.hotel_name} | ${r.city}`);

    await sql.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
