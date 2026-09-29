/**
 * BG-2: replay the deal card's MNL→SIN search against the LOCAL dev server (:3000), with a
 * future date and with QA's 2026-09-10 (now in the past), and print what comes back.
 *   node scratch/probe-bg2-search.mjs
 */
const BASE = process.env.BASE ?? 'http://localhost:3000';
const future = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

for (const departureDate of [future, '2026-09-10']) {
    const t = Date.now();
    const res = await fetch(`${BASE}/api/flights/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE },
        body: JSON.stringify({
            origin: 'MNL', destination: 'SIN', departureDate,
            passengers: { adults: 1, children: 0, infants: 0 },
            cabinClass: 'economy', tripType: 'one-way',
        }),
    });
    const text = await res.text();
    let summary = text.slice(0, 300);
    try {
        const j = JSON.parse(text);
        summary = JSON.stringify({ success: j.success, error: j.error, offers: j.data?.length ?? j.offers?.length, failedProviders: j.failedProviders ?? j.meta?.failedProviders });
    } catch {}
    console.log(`${departureDate} → ${res.status} in ${Date.now() - t}ms  ${summary}`);
}

