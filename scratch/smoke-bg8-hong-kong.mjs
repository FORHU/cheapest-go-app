/**
 * BG-8 end to end against the LOCAL dev server (:3000): pick the "Hong Kong" city suggestion
 * the way the search bar does, run the hotel search stream with it, and report the rung, the
 * countries and cities of the hotels that come back, and any Shenzhen hotel among them.
 *   node scratch/smoke-bg8-hong-kong.mjs
 */
const BASE = 'http://localhost:3000';
const headers = { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE };

const q = `Hong Kong ${Date.now() % 1000 === 0 ? '' : ' '}`.trimEnd() + ' '.repeat(Date.now() % 3); // dodge the 5-min cache
const auto = await (await fetch(`${BASE}/api/autocomplete`, { method: 'POST', headers, body: JSON.stringify({ query: q, locale: 'en' }) })).json();
const city = (auto.data ?? []).find(s => s.type === 'city' && s.countryCode === 'HK');
console.log('suggestion:', city && { rung: city.rung, title: city.title, countryCode: city.countryCode, bbox: city.bbox });

const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const res = await fetch(`${BASE}/api/search/stream`, {
    method: 'POST', headers,
    body: JSON.stringify({ destination: city.title, cityName: city.title, countryCode: city.countryCode, rung: city.rung, lat: city.lat, lng: city.lng, bbox: city.bbox?.join(','), checkin: inDays(21), checkout: inDays(23), adults: 2 }),
});
console.log('stream status', res.status);
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
const tally = (key) => Object.entries(hotels.reduce((m, h) => { const k = h[key] || '(none)'; m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log('hotels:', hotels.length);
console.log('countries:', tally('country'));
console.log('cities:', tally('city'));
const shenzhen = hotels.filter(h => /shenzhen/i.test(`${h.city} ${h.address}`));
console.log('shenzhen hotels:', shenzhen.length, shenzhen.slice(0, 3).map(h => h.name));
