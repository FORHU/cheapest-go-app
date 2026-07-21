/**
 * Downloads curated destination images from Wikimedia Commons.
 * Run once: node scripts/download-destination-images.mjs
 * Images are saved to public/images/destinations/{slug}.jpg
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'images', 'destinations');

const DESTINATIONS = [
  // ── Cities ────────────────────────────────────────────────────────────────
  { slug: 'tokyo',          query: 'Tokyo skyline Shinjuku Japan' },
  { slug: 'paris',          query: 'Paris Eiffel Tower France' },
  { slug: 'new-york',       query: 'New York City Manhattan skyline' },
  { slug: 'london',         query: 'London Big Ben Thames' },
  { slug: 'bangkok',        query: 'Bangkok Wat Arun Thailand' },
  { slug: 'singapore',      query: 'Singapore Marina Bay Sands night' },
  { slug: 'seoul',          query: 'Seoul Gyeongbokgung Palace South Korea' },
  { slug: 'dubai',          query: 'Dubai Burj Khalifa skyline' },
  { slug: 'kuala-lumpur',   query: 'Kuala Lumpur Petronas Towers Malaysia' },
  { slug: 'barcelona',      query: 'Barcelona Sagrada Familia Spain' },
  { slug: 'amsterdam',      query: 'Amsterdam canal Netherlands' },
  { slug: 'hong-kong',      query: 'Hong Kong skyline night Victoria Harbour' },
  { slug: 'los-angeles',    query: 'Los Angeles Hollywood California' },
  { slug: 'manila',         query: 'Manila Philippines skyline bay' },
  { slug: 'cebu',           query: 'Cebu City Philippines' },
  { slug: 'davao',          query: 'Davao City Philippines' },
  { slug: 'iloilo',         query: 'Iloilo City Philippines' },
  { slug: 'clark',          query: 'Pampanga Philippines' },
  { slug: 'osaka',          query: 'Osaka Castle Japan' },
  { slug: 'fukuoka',        query: 'Fukuoka Japan' },
  { slug: 'sapporo',        query: 'Sapporo Hokkaido Japan snow' },
  { slug: 'nagoya',         query: 'Nagoya Castle Japan' },
  { slug: 'okinawa',        query: 'Okinawa Prefecture Ryukyu Japan' },
  { slug: 'taipei',         query: 'Taipei 101 Taiwan night' },
  { slug: 'beijing',        query: 'Beijing Forbidden City China' },
  { slug: 'shanghai',       query: 'Shanghai Pudong skyline China' },
  { slug: 'sydney',         query: 'Sydney Opera House Australia harbour' },
  { slug: 'melbourne',      query: 'Melbourne Australia skyline' },
  { slug: 'abu-dhabi',      query: 'Abu Dhabi Sheikh Zayed Mosque UAE' },
  { slug: 'doha',           query: 'Doha Qatar skyline' },
  { slug: 'kuwait-city',    query: 'Kuwait Towers Kuwait City' },
  { slug: 'riyadh',         query: 'Riyadh Saudi Arabia skyline' },
  { slug: 'jeddah',         query: 'Jeddah Saudi Arabia' },
  { slug: 'muscat',         query: 'Muscat cityscape Oman Arabian Sea' },
  { slug: 'rome',           query: 'Rome Colosseum Italy' },
  { slug: 'milan',          query: 'Milan Duomo Cathedral Italy' },
  { slug: 'frankfurt',      query: 'Frankfurt Germany skyline' },
  { slug: 'istanbul',       query: 'Istanbul Hagia Sophia Turkey' },
  { slug: 'ho-chi-minh',    query: 'Ho Chi Minh City Saigon Vietnam skyline' },
  { slug: 'hanoi',          query: 'Hanoi Old Quarter Vietnam' },
  { slug: 'jakarta',        query: 'Jakarta Indonesia skyline' },
  { slug: 'new-delhi',      query: 'New Delhi India Red Fort' },
  { slug: 'mumbai',         query: 'Mumbai Gateway of India' },
  { slug: 'colombo',        query: 'Colombo Sri Lanka' },
  { slug: 'san-francisco',  query: 'San Francisco Golden Gate Bridge' },
  { slug: 'chicago',        query: 'Chicago Illinois skyline Lake Michigan' },
  { slug: 'toronto',        query: 'Toronto Canada skyline CN Tower' },
  { slug: 'vancouver',      query: 'Vancouver Canada mountains skyline' },
  { slug: 'geneva',         query: 'Geneva Switzerland lake' },
  { slug: 'zurich',         query: 'Zurich Switzerland skyline' },
  { slug: 'madrid',         query: 'Madrid Spain Royal Palace' },
  { slug: 'nairobi',        query: 'Nairobi Kenya skyline' },
  { slug: 'macau',          query: 'Macau Ruins St Pauls' },
  { slug: 'mexico-city',    query: 'Mexico City Zocalo cathedral' },
  { slug: 'sao-paulo',      query: 'São Paulo Brazil skyline' },
  { slug: 'buenos-aires',   query: 'Buenos Aires Argentina obelisk' },
  { slug: 'santiago',       query: 'Santiago Chile Andes mountains' },
  { slug: 'bogota',         query: 'Bogotá city center Colombia urban' },
  { slug: 'fiji',           query: 'Fiji tropical island palm trees ocean' },
  { slug: 'guam',           query: 'Guam Tumon Bay beach resort' },

  // ── Attractions ───────────────────────────────────────────────────────────
  { slug: 'eiffel-tower',       query: 'Eiffel Tower Paris night' },
  { slug: 'colosseum',          query: 'Colosseum Rome Italy ancient' },
  { slug: 'machu-picchu',       query: 'Machu Picchu Peru Inca ruins' },
  { slug: 'santorini',          query: 'Santorini Oia village white buildings Greece' },
  { slug: 'bali',               query: 'Bali Indonesia rice terraces temple' },
  { slug: 'angkor-wat',         query: 'Angkor Wat temple complex Siem Reap reflection' },
  { slug: 'serengeti',          query: 'Serengeti National Park Tanzania lions' },
  { slug: 'grand-canyon',       query: 'Grand Canyon Arizona USA' },
  { slug: 'boracay',            query: 'Boracay White Beach Aklan tourism Philippines' },
  { slug: 'mount-fuji',         query: 'Mount Fuji Japan cherry blossom' },
  { slug: 'ha-long-bay',        query: 'Ha Long Bay Vietnam limestone karst' },
  { slug: 'taj-mahal',          query: 'Taj Mahal Agra India' },
  { slug: 'phuket',             query: 'Phuket Thailand beach ocean' },
  { slug: 'northern-lights',    query: 'Northern Lights aurora borealis Iceland' },
  { slug: 'pyramids-of-giza',   query: 'Pyramids Giza Egypt desert' },
  { slug: 'palawan',            query: 'Palawan Philippines El Nido lagoon' },
  { slug: 'amalfi-coast',       query: 'Amalfi Coast Italy cliffs sea' },
  { slug: 'great-barrier-reef', query: 'Great Barrier Reef Australia coral' },
  { slug: 'jeju-island',        query: 'Jeju Island South Korea Hallasan' },
  { slug: 'maldives',           query: 'Maldives archipelago South Asia island nation' },
  { slug: 'puerto-princesa',    query: 'Puerto Princesa Underground River Palawan' },
];

// ── Wikipedia Action API — generator=search + pageimages in one call ─────────
async function getWikimediaUrl(query) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: '5',
    prop: 'pageimages',
    pithumbsize: '800',   // 1200 causes 400 errors on Wikimedia CDN
    format: 'json',
  });

  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { 'User-Agent': 'cheapestgo-images/1.0 (one-time image downloader; contact: admin@cheapestgo.com)' },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    console.error(`    Wikipedia API returned ${res.status}`);
    return null;
  }
  const data = await res.json();

  if (data.error) {
    console.error(`    Wikipedia API error: ${data.error.info}`);
    return null;
  }

  const pages = Object.values(data.query?.pages ?? {});
  for (const page of pages) {
    if (page.thumbnail?.source) {
      // Use the URL exactly as Wikipedia returns it (already sized to pithumbsize)
      return page.thumbnail.source;
    }
  }
  return null;
}

async function downloadImage(url, filepath) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'cheapestgo-images/1.0 (one-time image downloader)' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const buffer = await res.arrayBuffer();
  await writeFile(filepath, Buffer.from(buffer));
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const dest of DESTINATIONS) {
    // Try .jpg first, then .png (Wikimedia serves both)
    const filepath = path.join(OUT_DIR, `${dest.slug}.jpg`);

    if (existsSync(filepath)) {
      console.log(`  ✓ ${dest.slug} (already exists)`);
      skipped++;
      continue;
    }

    process.stdout.write(`⬇  ${dest.slug}...`);

    try {
      const url = await getWikimediaUrl(dest.query);

      // Always delay after an API call — Wikimedia CDN rate-limits aggressive downloads
      await new Promise(r => setTimeout(r, 1500));

      if (!url) {
        console.log(` ✗ no image found`);
        failed++;
        continue;
      }

      await downloadImage(url, filepath);
      console.log(` ✓`);
      downloaded++;
    } catch (err) {
      console.log(` ✗ ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone — ${downloaded} downloaded, ${skipped} skipped, ${failed} failed.`);
  if (failed > 0) {
    console.log('Re-run the script to retry failed downloads.');
  }
}

main().catch(console.error);
