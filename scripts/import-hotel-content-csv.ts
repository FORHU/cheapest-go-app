/**
 * Bulk-import TGX hotel static content from a downloaded CSV into hotel_content.
 *
 * Usage:
 *   npx tsx scripts/import-hotel-content-csv.ts /path/to/hotels.csv
 *
 * Download the CSV from:
 *   TGX Platform → Connections → Connections Content
 *   Connection: Emerging Travel | Supplier: ETG (OTV) | Access: FORHU INC (38327)
 *   Click "Download CSV" (all countries — 1.14M rows)
 *
 * CSV columns (semicolon-delimited):
 *   Hotel code ; Original supplier hotel code ; FastX hotel code ; Hotel name ;
 *   Country ; Latitude ; Longitude ; Address ; City ; Category code ; Giata ID ; Last Update
 *
 * Performance: ~500 rows/batch via unnest → ~1.14M rows in ~3-5 minutes.
 *
 * Requires DATABASE_URL in env or .env
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as readline from 'readline';
import postgres from 'postgres';

const csvFile = process.argv[2];
if (!csvFile) {
    console.error('Usage: npx tsx scripts/import-hotel-content-csv.ts /path/to/hotels.csv');
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

// Semicolon-delimited; fields may be quoted
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

const BATCH_SIZE = 500;

async function flushBatch(batch: HotelRow[]): Promise<{ inserted: number; skipped: number }> {
    if (!batch.length) return { inserted: 0, skipped: 0 };

    const hotelIds    = batch.map(r => r.hotelId);
    const names       = batch.map(r => r.name ?? r.hotelId);
    const countries   = batch.map(r => r.country ?? '');
    const cities      = batch.map(r => r.city ?? '');
    const addresses   = batch.map(r => r.address ?? '');
    const lats        = batch.map(r => r.lat);
    const lngs        = batch.map(r => r.lng);
    const starRatings = batch.map(r => r.starRating);

    try {
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
            ON CONFLICT (hotel_id) DO UPDATE SET
                name       = CASE WHEN hotel_content.name IS NULL
                                  OR hotel_content.name = hotel_content.hotel_id
                             THEN COALESCE(EXCLUDED.name, hotel_content.name)
                             ELSE hotel_content.name END,
                lat        = CASE WHEN EXCLUDED.lat != 0 THEN EXCLUDED.lat ELSE hotel_content.lat END,
                lng        = CASE WHEN EXCLUDED.lng != 0 THEN EXCLUDED.lng ELSE hotel_content.lng END,
                city       = COALESCE(hotel_content.city,    NULLIF(EXCLUDED.city, '')),
                country    = COALESCE(hotel_content.country, NULLIF(EXCLUDED.country, '')),
                address    = COALESCE(hotel_content.address, EXCLUDED.address),
                star_rating = CASE WHEN hotel_content.star_rating IS NOT NULL AND hotel_content.star_rating != 0
                              THEN hotel_content.star_rating ELSE EXCLUDED.star_rating END,
                content_source = COALESCE(hotel_content.content_source, 'tgx'),
                fetched_at = now()
        `;
        return { inserted: result.count, skipped: 0 };
    } catch (e: any) {
        console.error('\n[batch error]', e.message.slice(0, 200));
        return { inserted: 0, skipped: batch.length };
    }
}

async function main() {
    console.log('Truncating hotel_content...');
    await sql`TRUNCATE hotel_content`;
    console.log('Truncated. Reading CSV...');

    const stat = fs.statSync(csvFile);
    console.log(`File size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);

    const rl = readline.createInterface({ input: fs.createReadStream(csvFile), crlfDelay: Infinity });

    let lineNum = 0;
    let batch: HotelRow[] = [];
    let totalInserted = 0;
    let totalSkipped = 0;
    const t0 = Date.now();

    for await (const line of rl) {
        lineNum++;
        if (lineNum === 1) continue; // skip header

        const fields = parseLine(line);
        if (fields.length < 7) continue;

        // Columns: [0]hotelCode [1]supplierCode [2]fastxCode [3]name [4]country
        //          [5]lat [6]lng [7]address [8]city [9]categoryCode [10]giataId [11]lastUpdate
        const hotelId     = fields[0]?.trim();
        const name        = fields[3]?.trim() || null;
        const country     = fields[4]?.trim() || null;
        const latStr      = fields[5]?.trim();
        const lngStr      = fields[6]?.trim();
        const address     = fields[7]?.trim() || null;
        const city        = fields[8]?.trim() || null;
        const categoryCode = fields[9]?.trim();

        if (!hotelId) continue;

        batch.push({
            hotelId,
            name,
            country,
            city,
            address,
            lat:        parseFloat(latStr) || 0,
            lng:        parseFloat(lngStr) || 0,
            starRating: parseInt(categoryCode) || 0,
        });

        if (batch.length >= BATCH_SIZE) {
            const { inserted, skipped } = await flushBatch(batch);
            totalInserted += inserted;
            totalSkipped  += skipped;
            batch = [];

            const elapsedS = ((Date.now() - t0) / 1000).toFixed(0);
            const rate = Math.round(lineNum / ((Date.now() - t0) / 1000));
            process.stdout.write(
                `\r  Row ${lineNum.toLocaleString()} | Inserted: ${totalInserted.toLocaleString()} | ${rate}/s | ${elapsedS}s elapsed`
            );
        }
    }

    if (batch.length) {
        const { inserted, skipped } = await flushBatch(batch);
        totalInserted += inserted;
        totalSkipped  += skipped;
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n\n✓ Done in ${elapsed}s`);
    console.log(`  Rows read       : ${(lineNum - 1).toLocaleString()}`);
    console.log(`  Inserted/updated: ${totalInserted.toLocaleString()}`);
    console.log(`  Skipped (errors): ${totalSkipped.toLocaleString()}`);

    await sql.end();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
