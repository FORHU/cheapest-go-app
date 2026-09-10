/**
 * The reported bug, end to end: does the search price match the property page's cheapest room?
 *
 * Takes the cheapest hotel from a 2-night search, then asks the same app for that hotel's
 * rooms on the same dates. Before the fix the first number was half the second.
 */
const host = process.argv[2] ?? 'localhost:3099';
const checkin = '2026-10-10', checkout = '2026-10-12', nights = 2;

const res = await fetch(`http://${host}/api/search/stream`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        destination: 'Alabang, Philippines', cityName: 'Alabang, Philippines',
        destinationType: 'city', country: 'Philippines', checkin, checkout, adults: 2,
    }),
});
const reader = res.body.getReader(); const dec = new TextDecoder();
let buf = ''; const priced = new Map();
for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop() ?? '';
    for (const l of lines) {
        if (!l.trim()) continue; let m; try { m = JSON.parse(l); } catch { continue; }
        if (Array.isArray(m.data)) for (const h of m.data) {
            const id = h?.hotelId ?? h?.id;
            if (h && typeof h.price === 'number' && h.price > 0 && id) {
                priced.set(id, { id, price: h.price, currency: h.currency, name: h.name ?? priced.get(id)?.name });
            }
        }
    }
}
const rows = [...priced.values()].sort((a, b) => a.price - b.price);
if (!rows.length) { console.log('no priced hotels'); process.exit(0); }

console.log('search stream, cheapest three (per night):');
for (const r of rows.slice(0, 3)) console.log(`  ${String(r.price.toFixed(2)).padStart(10)} ${r.currency}  ${r.name ?? r.id}`);

const target = rows[0];
console.log(`\nchecking "${target.name ?? target.id}" against its property page…`);

const rooms = await fetch(
    `http://${host}/api/hotels/${encodeURIComponent(target.id)}/rooms?checkin=${checkin}&checkout=${checkout}&adults=2`,
).then(r => r.ok ? r.json() : null).catch(() => null);

if (!rooms) { console.log('  rooms endpoint not reachable under this path — compare by hand in the UI'); process.exit(0); }
const prices = JSON.stringify(rooms).match(/"(?:price|amount|gross)":\s*([0-9.]+)/g) ?? [];
const nums = prices.map(p => parseFloat(p.split(':')[1])).filter(n => n > 0).sort((a, b) => a - b);
if (!nums.length) { console.log('  no room prices found in the response'); process.exit(0); }

const cheapestRoomStay = nums[0];
console.log(`  cheapest room figure: ${cheapestRoomStay}`);
console.log(`  as a nightly rate:    ${(cheapestRoomStay / nights).toFixed(2)}`);
console.log(`  search said:          ${target.price.toFixed(2)}`);
