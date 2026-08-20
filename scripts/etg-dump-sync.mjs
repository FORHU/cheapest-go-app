/**
 * ETG hotel content dump sync.
 *
 * Streams the full ETG JSONL+Zstandard dump, matches hotels by numeric hid,
 * and bulk-updates hotel_content.room_groups + ratehawk_hid for all 1M+ hotels.
 *
 * Runs directly against the DB — no Vercel/Next.js involved.
 * Designed to run as a GitHub Actions scheduled job (up to 6 hours).
 *
 * Usage:
 *   node scripts/etg-dump-sync.mjs                  # incremental (default)
 *   node scripts/etg-dump-sync.mjs --type full      # full catalog (first seed)
 *   node scripts/etg-dump-sync.mjs --force          # re-seed already-done hotels
 *   node scripts/etg-dump-sync.mjs --dry-run        # count matches without writing
 *   node scripts/etg-dump-sync.mjs --type full --dry-run --limit 1000
 */

import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';

const ROOT    = new URL('..', import.meta.url);
const require = createRequire(import.meta.url);

// --- env: prefer process.env (GH Actions secrets), fall back to .env for local dev ---
const envPath = new URL('.env', ROOT);
if (existsSync(envPath)) {
  const envLines = readFileSync(envPath, 'utf-8').replace(/\r/g, '').split('\n');
  for (const line of envLines) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) {
      const k = m[1].trim();
      const v = m[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[k]) process.env[k] = v;   // don't overwrite GH secrets
    }
  }
}

const KEY_ID  = process.env.RATEHAWK_KEY_ID  || process.env.ETG_KEY_ID;
const API_KEY = process.env.RATEHAWK_API_KEY || process.env.ETG_API_KEY;
const DB_URL  = process.env.DATABASE_URL;

if (!KEY_ID || !API_KEY) { console.error('Missing RATEHAWK_KEY_ID / RATEHAWK_API_KEY'); process.exit(1); }
if (!DB_URL)             { console.error('Missing DATABASE_URL'); process.exit(1); }

const TOKEN = Buffer.from(`${KEY_ID}:${API_KEY}`).toString('base64');

// --- args ---
const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const FORCE     = args.includes('--force');
const typeArg   = args.indexOf('--type');
const DUMP_TYPE = typeArg !== -1 ? args[typeArg + 1] : 'incremental';
const limitArg  = args.indexOf('--limit');
const LIMIT     = limitArg !== -1 ? parseInt(args[limitArg + 1], 10) : null;

console.log(`[etg-dump] type=${DUMP_TYPE} force=${FORCE} dry_run=${DRY_RUN}${LIMIT ? ` limit=${LIMIT}` : ''}`);

// --- DB ---
const { default: postgres } = await import(new URL('node_modules/postgres/src/index.js', ROOT).href);
const sql = postgres(DB_URL, { ssl: { rejectUnauthorized: false }, max: 5 });

// --- fzstd ---
const { Decompress } = await import(new URL('node_modules/fzstd/lib/index.js', ROOT).href)
  .catch(() => import('fzstd'));

// --- ETG dump URL ---
const ENDPOINT = DUMP_TYPE === 'full'
  ? 'https://api.worldota.net/api/b2b/v3/hotel/info/dump/'
  : 'https://api.worldota.net/api/b2b/v3/hotel/info/incremental_dump/';

