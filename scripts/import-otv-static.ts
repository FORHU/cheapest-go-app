/**
 * Import OTV_STATIC_DATA.csv into tgx_hotel_static table.
 *
 * Usage:
 *   DATABASE_URL=<url> npx tsx scripts/import-otv-static.ts
 *
 * CSV format (semicolon-separated, header on line 1):
 *   [0] Hotel code; [1] Original supplier code; [2] FastX code; [3] Hotel name;
 *   [4] Country; [5] Latitude; [6] Longitude; [7..n-4] Address; [n-3] City;
 *   [n-2] Category code; [n-1] Giata ID; [n] Last Update
 *
 * Address may contain semicolons so we parse from both ends.
 */

import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import postgres from 'postgres';

const CSV_PATH = path.join(process.cwd(), 'OTV_STATIC_DATA.csv');
const BATCH_SIZE = 2000;

function str(v: string | undefined): string | null {
    if (v === undefined || v === null) return null;
    const t = v.trim();
    return t || null;
}

function num(v: string | undefined): number | null {
    if (v === undefined || v === null) return null;
    const t = v.trim();
    if (!t) return null;
    const f = parseFloat(t);
    return isNaN(f) ? null : f;
}

type Row = {
    hotel_code: string;
    supplier_code: string | null;
    fastx_code: string | null;
    hotel_name: string | null;
    country_code: string | null;
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    city: string | null;
    category_code: string | null;
    giata_id: string | null;
    last_update: string | null;
};

function parseLine(line: string): Row | null {
    const p = line.split(';');
    // Need at least: code, supplier, fastx, name, country, lat, lng, city = 8 fields minimum
    if (p.length < 8) return null;
    const hotelCode = str(p[0]);
    if (!hotelCode) return null;

    // Fixed fields from the LEFT (indices 0-6)
    const supplierCode = str(p[1]);
    const fastxCode    = str(p[2]);
    const hotelName    = str(p[3]);
    const country      = str(p[4]);
    const latitude     = num(p[5]);
    const longitude    = num(p[6]);

    // Fixed fields from the RIGHT
    // last_update is the last field (date or empty)
    // giata_id is second-to-last
    // category_code is third-to-last
    // city is fourth-to-last
    // Everything between index 7 and city is the address (handles embedded semicolons)
    const lastUpdate   = str(p[p.length - 1]);
    const giataId      = str(p[p.length - 2]);
    const categoryCode = str(p[p.length - 3]);
    const city         = str(p[p.length - 4]);
    // Address = everything between longitude (index 6) and city
    const addressParts = p.slice(7, p.length - 4);
    const address      = addressParts.length ? str(addressParts.join(';')) : null;

    // Validate last_update looks like a date or is empty; if it looks like a city name, shift right
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (lastUpdate && !dateRe.test(lastUpdate)) {
        // last_update field is not a date — the row likely has no date column; don't store a bad date
        return {
            hotel_code:    hotelCode,
            supplier_code: supplierCode,
            fastx_code:    fastxCode,
            hotel_name:    hotelName,
            country_code:  country,
            latitude,
            longitude,
            address,
            city,
            category_code: categoryCode,
            giata_id:      giataId,
            last_update:   null,
        };
    }

    return {
        hotel_code:    hotelCode,
        supplier_code: supplierCode,
        fastx_code:    fastxCode,
        hotel_name:    hotelName,
        country_code:  country,
        latitude,
        longitude,
        address,
        city,
        category_code: categoryCode,
        giata_id:      giataId,
        last_update:   lastUpdate,
    };
}

async function flushBatch(sql: postgres.Sql, rows: Row[]) {
    if (!rows.length) return;
    await sql`
        INSERT INTO tgx_hotel_static
            (hotel_code, supplier_code, fastx_code, hotel_name, country_code,
             latitude, longitude, address, city, category_code, giata_id, last_update)
        SELECT
            unnest(${sql.array(rows.map(r => r.hotel_code))}::text[]),
            unnest(${sql.array(rows.map(r => r.supplier_code))}::text[]),
            unnest(${sql.array(rows.map(r => r.fastx_code))}::text[]),
            unnest(${sql.array(rows.map(r => r.hotel_name))}::text[]),
            unnest(${sql.array(rows.map(r => r.country_code))}::text[]),
            unnest(${sql.array(rows.map(r => r.latitude))}::numeric[]),
            unnest(${sql.array(rows.map(r => r.longitude))}::numeric[]),
            unnest(${sql.array(rows.map(r => r.address))}::text[]),
            unnest(${sql.array(rows.map(r => r.city))}::text[]),
            unnest(${sql.array(rows.map(r => r.category_code))}::text[]),
            unnest(${sql.array(rows.map(r => r.giata_id))}::text[]),
            unnest(${sql.array(rows.map(r => r.last_update))}::date[])
        ON CONFLICT (hotel_code) DO UPDATE SET
            hotel_name    = EXCLUDED.hotel_name,
            country_code  = EXCLUDED.country_code,
            latitude      = EXCLUDED.latitude,
            longitude     = EXCLUDED.longitude,
            address       = EXCLUDED.address,
            city          = EXCLUDED.city,
            category_code = EXCLUDED.category_code,
            last_update   = EXCLUDED.last_update
    `;
}

async function main() {
    const url = process.env.DATABASE_URL;
    if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }

    const ssl = url.includes('sslmode=require') ? { rejectUnauthorized: false } : false;
    const sql = postgres(url, { ssl } as any);

    await sql`
        CREATE TABLE IF NOT EXISTS tgx_hotel_static (
            hotel_code    TEXT PRIMARY KEY,
            supplier_code TEXT,
            fastx_code    TEXT,
            hotel_name    TEXT,
            country_code  TEXT,
            latitude      NUMERIC(10,6),
            longitude     NUMERIC(10,6),
            address       TEXT,
            city          TEXT,
            category_code TEXT,
            giata_id      TEXT,
            last_update   DATE
        )
    `.catch(() => {}); // table already exists — fine

    console.log('Table ready: tgx_hotel_static');

    const rl = readline.createInterface({
        input: fs.createReadStream(CSV_PATH, { encoding: 'utf8' }),
        crlfDelay: Infinity,
    });

    let lineNum = 0;
    let batch: Row[] = [];
    let totalInserted = 0;
    let skipped = 0;

    for await (const line of rl) {
        lineNum++;
        if (lineNum === 1) continue; // skip header

        const row = parseLine(line);
        if (!row) { skipped++; continue; }

        batch.push(row);

        if (batch.length >= BATCH_SIZE) {
            await flushBatch(sql, batch);
            totalInserted += batch.length;
            batch = [];
            process.stdout.write(`\rImported: ${totalInserted.toLocaleString()} rows`);
        }
    }

    if (batch.length) {
        await flushBatch(sql, batch);
        totalInserted += batch.length;
    }

    console.log(`\nDone. Imported: ${totalInserted.toLocaleString()} | Skipped: ${skipped}`);
    await sql.end();
}

main().catch(e => { console.error('\n' + e.message); process.exit(1); });
