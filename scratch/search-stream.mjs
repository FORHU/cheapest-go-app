/**
 * Consume /api/search/stream and summarise what actually arrives.
 *
 * The hotel list and the prices come in separate phases: hotels first with
 * price:0 and priceLoading:true, prices after. "No hotels found" on screen with
 * a populated first phase means the second one failed, so the event sequence is
 * what matters, not the first chunk.
 *
 *   node scratch/search-stream.mjs <host> <city> <country>
 */
const host = process.argv[2] ?? 'airanggo.com';
const city = process.argv[3] ?? 'Paris, France';
const country = process.argv[4] ?? 'France';

const body = {
    destination: city, cityName: city, destinationType: 'city',
    country, checkin: '2026-09-09', checkout: '2026-09-10', adults: 2,
};

const res = await fetch(`https://${host}/api/search/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

console.log(`${host}  ${city}  ->  HTTP ${res.status}`);
if (!res.body) { console.log('no body'); process.exit(1); }

const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
const events = {};
let priced = 0, total = 0, firstPriced = null;

const t0 = Date.now();
while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
        if (!line.trim()) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        events[msg.type] = (events[msg.type] ?? 0) + 1;
        if (msg.type === 'hotels' && Array.isArray(msg.data)) total += msg.data.length;
        if (Array.isArray(msg.data)) {
            for (const h of msg.data) {
                if (h && typeof h.price === 'number' && h.price > 0) {
                    priced++;
                    firstPriced ??= `${h.name} — ${h.price} ${h.currency}`;
                }
            }
        }
        if (msg.type === 'error' || msg.error) console.log('  ERROR event:', JSON.stringify(msg).slice(0, 300));
    }
}

console.log(`  elapsed        ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  event types    ${JSON.stringify(events)}`);
console.log(`  hotels listed  ${total}`);
console.log(`  with a price   ${priced}`);
if (firstPriced) console.log(`  first priced   ${firstPriced}`);
