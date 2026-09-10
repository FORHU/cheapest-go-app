/**
 * Does the search stream now send a Nightly Rate, and is it the one the property page sells?
 *
 * Runs the same city and dates twice — a 1-night stay and a 2-night stay. The bug was
 * invisible at 1 night, so the two together are the test: the nightly figure should barely
 * move between them, and it must NOT halve.
 */
const host = process.argv[2] ?? 'localhost:3099';
const scheme = host.startsWith('localhost') ? 'http' : 'https';

async function run(checkin, checkout, label) {
    const body = {
        destination: 'Alabang, Philippines', cityName: 'Alabang, Philippines',
        destinationType: 'city', country: 'Philippines', checkin, checkout, adults: 2,
    };
    const res = await fetch(`${scheme}://${host}/api/search/stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.body) return console.log(`${label}: no body (HTTP ${res.status})`);

    const reader = res.body.getReader(); const dec = new TextDecoder();
    let buf = ''; const priced = new Map();
    for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() ?? '';
        for (const l of lines) {
            if (!l.trim()) continue; let m; try { m = JSON.parse(l); } catch { continue; }
            if (Array.isArray(m.data)) for (const h of m.data) {
                if (h && typeof h.price === 'number' && h.price > 0) {
                    priced.set(h.hotelId ?? h.id, { price: h.price, currency: h.currency, name: h.name });
                }
            }
        }
    }
    const rows = [...priced.values()].sort((a, b) => a.price - b.price);
    console.log(`${label}  priced=${rows.length}  cheapest=${rows[0] ? rows[0].price.toFixed(2) + ' ' + rows[0].currency : 'none'}`);
    return rows[0]?.price ?? null;
}

const one = await run('2026-10-10', '2026-10-11', '1 night ');
const two = await run('2026-10-10', '2026-10-12', '2 nights');

if (one && two) {
    const ratio = two / one;
    console.log(`\nratio 2-night ÷ 1-night = ${ratio.toFixed(3)}`);
    if (ratio < 0.6) console.log('HALVED — the second division is back.');
    else console.log('OK — the nightly rate did not halve when a night was added.');
}
