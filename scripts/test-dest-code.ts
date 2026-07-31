import 'dotenv/config';
import { tgxGraphQL, getTgxConfig } from '../src/lib/server/stays/travelgatex/client';
import { getSqlAdmin } from '../src/lib/db/postgres';

// Inspect full HotelData schema
const HOTELS_QUERY = `
query TgxHotelContent($criteria: HotelXHotelListInput!) {
  hotelX {
    hotels(criteria: $criteria) {
      edges {
        node {
          hotelData {
            code
            hotelName
            location {
              city
              zipCode
              address
            }
          }
        }
      }
    }
  }
}`;

// Try to search by destination code to validate a known Bangkok code
// Bangkok TGX destination code candidates: 504948 (from search.ts comment), or similar
const DEST_SEARCH_QUERY = `
query TgxDestSearch($criteria: HotelXSearchCriteriaInput!, $settings: HotelSettingsInput) {
  hotelX {
    search(criteria: $criteria, settings: $settings) {
      options { hotelCode status paymentType price { net gross currency } }
      errors { code type description }
    }
  }
}`;

async function main() {
    const cfg = getTgxConfig();
    console.log('accessCode:', cfg.accessCode);

    const bangkokHotelIds = ['13757443', '13378646', '13386270'];
    console.log('\n=== Hotels Content API: Bangkok hotels (location) ===');
    const result = await tgxGraphQL(HOTELS_QUERY, {
        criteria: { access: cfg.accessCode, hotelCodes: bangkokHotelIds, maxSize: 5 },
    }, 20_000);
    const edges = result?.data?.hotelX?.hotels?.edges ?? [];
    for (const edge of edges) {
        const hd = edge?.node?.hotelData;
        console.log(`  code=${hd?.code} | name=${hd?.hotelName?.slice(0, 30)} | city=${hd?.location?.city} | zip=${hd?.location?.zipCode}`);
    }

    // Check tgx_destination_cache
    const sql = getSqlAdmin();
    const cached = await sql`SELECT city_key, destination_code FROM tgx_destination_cache LIMIT 20`;
    console.log('\ntgx_destination_cache:', cached.length, 'rows');
    for (const r of cached) console.log(`  ${r.city_key} → ${r.destination_code}`);

    // Check hotel_search_cache
    const searchCache = await sql`SELECT cache_key, created_at FROM hotel_search_cache LIMIT 5`;
    console.log('\nhotel_search_cache:', searchCache.length, 'rows');

    await sql.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
