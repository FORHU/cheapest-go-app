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
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');

// --- env: prefer process.env (GH Actions secrets), fall back to .env for local dev ---
const envPath = path.join(ROOT, '.env');
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
  console.log(`[etg-dump] Loaded .env from ${envPath}`);
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
const { default: postgres } = await import('postgres');
const isLocalDb = DB_URL.includes('localhost') || DB_URL.includes('127.0.0.1');
const sql = postgres(DB_URL, { ssl: isLocalDb ? false : { rejectUnauthorized: false }, max: 5 });

// --- fzstd ---
const { Decompress } = await import('fzstd');

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

// --- amenity labels (dash-separated slugs from ETG dump) ---
const ETG_ROOM_AMENITY_MAP = {
  'private-bathroom':'Private Bathroom','shared-bathroom':'Shared Bathroom','shower':'Shower',
  'bath':'Bathtub','bathtub':'Bathtub','bidet':'Bidet','jacuzzi':'Jacuzzi','hot-tub':'Hot Tub',
  'air-conditioning':'Air Conditioning','heating':'Heating','fan':'Fan','fireplace':'Fireplace',
  'tv':'TV','cable-tv':'Cable TV','satellite-tv':'Satellite TV','dvd-player':'DVD Player',
  'wifi':'WiFi','wi-fi':'WiFi','telephone':'Telephone',
  'kitchen':'Kitchen','kitchenette':'Kitchenette','fridge':'Refrigerator','minibar':'Minibar',
  'microwave':'Microwave','dishwasher':'Dishwasher','washing-machine':'Washing Machine',
  'kettle':'Kettle','coffee-machine':'Coffee Machine','tea-or-coffee':'Coffee & Tea',
  'toaster':'Toaster','oven':'Oven','stove':'Stove',
  'hairdryer':'Hair Dryer','hair-dryer':'Hair Dryer','iron':'Iron','safe':'Safe',
  'desk':'Desk','sofa':'Sofa','wardrobe':'Wardrobe','extra-bed':'Extra Bed','sofa-bed':'Sofa Bed',
  'balcony':'Balcony','terrace':'Terrace','sea-view':'Sea View','pool-view':'Pool View',
  'city-view':'City View','mountain-view':'Mountain View','garden-view':'Garden View',
  'non-smoking':'Non-smoking','smoking':'Smoking Allowed',
  'pet-friendly':'Pets Allowed','disability-access':'Accessible',
  'bedsheets':'Bedsheets','towels':'Towels',
};
function amenityLabel(code) {
  return ETG_ROOM_AMENITY_MAP[code] || code.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function resolveImg(u) {
  return typeof u === 'string' ? u.replace(/\{size\}/g, '1024x768') : null;
}

function parseRoomGroups(rawGroups) {
  return (rawGroups ?? [])
    .map(rg => ({
      name: rg.name ?? '',
      images: (rg.images ?? [])
        .map(img => resolveImg(typeof img === 'string' ? img : (img?.url ?? img?.src ?? null)))
        .filter(Boolean)
        .slice(0, 10),
      amenities: Array.isArray(rg.room_amenities)
        ? rg.room_amenities.map(amenityLabel).filter(Boolean)
        : [],
    }))
    .filter(rg => rg.name);
}

function parseDescription(descStruct) {
  if (!Array.isArray(descStruct) || !descStruct.length) return null;
  return descStruct
    .map(s => s.paragraphs?.join(' ') ?? '')
    .filter(Boolean)
    .join('\n\n') || null;
}

function parseAmenityGroups(rawGroups) {
  if (!Array.isArray(rawGroups)) return [];
  return rawGroups
    .map(g => ({
      group_name: g.group_name ?? '',
      amenities: Array.isArray(g.amenities) ? g.amenities : [],
      non_free_amenities: Array.isArray(g.non_free_amenities) ? g.non_free_amenities : [],
    }))
    .filter(g => g.group_name);
}

function parseHotelImages(rawImages) {
  if (!Array.isArray(rawImages)) return [];
  return rawImages.map(resolveImg).filter(Boolean).slice(0, 20);
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
          room_groups_seeded_at = NOW(),
          check_in_time         = COALESCE(NULLIF(d.x->>'ci', ''), hc.check_in_time),
          check_out_time        = COALESCE(NULLIF(d.x->>'co', ''), hc.check_out_time),
          description           = COALESCE(NULLIF(d.x->>'desc', ''), hc.description),
          amenity_groups        = CASE WHEN jsonb_array_length(d.x->'ag') > 0 THEN d.x->'ag' ELSE hc.amenity_groups END,
          images                = CASE WHEN jsonb_array_length(d.x->'imgs') > 0
                                       THEN ARRAY(SELECT jsonb_array_elements_text(d.x->'imgs'))
                                       ELSE hc.images END,
          serp_filters          = ARRAY(SELECT jsonb_array_elements_text(d.x->'sf')),
          metapolicy_struct     = CASE WHEN d.x->'mp' IS NOT NULL AND d.x->>'mp' != 'null' THEN d.x->'mp' ELSE hc.metapolicy_struct END,
          metapolicy_extra_info = COALESCE(NULLIF(d.x->>'mpe', ''), hc.metapolicy_extra_info)
      FROM unnest(
        ${sql.array(batch.map(r => r.hid))}::text[],
        ${sql.array(batch.map(r => r.slug))}::text[],
        ${sql.array(batch.map(r => r.rg))}::text[],
        ${sql.array(batch.map(r => r.x))}::jsonb[]
      ) AS d(hotel_id, slug, rg, x)
      WHERE hc.hotel_id = d.hotel_id
    `;
    stats.written += batch.length;
  } catch (e) {
    for (const r of batch) {
      try {
        await sql`
          UPDATE hotel_content
          SET room_groups           = ${r.rg}::jsonb,
              ratehawk_hid          = COALESCE(ratehawk_hid, ${r.slug}),
              room_groups_seeded_at = NOW(),
              check_in_time         = COALESCE(NULLIF(${r.x}::jsonb->>'ci', ''), check_in_time),
              check_out_time        = COALESCE(NULLIF(${r.x}::jsonb->>'co', ''), check_out_time),
              description           = COALESCE(NULLIF(${r.x}::jsonb->>'desc', ''), description),
              amenity_groups        = CASE WHEN jsonb_array_length(${r.x}::jsonb->'ag') > 0 THEN ${r.x}::jsonb->'ag' ELSE amenity_groups END,
              images                = CASE WHEN jsonb_array_length(${r.x}::jsonb->'imgs') > 0
                                           THEN ARRAY(SELECT jsonb_array_elements_text(${r.x}::jsonb->'imgs'))
                                           ELSE images END,
              serp_filters          = ARRAY(SELECT jsonb_array_elements_text(${r.x}::jsonb->'sf')),
              metapolicy_struct     = CASE WHEN ${r.x}::jsonb->'mp' IS NOT NULL AND ${r.x}::jsonb->>'mp' != 'null' THEN ${r.x}::jsonb->'mp' ELSE metapolicy_struct END,
              metapolicy_extra_info = COALESCE(NULLIF(${r.x}::jsonb->>'mpe', ''), metapolicy_extra_info)
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

    const extra = {
      ci:  hotel.check_in_time  ?? null,
      co:  hotel.check_out_time ?? null,
      desc: parseDescription(hotel.description_struct) ?? hotel.description ?? null,
      ag:  parseAmenityGroups(hotel.amenity_groups),
      imgs: parseHotelImages(hotel.images),
      sf:  Array.isArray(hotel.serp_filters) ? hotel.serp_filters : [],
      mp:  hotel.metapolicy_struct ?? null,
      mpe: hotel.metapolicy_extra_info ?? null,
    };

    batch.push({ hid, slug, rg: JSON.stringify(groups), x: JSON.stringify(extra) });
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
