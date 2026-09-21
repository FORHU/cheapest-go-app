/**
 * Reading the OTV portfolio off a TravelGateX Hotels response.
 *
 * Kept apart from the sync script that uses it so it can be tested without a database and
 * without a supplier: the shape of the response is the part that quietly changes, and the
 * part where a mistake is invisible. The first version of the sync passed each *edge* where a
 * *node* was expected and dutifully imported nothing at all, reporting success.
 */

/** One hotel as OTV lists it — the Supplier-Owned Fields, and nothing else. */
export interface PortfolioHotel {
    code: string;
    name: string | null;
    country: string | null;
    city: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    stars: number;
    giata: string | null;
}

/** Empty and whitespace-only both mean the supplier said nothing. */
function text(v: unknown): string | null {
    const t = typeof v === 'string' ? v.trim() : '';
    return t || null;
}

/**
 * A coordinate, or null where there isn't one.
 *
 * Zero is treated as absent rather than as a place. Null Island is in the Gulf of Guinea, and
 * a hotel pinned there is a hotel drawn in the sea — but more to the point, a 0 that reaches
 * the update would be written over a coordinate we already hold and trust.
 */
function coordinate(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) && n !== 0 ? n : null;
}

/**
 * @param node  the `node` inside an edge, not the edge itself.
 */
export function parsePortfolioHotel(node: any): PortfolioHotel | null {
    const d = node?.hotelData;
    const code = String(d?.code ?? '').trim();
    if (!code) return null;

    const coords = d?.location?.coordinates;

    return {
        code,
        name:    text(d?.hotelName),
        country: text(d?.location?.country),
        city:    text(d?.location?.city),
        address: text(d?.location?.address),
        lat:     coordinate(coords?.latitude),
        lng:     coordinate(coords?.longitude),
        // 0 is OTV's "unrated", which is a gap in their data rather than a rating of zero.
        stars:   Number(d?.categoryCode) || 0,
        giata:   text(d?.giataData?.id),
    };
}

/** Every hotel in a page of edges, skipping any the supplier sent without a code. */
export function parsePortfolioPage(edges: any[]): PortfolioHotel[] {
    return (edges ?? [])
        .map(e => parsePortfolioHotel(e?.node))
        .filter((h): h is PortfolioHotel => h !== null);
}
