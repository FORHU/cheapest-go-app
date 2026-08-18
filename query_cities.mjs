import postgres from './node_modules/postgres/src/index.js';

const cc = process.argv[2] || 'BD';
const sql = postgres({ host: 'localhost', port: 5433, user: 'cheapestgo', password: 'cheapestgo', database: 'cheapestgo', ssl: false });

try {
    const rows = await sql`SELECT DISTINCT city FROM hotel_content WHERE country = ${cc} ORDER BY city`;
    if (rows.length === 0) {
        console.log(`(no rows for ${cc})`);
    } else {
        console.log(`=== ${cc} (${rows.length} cities) ===`);
        rows.forEach(r => console.log(r.city));
    }
} catch (e) {
    console.error(e.message);
} finally {
    await sql.end();
}
