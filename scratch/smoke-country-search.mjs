/**
 * End-to-end destination search against the LOCAL dev server (:3000): pick the city
 * suggestion the way the search bar does, run the hotel search stream with it, and report
 * the rung, the countries and cities of the hotels that come back, and any hotels matching
 * FOREIGN (places that should not be there).
 *
 *   node scratch/smoke-country-search.mjs                                   (Hong Kong vs Shenzhen)
 *   $env:DEST='Tumon'; $env:CC='GU'; $env:FOREIGN='saipan'; node scratch/smoke-country-search.mjs
 */
const BASE = 'http://localhost:3000';
const headers = { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE };
const DEST = process.env.DEST ?? 'Hong Kong';
const CC = process.env.CC ?? (DEST === 'Hong Kong' ? 'HK' : '');
const FOREIGN = process.env.FOREIGN ?? 'shenzhen';

// Trailing spaces make a fresh cache key for the 5-minute autocomplete cache.
const q = DEST + ' '.repeat(1 + (Date.now() % 4));
const auto = await (await fetch(`${BASE}/api/autocomplete`, { method: 'POST', headers, body: JSON.stringify({ query: q, locale: 'en' }) })).json();
const city = (auto.data ?? []).find(s => s.type === 'city' && (!CC || s.countryCode === CC));
if (!city) { console.log('no city suggestion', JSON.stringify(auto.data?.slice(0, 3))); process.exit(1); }
console.log('suggestion:', { rung: city.rung, title: city.title, countryCode: city.countryCode, id: city.id });

const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const res = await fetch(`${BASE}/api/search/stream`, {
    method: 'POST', headers,
    body: JSON.stringify({ destination: city.title, cityName: city.title, countryCode: city.countryCode, rung: city.rung, lat: city.lat, lng: city.lng, bbox: city.bbox?.join(','), checkin: inDays(21), checkout: inDays(23), adults: 2 }),
});
const text = await res.text();
const hotels = [];
for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
        const o = JSON.parse(line);
        const list = o.hotels ?? o.data?.hotels ?? (Array.isArray(o.data) ? o.data : null) ?? (o.hotel ? [o.hotel] : null);
        if (Array.isArray(list)) hotels.push(...list);
    } catch {}
}
const tally = (key) => Object.entries(hotels.reduce((m, h) => { const k = h[key] || '(none)'; m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
console.log(`status ${res.status}, hotels: ${hotels.length}`);
console.log('countries:', JSON.stringify(tally('country')));
console.log('cities:', JSON.stringify(tally('city')));
const foreign = hotels.filter(h => new RegExp(FOREIGN, 'i').test(`${h.city} ${h.location ?? ''} ${h.address ?? ''}`));
console.log(`matching /${FOREIGN}/: ${foreign.length}`, foreign.slice(0, 3).map(h => h.name));
