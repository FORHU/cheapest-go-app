/**
 * C1 (hotel search) against a running api-v2 on :4000.
 *
 * What this checks is not that search works — it is the rules a search has to keep:
 * that a rate is asked of the supplier every time rather than replayed, that a hotel
 * in another country is not returned for this one, that a territory's hotels can be
 * found at all, and that a stay nobody can book is refused rather than sent on.
 *
 * Read-only: it searches and reads, it books nothing.
 *
 *   node scratch/smoke-v2-c1-search.mjs
 */
import { execFileSync } from 'child_process';

const API = 'http://localhost:4000/api/v2';
let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures++;
};

const sql = (statement) => execFileSync('docker', [
    'exec', 'cheapestgo-api-v2-postgres-1',
    'psql', '-U', 'cheapestgo', '-d', 'cheapestgo', '-tAc', statement,
], { encoding: 'utf8' }).trim();

const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
};

const post = (path, body) => fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

// ── A stay nobody can book is refused before it reaches a supplier.
const reversed = await post('/hotels/search', {
    destination: 'Seoul', checkIn: day(10), checkOut: day(8), adults: 2,
});
check('a check-out before the check-in is refused', reversed.status === 400, String(reversed.status));

const sameDay = await post('/hotels/search', {
    destination: 'Seoul', checkIn: day(10), checkOut: day(10), adults: 2,
});
check('so is a check-out on the check-in', sameDay.status === 400, String(sameDay.status));

const streamReversed = await post('/hotels/search/stream', {
    cityName: 'Seoul', countryCode: 'KR', checkin: day(10), checkout: day(8),
});
check('the stream refuses it too, before it opens', streamReversed.status === 400,
    `${streamReversed.status} ${streamReversed.headers.get('content-type')}`);

// ── Nothing is replayed from an earlier search.
check('no search result cache is written', sql(`SELECT count(*) FROM hotel_search_cache`) === '0',
    `${sql(`SELECT count(*) FROM hotel_search_cache`)} rows`);

// ── A territory's hotels are found under the parent's code they are stored with.
const hkStored = sql(`SELECT DISTINCT country FROM hotel_content WHERE LOWER(city) = 'hong kong' LIMIT 3`);
const hkCount = await (await fetch(`${API}/hotels/count?city=Hong Kong&country=HK`)).json().catch(() => ({}));
check('Hong Kong reports the hotels it stocks', Number(hkCount.count ?? 0) > 0,
    `count=${hkCount.count}, stored under ${hkStored.split('\n').join('/')}`);

const cnCount = await (await fetch(`${API}/hotels/count?city=Shenzhen&country=CN`)).json().catch(() => ({}));
check('and Shenzhen is still its own city', typeof cnCount.count === 'number', `count=${cnCount.count}`);

// ── A destination search ranks a place we stock.
const suggestions = await (await fetch(`${API}/hotels/destinations?query=hong kong`)).json().catch(() => ({}));
const hk = (suggestions.data ?? []).find(d => /hong kong/i.test(d.title ?? ''));
check('Hong Kong is offered as a destination', !!hk, JSON.stringify(hk ?? {}).slice(0, 80));

// ── A live search answers, and answers for the country asked about.
const live = await post('/hotels/search', {
    destination: 'Cebu City', countryCode: 'PH', checkIn: day(21), checkOut: day(23), adults: 2,
});
const liveBody = await live.json().catch(() => ({}));
const hotels = liveBody.data ?? liveBody.hotels ?? [];
check('a live city search answers', live.ok, String(live.status));
check('and returns hotels', Array.isArray(hotels) && hotels.length > 0, `${hotels.length} hotels`);

const wrongCountry = hotels.filter(h => h.country && !['PH', ''].includes(String(h.country).toUpperCase()));
check('none of them is in another country', wrongCountry.length === 0,
    wrongCountry.slice(0, 3).map(h => `${h.name}=${h.country}`).join(', '));

// ── The card payload carries only what a card renders.
const card = hotels[0] ?? {};
check('a search card carries no description', !card.description, String(card.description ?? '').slice(0, 40));
check('and no amenity list', !card.amenities?.length, `${card.amenities?.length ?? 0} amenities`);
check('and one image, not the whole set', (card.images?.length ?? 0) <= 1, `${card.images?.length ?? 0} images`);

// ── The supplier-facing routes are rate limited.
const limited = await fetch(`${API}/hotels/destinations?query=seoul`);
check('search routes carry a rate limit', !!limited.headers.get('ratelimit-limit') || !!limited.headers.get('x-ratelimit-limit'),
    limited.headers.get('ratelimit-limit') ?? limited.headers.get('x-ratelimit-limit') ?? 'no header');


// ── A territory search keeps to its own side of the border.
// Central Hong Kong. A 50km circle from here takes in Shenzhen, Dongguan and Zhuhai.
const hkStream = await post('/hotels/search/stream', {
    cityName: 'Hong Kong', countryCode: 'HK', lat: 22.2820, lng: 114.1588,
    checkin: day(21), checkout: day(23),
});
const hkText = await hkStream.text();
const catalogChunk = hkText
    .split(/\r?\n/)
    .filter(line => line.startsWith('data: '))
    .map(line => line.slice(6))
    .find(line => line.includes('"source":"catalog"'));
const hkHotels = catalogChunk ? (JSON.parse(catalogChunk).data ?? []) : [];
check('a Hong Kong search returns a catalog', hkHotels.length > 0, `${hkHotels.length} hotels`);

const mainland = hkHotels.filter(h => String(h.country ?? '').toUpperCase() === 'CN');
check('and none of it is across the border in China', mainland.length === 0,
    mainland.slice(0, 3).map(h => `${h.name} (${h.city})`).join(', '));
check('its hotels are reported as Hong Kong, not CN',
    hkHotels.every(h => ['HK', ''].includes(String(h.country ?? '').toUpperCase())),
    [...new Set(hkHotels.map(h => h.country))].join('/'));

// ── A property page names the country the hotel is really in.
const hkId = hkHotels[0]?.hotelId ?? hkHotels[0]?.id;
if (hkId) {
    const property = await (await fetch(`${API}/hotels/property/${hkId}`)).json().catch(() => ({}));
    check('a Hong Kong property page says HK', String(property.content?.country ?? '').toUpperCase() === 'HK',
        `${property.content?.city}, ${property.content?.country}`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
