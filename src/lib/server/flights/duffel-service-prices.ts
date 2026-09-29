/**
 * Duffel's own prices for the seats and bags a traveller picked.
 *
 * The order payment must equal fare + services to the cent, or Duffel rejects it with
 * `payment_amount_does_not_match_order_amount`. The book routes price services from
 * `rawOffer.available_services`, but the offer they hold is a search result and Duffel
 * never includes services on those — so every bag and paid seat was priced at zero and
 * every such order was refused. Bags are only quoted on a single-offer GET with
 * `return_available_services`; seats are only quoted in the seat map.
 *
 * Returns the offer with `available_services` filled from those two sources, so the
 * existing pricing code reads real prices. Nothing selected → the offer, untouched.
 */

const DUFFEL = 'https://api.duffel.com';

async function duffelGet(path: string, token: string): Promise<any> {
    const res = await fetch(`${DUFFEL}${path}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Duffel-Version': 'v2',
            'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Duffel ${path.split('?')[0]} ${res.status}`);
    return (await res.json()).data;
}

function seatServices(seatMaps: any[]): any[] {
    const out: any[] = [];
    for (const map of seatMaps ?? []) {
        for (const cabin of map.cabins ?? []) {
            for (const row of cabin.rows ?? []) {
                for (const section of row.sections ?? []) {
                    for (const el of section.elements ?? []) {
                        out.push(...(el.available_services ?? []));
                    }
                }
            }
        }
    }
    return out;
}

export async function withDuffelServicePrices(
    rawOffer: any,
    seatServiceIds: string[] | undefined,
    bagServiceIds: string[] | undefined,
    token: string,
): Promise<any> {
    const wantSeats = (seatServiceIds?.length ?? 0) > 0;
    const wantBags = (bagServiceIds?.length ?? 0) > 0;
    if (!wantSeats && !wantBags) return rawOffer;

    const id = encodeURIComponent(rawOffer.id);
    try {
        const [offer, seatMaps] = await Promise.all([
            wantBags ? duffelGet(`/air/offers/${id}?return_available_services=true`, token) : null,
            wantSeats ? duffelGet(`/air/seat_maps?offer_id=${id}`, token) : null,
        ]);
        return {
            ...rawOffer,
            available_services: [
                ...(offer?.available_services ?? []),
                ...(seatMaps ? seatServices(seatMaps) : []),
            ],
        };
    } catch (err: any) {
        console.error(`[duffel-service-prices] ${rawOffer.id}: ${err.message}`);
        throw new Error('We could not confirm the price of your selected seats or bags. Please try again.');
    }
}