async function getDumpUrl() {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Basic ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: 'en' }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`ETG dump endpoint ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const url = json?.data?.url;
  if (!url) throw new Error(`No URL in dump response: ${JSON.stringify(json).slice(0, 200)}`);
  return url;
}

// --- amenity labels (mirrors etgRoomAmenityToLabel) ---
const AMENITY_LABELS = {
  air_conditioning: 'Air conditioning', wifi: 'Free Wi-Fi', bathroom: 'Private bathroom',
  shower: 'Shower', bathtub: 'Bathtub', kitchen: 'Kitchen', kitchenette: 'Kitchenette',
  balcony: 'Balcony', terrace: 'Terrace', sea_view: 'Sea view', pool_view: 'Pool view',
  city_view: 'City view', mountain_view: 'Mountain view', garden_view: 'Garden view',
  safe: 'Safe', tv: 'TV', minibar: 'Minibar', iron: 'Iron', hair_dryer: 'Hairdryer',
  desk: 'Desk', sofa: 'Sofa', wardrobe: 'Wardrobe', non_smoking: 'Non-smoking',
  smoking: 'Smoking allowed', pet_friendly: 'Pets allowed', disability_access: 'Accessible',
  jacuzzi: 'Jacuzzi', sauna: 'Sauna', shared_bathroom: 'Shared bathroom',
};
function amenityLabel(code) { return AMENITY_LABELS[code] || code.replace(/_/g, ' '); }

function parseRoomGroups(rawGroups) {
  return (rawGroups ?? [])
    .map(rg => ({
      name: rg.name ?? '',
      images: (rg.images ?? [])
        .map(img => {
          const u = typeof img === 'string' ? img : (img?.url ?? img?.src ?? null);
          return typeof u === 'string' ? u.replace(/\{size\}/g, '1024x768') : null;
        })
        .filter(Boolean)
        .slice(0, 10),
      amenities: Array.isArray(rg.room_amenities)
        ? rg.room_amenities.map(amenityLabel).filter(Boolean)
        : [],
    }))
    .filter(rg => rg.name);
}

// --- batch upsert ---
const BATCH_SIZE = 400;
const stats = { linesRead: 0, matched: 0, withGroups: 0, written: 0, skipped: 0, errors: 0 };

async function flushBatch(batch) {
  if (!batch.length || DRY_RUN) { batch.length = 0; return; }
  try {
    await sql`
      UPDATE hotel_content AS hc
      SET room_groups           = d.rg::jsonb,
          ratehawk_hid          = COALESCE(hc.ratehawk_hid, d.slug),
          room_groups_seeded_at = NOW()
      FROM unnest(
        ${sql.array(batch.map(r => r.hid))}::text[],
        ${sql.array(batch.map(r => r.slug))}::text[],
        ${sql.array(batch.map(r => r.rg))}::text[]
      ) AS d(hotel_id, slug, rg)
      WHERE hc.hotel_id = d.hotel_id
    `;
    stats.written += batch.length;
  } catch (e) {
    // row-by-row fallback
    for (const r of batch) {
      try {
        await sql`
          UPDATE hotel_content
          SET room_groups           = ${r.rg}::jsonb,
              ratehawk_hid          = COALESCE(ratehawk_hid, ${r.slug}),
              room_groups_seeded_at = NOW()
          WHERE hotel_id = ${r.hid}
        `;
        stats.written++;
      } catch { stats.errors++; }
    }
    console.warn('[etg-dump] Batch failed, fell back row-by-row:', e.message?.slice(0, 100));
  }
  batch.length = 0;
}

// --- main ---
const dumpUrl = await getDumpUrl();
console.log(`[etg-dump] Got dump URL`);

// Preload known hotel IDs into a Set for O(1) lookup while streaming
const existingRows = await sql`SELECT hotel_id FROM hotel_content WHERE hotel_id ~ '^[0-9]+$'`;
const knownIds = new Set(existingRows.map(r => String(r.hotel_id)));
console.log(`[etg-dump] ${knownIds.size} hotels in DB`);

let seededIds = new Set();
if (!FORCE) {
  const seededRows = await sql`
    SELECT hotel_id FROM hotel_content
    WHERE room_groups_seeded_at IS NOT NULL AND hotel_id ~ '^[0-9]+$'
  `;
  seededIds = new Set(seededRows.map(r => String(r.hotel_id)));
  console.log(`[etg-dump] Skipping ${seededIds.size} already-seeded hotels (use --force to overwrite)`);
}

const res = await fetch(dumpUrl, { signal: AbortSignal.timeout(21_600_000) }); // 6hr
if (!res.ok || !res.body) throw new Error(`Dump download ${res.status}`);

const dec    = new TextDecoder();
let   tail   = '';
const batch  = [];
let   limited = false;

const decompressor = new Decompress(chunk => { tail += dec.decode(chunk, { stream: true }); });
const reader       = res.body.getReader();
let   done         = false;

const startMs = Date.now();

while (!done && !limited) {
  const { value, done: d } = await reader.read();
  done = d;
  if (value) decompressor.push(value, done);

  // drain all complete lines from the decompressor output
  let nl;
  while ((nl = tail.indexOf('\n')) !== -1) {
    const line = tail.slice(0, nl).trim();
    tail = tail.slice(nl + 1);
    if (!line) continue;

    stats.linesRead++;

    if (stats.linesRead % 100_000 === 0) {
      const elapsedMin = ((Date.now() - startMs) / 60_000).toFixed(1);
      console.log(`[etg-dump] ${stats.linesRead} lines | matched=${stats.matched} written=${stats.written} (${elapsedMin}min)`);
    }

    let hotel;
    try { hotel = JSON.parse(line); } catch { stats.errors++; continue; }

    const hid  = String(hotel.hid ?? '');
    const slug = String(hotel.id  ?? '');
    if (!hid || !knownIds.has(hid)) continue;
    stats.matched++;

    if (!FORCE && seededIds.has(hid)) { stats.skipped++; continue; }

    const groups = parseRoomGroups(hotel.room_groups ?? []);
    if (groups.length > 0) stats.withGroups++;

    batch.push({ hid, slug, rg: JSON.stringify(groups) });
    if (batch.length >= BATCH_SIZE) await flushBatch(batch);

    if (LIMIT && stats.matched >= LIMIT) { limited = true; break; }
  }
}

await flushBatch(batch);
if (limited) await reader.cancel();

const elapsed = ((Date.now() - startMs) / 60_000).toFixed(1);
console.log(`\n─── ETG dump sync done (${elapsed} min) ────────────────`);
console.log(`  lines read:   ${stats.linesRead}`);
console.log(`  matched:      ${stats.matched}`);
console.log(`  with groups:  ${stats.withGroups}`);
console.log(`  written:      ${stats.written}`);
console.log(`  skipped:      ${stats.skipped}`);
console.log(`  errors:       ${stats.errors}`);

await sql.end();
