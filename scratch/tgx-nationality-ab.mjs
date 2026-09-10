/**
 * Does the guest's nationality change how much OTV inventory comes back?
 *
 * The search path defaults `guest_nationality = 'US'` (search.ts:2073); the debug endpoint
 * that measured 659 options for Rome hardcodes 'KR'. Same dest code, same dates, same
 * plugins — so if the two disagree, nationality is the variable, and "Rome has almost no
 * availability" is really "Rome has almost no availability *for Americans*".
 *
 *   node scratch/tgx-nationality-ab.mjs [checkin] [checkout]
 */
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const pick = k => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');

const cfg = {
    apiKey:     pick('TRAVELGATEX_API_KEY'),
    accessCode: pick('TRAVELGATEX_CODE') || '38327',
    endpoint:   pick('TRAVELGATEX_ENDPOINT_URL') || 'https://api.travelgate.com',
    client:     pick('TRAVELGATEX_CLIENT') || 'forhuinc',
    context:    pick('TRAVELGATEX_CONTEXT') || 'OTV',
};

const checkIn  = process.argv[2] ?? '2026-10-10';
const checkOut = process.argv[3] ?? '2026-10-12';

// Mirrors getTgxSettings(cfg, 18000, true): both destination plugins are required, or TGX
// answers WRONG_FIELD/Empty hotels for any destination code.
const settings = {
    context: cfg.context,
    client: cfg.client,
    timeout: 18000,
    auditTransactions: false,
    plugins: [
        { pluginsType: [{ name: 'search_by_destination', parameters: [{ key: 'accessID', value: cfg.accessCode }] }] },
        { pluginsType: [{ name: 'cheapest_price', parameters: [
            { key: 'primaryKey', value: 'hotel' }, { key: 'optionsPerKey', value: '1' }] }] },
    ],
};

const QUERY = `query Search($criteria: HotelCriteriaSearchInput!, $settings: HotelSettingsInput) {
  hotelX { search(criteria: $criteria, settings: $settings) {
    options { hotelCode price { gross currency } }
    errors { code description }
    warnings { code description }
  } }
}`;

async function run(destinationCode, nationality, currency) {
    const criteria = {
        checkIn, checkOut,
        occupancies: [{ paxes: [{ age: 30 }, { age: 30 }] }],
        nationality, currency,
        destinations: [destinationCode],
    };
    const res = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${cfg.apiKey}` },
        body: JSON.stringify({ query: QUERY, variables: { criteria, settings } }),
    });
    const json = await res.json();
    const s = json?.data?.hotelX?.search;
    return {
        options: s?.options?.length ?? 0,
        errors: (s?.errors ?? []).map(e => e.code).join(','),
        warnings: (s?.warnings ?? []).map(e => e.code).join(','),
        raw: !s ? JSON.stringify(json).slice(0, 200) : '',
    };
}

const CITIES = [
    ['Rome',  '3023'],
    ['Paris', '2734'],
    ['Tokyo', '3593'],
];

console.log(`dates ${checkIn} → ${checkOut}\n`);
const rows = [];
for (const [city, code] of CITIES) {
    for (const [nat, cur] of [['US', 'USD'], ['KR', 'USD'], ['PH', 'USD']]) {
        const r = await run(code, nat, cur);
        rows.push({ city, code, nationality: nat, options: r.options, errors: r.errors, warnings: r.warnings });
        if (r.raw) console.log(`  ${city}/${nat} unexpected: ${r.raw}`);
    }
}
console.table(rows);

// The comparison the whole script exists for.
for (const [city] of CITIES) {
    const us = rows.find(r => r.city === city && r.nationality === 'US')?.options ?? 0;
    const kr = rows.find(r => r.city === city && r.nationality === 'KR')?.options ?? 0;
    if (us === 0 && kr === 0) console.log(`${city}: no availability for anyone — not a nationality effect.`);
    else if (kr > us * 2) console.log(`${city}: KR sees ${kr} vs US ${us} — nationality IS the variable.`);
    else if (us > kr * 2) console.log(`${city}: US sees ${us} vs KR ${kr} — reversed, but still nationality.`);
    else console.log(`${city}: US ${us} vs KR ${kr} — nationality is not the explanation.`);
}
