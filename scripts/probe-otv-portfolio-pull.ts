/**
 * What does a full OTV portfolio pull cost, and what does each extra field add?
 *
 * The estimate that first ruled this out — 40 hours — came from CONTEXT.md's measurement of
 * the *content* query, which asks for descriptions, media, amenities, contact details and
 * check-in schedules. The weekly CSV carries none of that. Asking only for the CSV's own
 * columns measured 15x cheaper, so the rest of the field list is worth pricing individually
 * rather than treating "the content query" as one indivisible cost.
 *
 * Read-only: it pages through a few hundred hotels per field set and writes nothing.
 *
 *   npx tsx scripts/probe-otv-portfolio-pull.ts [pages]
 */

import 'dotenv/config';
import { tgxGraphQL, getTgxConfig } from '@/lib/server/stays/travelgatex/client';

const TOTAL     = 1_238_313;
const PAGE_SIZE = 500;   // asking for more is ignored; the API caps a page here
const PAGES     = Number(process.argv[2] ?? 3);

/** Each set is the one before it plus the field named, so the delta is the field's price. */
const FIELD_SETS: { name: string; fields: string }[] = [
    {
        name: 'csv columns',
        fields: `code hotelName categoryCode
                 location { coordinates { latitude longitude } address city country }
                 giataData { id }`,
    },
    {
        name: '+ medias',
        fields: `code hotelName categoryCode
                 location { coordinates { latitude longitude } address city country }
                 giataData { id }
                 medias { url type order }`,
    },
    {
        name: '+ descriptions',
        fields: `code hotelName categoryCode
                 location { coordinates { latitude longitude } address city country }
                 giataData { id }
                 medias { url type order }
                 descriptions { type texts { language text } }`,
    },
];

const query = (fields: string) => `
query TgxHotelList($criteria: HotelXHotelListInput!, $token: String) {
  hotelX {
    hotels(criteria: $criteria, token: $token) {
      token
      edges { node { hotelData { ${fields} } } }
    }
  }
}`;

async function measure(name: string, fields: string) {
    const cfg = getTgxConfig();
    let token: string | null = null;
    let hotels = 0, bytes = 0, withMedia = 0, ms = 0;

    for (let page = 1; page <= PAGES; page++) {
        const t0 = Date.now();
        const res: any = await tgxGraphQL(
            query(fields),
            { criteria: { access: cfg.accessCode, maxSize: PAGE_SIZE }, ...(token ? { token } : {}) },
            180_000,
        );
        ms += Date.now() - t0;

        const list  = res?.data?.hotelX?.hotels;
        const edges = list?.edges ?? [];
        hotels += edges.length;
        bytes  += JSON.stringify(res).length;
        withMedia += edges.filter((e: any) => (e?.node?.hotelData?.medias ?? []).length > 0).length;
        token = list?.token ?? null;
        if (!token) break;
    }

    const perHotel = ms / Math.max(1, hotels);
    const hours    = (perHotel * TOTAL) / 1000 / 3600;
    const full     = hours < 1 ? `${(hours * 60).toFixed(0)} min` : `${hours.toFixed(1)} h`;

    console.log(`  ${name.padEnd(16)} ${String(hotels).padStart(5)} hotels  ` +
                `${perHotel.toFixed(2).padStart(6)} ms/hotel  ` +
                `${(bytes / 1024 / 1024).toFixed(1).padStart(5)} MB  ` +
                `full pull ${full.padStart(8)}` +
                (withMedia ? `   (${withMedia} had photos)` : ''));
    return hours;
}

async function main() {
    console.log(`\naccess ${getTgxConfig().accessCode} — ${PAGES} pages of ${PAGE_SIZE} per field set\n`);
    for (const { name, fields } of FIELD_SETS) await measure(name, fields);
    console.log(`\n  The ETG dump workflow already budgets 6 hours, so anything under that is schedulable.\n`);
}

main().catch((e) => { console.error('probe failed:', e?.message ?? e); process.exit(1); });
