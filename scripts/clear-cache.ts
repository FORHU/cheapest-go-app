import postgres from 'postgres';

async function main() {
    const url = process.env.DATABASE_URL;
    if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
    const ssl = url.includes('sslmode=require') ? { rejectUnauthorized: false } : false;
    const sql = postgres(url, { ssl } as any);
    await sql`TRUNCATE hotel_search_cache`;
    await sql`TRUNCATE tgx_destination_cache`;
    console.log('Cache cleared:', url.split('@')[1]?.split('/')[0] ?? url.slice(0, 40));
    await sql.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
