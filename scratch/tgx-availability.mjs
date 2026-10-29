/**
 * Is OTV actually serving availability right now?
 *
 * A supplier that has stopped answering looks exactly like a city with no rooms: the search
 * returns zero options, with no error and no warning, in a fraction of a second. The site
 * carries on showing hotels because `runTgxSearch` falls back to ETG for content and rates —
 * but ETG offers cannot be quoted or booked, so every checkout ends in a 409 while the
 * storefront looks healthy. That gap is what makes this worth a script instead of a guess.
 *
 * Prints, per destination: how many options came back and how long it took. Then quotes a few
 * of them, because availability and valuation fail separately — Quote worked for twenty
 * minutes after single-hotel Search had already stopped.
 *
 *   node scratch/tgx-availability.mjs                 # Jeju, Seoul, Busan
 *   node scratch/tgx-availability.mjs 850 3124        # specific destination codes
 *
 * Read-only: Search and Quote only. It never calls Book.
 *
 * Run from the repo root — it reads ./.env for the OTV credentials.
 */
import fs from 'fs';

const env = Object.fromEntries(
    fs.readFileSync('.env', 'utf8')
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

const apiKey   = env.TRAVELGATEX_API_KEY;
const access   = env.TRAVELGATEX_CODE;
const endpoint = env.TRAVELGATEX_ENDPOINT_URL;
if (!apiKey || !access || !endpoint) {
    throw new Error('TRAVELGATEX_API_KEY / TRAVELGATEX_CODE / TRAVELGATEX_ENDPOINT_URL missing from .env');
}

const base = {
    context: env.TRAVELGATEX_CONTEXT || 'OTV',
    client:  env.TRAVELGATEX_CLIENT  || 'forhuinc',
    auditTransactions: false,
};

/** Far enough out that a thin weekend is not mistaken for an outage. */
const CHECKIN  = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const CHECKOUT = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);

const DESTINATIONS = process.argv.slice(2).length
    ? process.argv.slice(2).map((code) => [code, code])
    : [['Jeju', '850'], ['Seoul', '3124'], ['Busan', '2340']];

const SEARCH = `query S($c: HotelCriteriaSearchInput!, $s: HotelSettingsInput!, $f: HotelXFilterSearchInput) {
  hotelX { search(criteria: $c, settings: $s, filterSearch: $f) {
    options { id hotelCode paymentType status }
    errors { code type description }
    warnings { code type description }
  } }
}`;

const QUOTE = `query Q($c: HotelCriteriaQuoteInput!, $s: HotelSettingsInput!) {
  hotelX { quote(criteria: $c, settings: $s) {
    optionQuote { status price { currency net } }
    errors { code type description }
  } }
}`;

async function gql(query, variables, ms) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { Authorization: `Apikey ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables }),
            signal: ctl.signal,
        });
        return await res.json();
    } finally { clearTimeout(timer); }
}

/** The plugins a destination search needs; without search_by_destination TGX returns nothing. */
const searchSettings = {
    ...base,
    timeout: 12_000,
    plugins: [
        { pluginsType: [{ name: 'search_by_destination', parameters: [{ key: 'accessID', value: access }] }] },
        { pluginsType: [{ name: 'cheapest_price', parameters: [{ key: 'primaryKey', value: 'hotel' }, { key: 'optionsPerKey', value: '1' }] }] },
    ],
};

console.log(`OTV availability — ${CHECKIN} → ${CHECKOUT}, access ${access}\n`);

let bookable = [];
for (const [name, code] of DESTINATIONS) {
    const started = Date.now();
    const body = await gql(SEARCH, {
        c: {
            checkIn: CHECKIN, checkOut: CHECKOUT,
            occupancies: [{ paxes: [{ age: 30 }, { age: 30 }] }],
            nationality: 'US', currency: 'USD', destinations: [code],
        },
        s: searchSettings,
        f: { access: { includes: [access] } },
    }, 30_000).catch((e) => ({ transport: e.message }));

    const took = `${((Date.now() - started) / 1000).toFixed(1)}s`.padStart(6);
    if (body.transport) { console.log(`${name.padEnd(7)} ${code.padEnd(5)} ${took}  TRANSPORT ${body.transport}`); continue; }

    const search = body?.data?.hotelX?.search;
    const options = search?.options ?? [];
    const notes = [
        body.errors?.length        ? `GRAPHQL ${JSON.stringify(body.errors).slice(0, 90)}` : '',
        search?.errors?.length     ? `ERR ${search.errors.map((e) => e.code).join(',')}` : '',
        search?.warnings?.length   ? `WARN ${search.warnings.map((w) => `${w.code ?? ''} ${(w.description ?? '').slice(0, 60)}`).join(' | ')}` : '',
    ].filter(Boolean).join('  ');

    console.log(`${name.padEnd(7)} ${code.padEnd(5)} ${took}  options: ${String(options.length).padStart(4)}  ${notes}`);

    if (!bookable.length) {
        bookable = options.filter((o) => o.paymentType === 'MERCHANT' && (o.status === 'AVAILABLE' || o.status === 'OK'));
    }
}

if (!bookable.length) {
    console.log('\nNo options anywhere — the supplier is not serving availability.');
    console.log('The site will still show hotels (ETG fallback), but nothing can be quoted or booked.');
    console.log('Consider Admin → Settings → General → stays maintenance until this returns.');
    process.exit(0);
}

// Availability and valuation fail independently, so having options proves only half of it.
console.log(`\nquoting ${Math.min(3, bookable.length)} of ${bookable.length} options…`);
await new Promise((r) => setTimeout(r, 1500));   // OTV needs a moment to propagate a fresh option

let ok = 0;
for (const option of bookable.slice(0, 3)) {
    const body = await gql(QUOTE, { c: { optionRefId: option.id }, s: { ...base, timeout: 55_000 } }, 57_000)
        .catch((e) => ({ transport: e.message }));
    const quote = body?.data?.hotelX?.quote;
    if (body.transport)          console.log(`  ${option.hotelCode}: TRANSPORT ${body.transport}`);
    else if (quote?.errors?.length) console.log(`  ${option.hotelCode}: REFUSED ${quote.errors.map((e) => e.code).join(',')}`);
    else if (quote?.optionQuote) { console.log(`  ${option.hotelCode}: OK ${quote.optionQuote.price.net} ${quote.optionQuote.price.currency}`); ok++; }
    else                          console.log(`  ${option.hotelCode}: empty quote, no error`);
}

console.log(ok ? `\n${ok} quote(s) succeeded — search and valuation are both working.`
                : '\nSearch returned options but every quote failed — valuation is down, booking will 409.');
