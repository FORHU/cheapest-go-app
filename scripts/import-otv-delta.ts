/**
 * Delta-import new hotels from an OTV CSV into hotel_content.
 * Unlike import-hotel-content-csv.ts, this does NOT truncate — it only
 * inserts rows whose hotel_id is not already in hotel_content.
 *
 * Usage:
 *   npx tsx scripts/import-otv-delta.ts /path/to/hotels.csv
 *
 * CSV columns (semicolon-delimited):
 *   Hotel code ; Original supplier hotel code ; FastX hotel code ; Hotel name ;
 *   Country ; Latitude ; Longitude ; Address ; City ; Category code ; Giata ID ; Last Update
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as readline from 'readline';
import postgres from 'postgres';

const csvFile = process.argv[2];
if (!csvFile) {
    console.error('Usage: npx tsx scripts/import-otv-delta.ts /path/to/hotels.csv');
    process.exit(1);
}
if (!fs.existsSync(csvFile)) {
    console.error(`File not found: ${csvFile}`);
    process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 5, idle_timeout: 60 });

function parseLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === ';' && !inQuotes) { fields.push(current.trim()); current = ''; }
        else { current += ch; }
    }
    fields.push(current.trim());
    return fields;
}

interface HotelRow {
    hotelId: string;
    name: string | null;
    country: string | null;
    city: string | null;
    address: string | null;
    lat: number;
    lng: number;
    starRating: number;
}

const BATCH_SIZE = 200;

async function flushBatch(batch: HotelRow[]): Promise<number> {
    if (!batch.length) return 0;

    const hotelIds    = batch.map(r => r.hotelId);
    const names       = batch.map(r => r.name ?? r.hotelId);
    const countries   = batch.map(r => r.country ?? '');
    const cities      = batch.map(r => r.city ?? '');
    const addresses   = batch.map(r => r.address ?? '');
    const lats        = batch.map(r => r.lat);
    const lngs        = batch.map(r => r.lng);
    const starRatings = batch.map(r => r.starRating);

    const result = await sql`
        INSERT INTO hotel_content
            (hotel_id, name, country, city, address, lat, lng, star_rating,
             images, amenities, content_source, fetched_at)
        SELECT
            u.hotel_id, u.name, u.country, u.city, NULLIF(u.address, ''),
            u.lat::float8, u.lng::float8, u.star_rating::int,
            ARRAY[]::text[], '[]'::jsonb, 'tgx', now()
        FROM unnest(
            ${sql.array(hotelIds)}::text[],
            ${sql.array(names)}::text[],
            ${sql.array(countries)}::text[],
            ${sql.array(cities)}::text[],
            ${sql.array(addresses)}::text[],
            ${sql.array(lats.map(String))}::text[],
            ${sql.array(lngs.map(String))}::text[],
            ${sql.array(starRatings.map(String))}::text[]
        ) AS u(hotel_id, name, country, city, address, lat, lng, star_rating)
        WHERE u.hotel_id <> ''
        ON CONFLICT (hotel_id) DO NOTHING
    `;
    return result.count;
}

async function main() {
    console.log('Loading existing hotel_ids from hotel_content...');
    const existingRows = await sql`SELECT hotel_id FROM hotel_content`;
    const existingIds = new Set(existingRows.map((r: any) => r.hotel_id as string));
    console.log(`  DB has ${existingIds.size.toLocaleString()} hotels\n`);

    const stat = fs.statSync(csvFile);
    console.log(`CSV: ${csvFile} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    console.log('Scanning for new hotels...\n');

    const rl = readline.createInterface({ input: fs.createReadStream(csvFile), crlfDelay: Infinity });

    let lineNum = 0;
    let batch: HotelRow[] = [];
    let totalNew = 0;
    let totalSkipped = 0;
    const t0 = Date.now();

    for await (const line of rl) {
        lineNum++;
        if (lineNum === 1) continue;

        const fields = parseLine(line);
        if (fields.length < 9) continue;

        const hotelId = fields[0]?.trim();
        if (!hotelId || existingIds.has(hotelId)) { totalSkipped++; continue; }

        const name        = fields[3]?.trim() || null;
        const country     = fields[4]?.trim() || null;
        const address     = fields[7]?.trim() || null;
        const city        = fields[8]?.trim() || null;
        const categoryCode = fields[9]?.trim();

        batch.push({
            hotelId,
            name,
            country,
            city,
            address,
            lat:        parseFloat(fields[5]) || 0,
            lng:        parseFloat(fields[6]) || 0,
            starRating: parseInt(categoryCode) || 0,
        });

        if (batch.length >= BATCH_SIZE) {
            const inserted = await flushBatch(batch);
            totalNew += inserted;
            batch = [];
            process.stdout.write(`\r  Inserted ${totalNew} new hotels...`);
        }
    }

    if (batch.length) {
        totalNew += await flushBatch(batch);
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n\n✓ Done in ${elapsed}s`);
    console.log(`  New hotels inserted : ${totalNew}`);
    console.log(`  Already in DB       : ${totalSkipped.toLocaleString()}`);

    await sql.end();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
