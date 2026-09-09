/** search-stream with explicit dates: node scratch/search-dates.mjs <host> <city> <country> <in> <out> */
const [host, city, country, checkin, checkout] = process.argv.slice(2);
const body = { destination: city, cityName: city, destinationType: 'city', country, checkin, checkout, adults: 2 };
const res = await fetch(`https://${host}/api/search/stream`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const reader = res.body.getReader(); const dec = new TextDecoder();
let buf = ''; const ev = {}; let priced = 0, total = 0;
const t0 = Date.now();
for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop() ?? '';
    for (const l of lines) { if (!l.trim()) continue; let m; try { m = JSON.parse(l); } catch { continue; }
        ev[m.type] = (ev[m.type] ?? 0) + 1;
        if (m.type === 'hotels' && Array.isArray(m.data)) total += m.data.length;
        if (Array.isArray(m.data)) for (const h of m.data) if (h && h.price > 0) priced++;
    }
}
console.log(`${city}  ${checkin}→${checkout}  ${((Date.now()-t0)/1000).toFixed(1)}s  events=${JSON.stringify(ev)}  listed=${total}  priced=${priced}`);
