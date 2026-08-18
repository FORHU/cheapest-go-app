/**
 * Seed hotel_content.room_groups from ETG (WorldOTA) hotel/info endpoint.
 *
 * Only processes hotels that already have a ratehawk_hid slug — 752 rows.
 * Stores [{name, images}] per hotel; skips if no room has photos.
 *
 * Usage:
 *   node scripts/seed-room-groups.mjs              # all 752 hotels
 *   node scripts/seed-room-groups.mjs --limit 50   # first N
 *   node scripts/seed-room-groups.mjs --dry-run    # print counts only
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = new URL('..', import.meta.url).href;
const envLines = readFileSync(new URL('.env', ROOT), 'utf-8').replace(/\r/g, '').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const KEY_ID  = env.RATEHAWK_KEY_ID  || env.ETG_KEY_ID;
const API_KEY = env.RATEHAWK_API_KEY || env.ETG_API_KEY;
if (!KEY_ID || !API_KEY) { console.error('Missing RATEHAWK_KEY_ID / RATEHAWK_API_KEY in .env'); process.exit(1); }
const TOKEN = Buffer.from(`${KEY_ID}:${API_KEY}`).toString('base64');

const { default: postgres } = await import(new URL('node_modules/postgres/src/index.js', ROOT));
const sql = postgres(env.DATABASE_URL, { ssl: false, max: 3 });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArg = args.indexOf('--limit');
const LIMIT = limitArg !== -1 ? parseInt(args[limitArg + 1], 10) : null;
// --refresh-days N: also re-seed hotels older than N days (default: pending only)
const refreshDaysArg = args.indexOf('--refresh-days');
const REFRESH_DAYS = refreshDaysArg !== -1 ? parseInt(args[refreshDaysArg + 1], 10) : null;

const DELAY_MS = 1000;  // ~1 req/sec — conservative to avoid ETG 429

/** Replace WorldOTA CDN {size} placeholder with 1024x768 (matches existing hotel image format). */
function resolveImageUrl(url) {
  if (typeof url !== 'string') return null;
  return url.replace(/\{size\}/g, '1024x768');
}

async function fetchHotelInfo(hid) {
  const res = await fetch('https://api.worldota.net/api/b2b/v3/hotel/info/', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: hid, language: 'en' }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// Fetch hotels: pending (never seeded) first, then stale if --refresh-days provided
const staleFilter = REFRESH_DAYS
  ? sql`AND (room_groups = '[]'::jsonb OR room_groups_seeded_at < NOW() - INTERVAL '${sql.unsafe(String(REFRESH_DAYS))} days')`
  : sql`AND room_groups = '[]'::jsonb`;

let query = sql`
  SELECT hotel_id, ratehawk_hid
  FROM hotel_content
  WHERE ratehawk_hid IS NOT NULL AND ratehawk_hid != ''
    ${staleFilter}
  ORDER BY (room_groups = '[]'::jsonb) DESC, room_groups_seeded_at ASC NULLS FIRST
`;
if (LIMIT) query = sql`
  SELECT hotel_id, ratehawk_hid
  FROM hotel_content
  WHERE ratehawk_hid IS NOT NULL AND ratehawk_hid != ''
    ${staleFilter}
  ORDER BY (room_groups = '[]'::jsonb) DESC, room_groups_seeded_at ASC NULLS FIRST
  LIMIT ${LIMIT}
`;

const rows = await query;
console.log(`\nSeeding room_groups for ${rows.length} hotels (dry-run=${DRY_RUN})\n`);

let seeded = 0, skippedNoPhotos = 0, skippedError = 0;

for (let i = 0; i < rows.length; i++) {
  const { hotel_id, ratehawk_hid } = rows[i];

  try {
    const r = await fetchHotelInfo(ratehawk_hid);
    const d = r?.data;
    if (!d) { skippedError++; continue; }

    const roomGroups = (d.room_groups ?? [])
      .map(rg => ({
        name: rg.name ?? '',
        images: (rg.images ?? [])
          .map(img => resolveImageUrl(typeof img === 'string' ? img : img?.url ?? img?.src))
          .filter(Boolean)
          .slice(0, 10),
      }))
      .filter(rg => rg.name);

    const hasPhotos = roomGroups.some(rg => rg.images.length > 0);

    if (!hasPhotos) {
      skippedNoPhotos++;
      if (i % 50 === 0) process.stdout.write('.');
      await delay(DELAY_MS);
      continue;
    }

    if (!DRY_RUN) {
      await sql`
        UPDATE hotel_content
        SET room_groups           = ${sql.json(roomGroups)},
            room_groups_seeded_at = NOW()
        WHERE hotel_id = ${hotel_id}
      `;
    }

    seeded++;
    const groupCount = roomGroups.length;
    const imgTotal = roomGroups.reduce((s, rg) => s + rg.images.length, 0);
    console.log(`[${i + 1}/${rows.length}] ${ratehawk_hid}: ${groupCount} groups, ${imgTotal} imgs total${DRY_RUN ? ' (dry-run)' : ''}`);

  } catch (e) {
    skippedError++;
    console.warn(`  ❌ ${ratehawk_hid}: ${e.message?.slice(0, 80)}`);
  }

  await delay(DELAY_MS);
}

console.log(`\n─── Done ─────────────────────────`);
console.log(`  seeded:           ${seeded}`);
console.log(`  skipped (no img): ${skippedNoPhotos}`);
console.log(`  errors:           ${skippedError}`);

await sql.end();
