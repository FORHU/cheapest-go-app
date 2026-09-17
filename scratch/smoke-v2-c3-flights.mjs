/**
 * C3 (flights) against a running api-v2 on :4000.
 *
 * **Books nothing.** Duffel is in test mode locally, and even so nothing here places an order:
 * it searches, prices an offer, and asks for a replacement offer. All three are quotes.
 *
 *   node scratch/smoke-v2-c3-flights.mjs
 */
const API = 'http://localhost:4000/api/v2';
let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures++;
};

const post = (path, body) => fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
};

// ── A search, live every time.
const searchBody = {
    origin: 'LHR', destination: 'JFK', departureDate: day(30),
    adults: 1, children: 0, infants: 0, cabinClass: 'economy', tripType: 'one-way',
};

const first = await post('/flights/search', searchBody);
const firstBody = await first.json().catch(() => ({}));
check('a flight search answers', first.ok, `${first.status} ${JSON.stringify(firstBody).slice(0, 60)}`);
check('it reports which providers failed, even when none did',
    Array.isArray(firstBody.failedProviders), JSON.stringify(firstBody.failedProviders));
check('and tells an outage apart from an empty route',
    typeof firstBody.providersFailed === 'boolean',
    `providersFailed=${firstBody.providersFailed}, offers=${firstBody.offers?.length}`);

const offers = firstBody.offers ?? [];
check('the search returns offers', offers.length > 0, `${offers.length} offers`);

// ── Nothing is replayed: a second identical search hits the provider again.
const second = await post('/flights/search', searchBody);
const secondBody = await second.json().catch(() => ({}));
const firstIds = new Set(offers.map(o => o.offerId));
const secondIds = (secondBody.offers ?? []).map(o => o.offerId);
check('a second identical search is live, not replayed from the cache',
    secondIds.length > 0 && secondIds.some(id => !firstIds.has(id)),
    `${secondIds.filter(id => !firstIds.has(id)).length} of ${secondIds.length} offer ids are new`);

const offer = offers[0];
if (offer) {
    const raw = offer._rawOffer ?? offer.rawOffer;

    // ── The fare is checked before anyone is sent to pay.
    const revalidated = await post('/flights/revalidate', { provider: 'duffel', flightPayload: offer });
    const revalidatedBody = await revalidated.json().catch(() => ({}));
    check('an offer can be priced before checkout', revalidated.ok && revalidatedBody.success === true,
        `${revalidated.status} ${JSON.stringify(revalidatedBody).slice(0, 80)}`);
    check('and it says whether the traveller has to confirm a change',
        typeof revalidatedBody.priceChanged === 'boolean', String(revalidatedBody.priceChanged));
    // The price action does not apply to every offer — Duffel answers some with a 404, and
    // that soft-passes deliberately so a provider quirk cannot block a booking. Either the
    // conditions came back, or the check passed the offer through untouched.
    check('the fare conditions come back when the airline priced it',
        revalidatedBody.farePolicy === undefined
            ? revalidatedBody.priceChanged === false
            : revalidatedBody.farePolicy.policyVersion === 'revalidated',
        revalidatedBody.farePolicy ? JSON.stringify(revalidatedBody.farePolicy).slice(0, 70) : 'soft-passed (offer not priceable)');

    const badProvider = await post('/flights/revalidate', { provider: 'amadeus', flightPayload: offer });
    check('a provider it cannot price is refused, not soft-passed', badProvider.status === 400, String(badProvider.status));

    // ── A replacement offer is the same journey or none at all.
    if (raw?.slices) {
        const refreshed = await post('/flights/offer-refresh', { rawOffer: raw });
        const refreshedBody = await refreshed.json().catch(() => ({}));
        check('offer-refresh answers without an error status', refreshed.ok, String(refreshed.status));

        if (refreshedBody.success) {
            const chosenSeg = raw.slices[0].segments[0];
            const newSeg = refreshedBody.newOffer?.segments?.[0] ?? refreshedBody.newOffer?.slices?.[0]?.segments?.[0];
            const sameFlight = String(newSeg?.flightNumber ?? newSeg?.marketing_carrier_flight_number ?? '')
                .includes(String(chosenSeg.marketing_carrier_flight_number ?? ''));
            check('a replacement offer is the same flight the traveller chose', sameFlight,
                `${chosenSeg.marketing_carrier?.iata_code}${chosenSeg.marketing_carrier_flight_number} → ${newSeg?.flightNumber ?? '?'}`);
        } else {
            check('or it reports the flight unavailable rather than substituting another',
                ['no_same_itinerary', 'no_offers', 'upstream_error'].includes(refreshedBody.reason),
                String(refreshedBody.reason));
        }
    }
}

// ── A booking needs an account.
const anonymous = await post('/flights/book', { provider: 'duffel', flight: {} });
check('booking refuses an anonymous caller', anonymous.status === 401, String(anonymous.status));

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
