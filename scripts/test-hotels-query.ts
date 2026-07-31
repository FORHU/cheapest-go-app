import 'dotenv/config';
import { tgxGraphQL, getTgxConfig } from '../src/lib/server/stays/travelgatex/client';

const QUERY = `
query TgxHotelContent($criteria: HotelXHotelListInput!) {
  hotelX {
    hotels(criteria: $criteria) {
      edges {
        node {
          hotelData {
            code
            hotelName
            medias { url type }
          }
        }
      }
    }
  }
}`;

// IDs that TGX search actually returns for Bangkok Aug 15-18
const TGX_SEARCH_IDS = ['13757443', '13378646', '13386270', '13921011', '9891499'];

async function runQuery(label: string, hotelCodes: string[], maxSize: number) {
    const cfg = getTgxConfig();
    console.log(`\n=== ${label} ===`);
    console.log(`Querying ${hotelCodes.length} IDs with maxSize=${maxSize}`);
    try {
        const result = await tgxGraphQL(QUERY, {
            criteria: { access: cfg.accessCode, hotelCodes, maxSize },
        }, 15_000);
        const edges = result?.data?.hotelX?.hotels?.edges ?? [];
        const errors = result?.errors ?? [];
        const returnedIds = edges.map((e: any) => e?.node?.hotelData?.code);
        const requestedSet = new Set(hotelCodes);
        const matched = returnedIds.filter((id: string) => requestedSet.has(id));
        console.log(`Returned: ${edges.length} hotels | Matched our query: ${matched.length}/${hotelCodes.length}`);
        console.log(`Returned IDs (first 5): ${returnedIds.slice(0, 5).join(', ')}`);
        console.log(`Matched IDs: ${matched.join(', ')}`);
        if (errors.length) console.log('GraphQL errors:', JSON.stringify(errors.slice(0, 2)));
        for (const edge of edges.slice(0, 3)) {
            const hd = edge?.node?.hotelData;
            const mediaCount = hd?.medias?.length ?? 0;
            const types = [...new Set((hd?.medias ?? []).map((m: any) => m.type || 'null'))].join(', ');
            console.log(`  code=${hd?.code} | ${hd?.hotelName?.slice(0, 40)} | medias=${mediaCount} [${types}]`);
        }
    } catch (e: any) {
        console.log(`ERROR: ${e.message?.slice(0, 300)}`);
    }
}

async function main() {
    const cfg = getTgxConfig();
    console.log('Config:', { accessCode: cfg.accessCode, context: cfg.context, client: cfg.client });

    // Test 1: small list, maxSize matching count
    await runQuery('5 TGX search IDs, maxSize=5', TGX_SEARCH_IDS, 5);

    // Test 2: same IDs, maxSize=200
    await runQuery('5 TGX search IDs, maxSize=200', TGX_SEARCH_IDS, 200);

    // Test 3: no hotelCodes, see what comes back
    await runQuery('No hotelCodes, maxSize=5', [], 5);
}

main().catch(e => { console.error(e); process.exit(1); });
