/**
 * List the hotel bookings TravelgateX actually holds for our access code.
 *
 * We had no way to answer this. `api_logs` records only Duffel and Stripe, so every TGX
 * call — search, quote, book, cancel — leaves no trail, and the only hotel record is the
 * `bookings` row our own code writes. That is fine until the two disagree, which is exactly
 * when it matters: on 2026-09-07 OTV reported a test booking made the previous day and
 * nothing in live RDS, local or api-v2 had any record of it. The equivalent question for
 * flights was answered in one command against Duffel's orders endpoint; for hotels there
 * was nothing to ask.
 *
 * A booking placed with OTV but never written to `bookings` is invisible to admin, to the
 * cancel path and to reconciliation — real inventory held against no sale.
 *
 * Reads only. Prints what OTV holds, and with --diff also reports which of those the
 * database has never heard of.
 *
 *   node scripts/tgx-list-bookings.mjs                 # bookings created in the last 7 days
 *   node scripts/tgx-list-bookings.mjs --days 30       # a wider window
 *   node scripts/tgx-list-bookings.mjs --ref CG-7K2M9Q # one client reference
 *   node scripts/tgx-list-bookings.mjs --diff          # also flag any OTV booking with no DB row
 *
 * Run it wherever the credentials for the account you are asking about live: the key
 * decides which bookings are visible, exactly as with Duffel test vs live.
 */

import postgres from 'postgres';

const API_KEY  = process.env.TRAVELGATEX_API_KEY  || process.env.TRAVELGATE_API_KEY;
const ENDPOINT = process.env.TRAVELGATEX_ENDPOINT_URL || process.env.TRAVELGATE_ENDPOINT_URL || 'https://api.travelgate.com';
const ACCESS   = process.env.TRAVELGATEX_CODE     || process.env.TRAVELGATE_CODE;
const CONTEXT  = process.env.TRAVELGATEX_CONTEXT  || process.env.TRAVELGATE_CONTEXT  || 'OTV';
const CLIENT   = process.env.TRAVELGATEX_CLIENT   || process.env.TRAVELGATE_CLIENT;

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DAYS = parseInt(argOf('--days', '7'), 10);
const REF  = argOf('--ref', null);
const DIFF = args.includes('--diff');

if (!API_KEY || !ACCESS) {
    console.error('TRAVELGATEX_API_KEY and TRAVELGATEX_CODE must be set.');
    process.exit(1);
}

// Shape taken from the live schema by introspection, not from the docs: the criteria type
// is HotelCriteriaBookingInput (accessCode, not access), and typeSearch is a required
// discriminator — DATES or REFERENCES — that decides which of the two criteria blocks OTV
// reads. Getting it wrong returns a schema error rather than an empty list, which is why
// the GraphQL errors below are printed verbatim.
const QUERY = `
query TgxBookingList($criteria: HotelCriteriaBookingInput!, $settings: HotelSettingsInput!) {
  hotelX {
    booking(criteria: $criteria, settings: $settings) {
      bookings {
        reference { client supplier hotel }
        status
        holder { name surname }
        hotel {
          hotelCode
          hotelName
          checkIn
          checkOut
          bookingDate
        }
        price { currency net gross }
      }
      errors   { code type description }
      warnings { code type description }
    }
  }
}`;

const iso = d => d.toISOString().slice(0, 10);
const end = new Date();
const start = new Date(Date.now() - DAYS * 86400000);

// typeSearch selects which block OTV reads, so it must agree with what is supplied.
// References take precedence: asking for one booking by client reference is the narrower
// question.
const criteria = REF
    ? {
        accessCode: ACCESS,
        typeSearch: 'REFERENCES',
        references: { references: [{ client: REF }] },
    }
    : {
        accessCode: ACCESS,
        typeSearch: 'DATES',
        // BOOKING is the date the reservation was made, which is the question being asked —
        // arrival/departure would miss a booking made yesterday for next year.
        dates: { dateType: 'BOOKING', start: iso(start), end: iso(end) },
    };

const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Authorization': `Apikey ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
        query: QUERY,
        variables: {
            criteria,
            settings: { context: CONTEXT, client: CLIENT, timeout: 25000, auditTransactions: false },
        },
    }),
});

const body = await res.json().catch(() => null);

if (!res.ok || !body) {
    console.error(`HTTP ${res.status}`);
    console.error(JSON.stringify(body, null, 2)?.slice(0, 1500));
    process.exit(1);
}

// GraphQL errors are printed verbatim rather than summarised: if OTV's schema for this
// query differs from what is written above, the message names the offending field and the
// query can be corrected from it. A swallowed error here reads as "no bookings", which is
// the one answer this script must never give wrongly.
if (body.errors?.length) {
    console.error('GraphQL errors:');
    console.error(JSON.stringify(body.errors, null, 2).slice(0, 2000));
    process.exit(1);
}

const result   = body.data?.hotelX?.booking ?? {};
const bookings = result.bookings ?? [];

for (const w of result.warnings ?? []) console.warn(`  warning ${w.code}: ${w.description}`);
for (const e of result.errors   ?? []) console.error(`  error ${e.code}: ${e.description}`);

console.log(REF
    ? `\nOTV bookings matching client reference ${REF}: ${bookings.length}`
    : `\nOTV bookings created in the last ${DAYS} days: ${bookings.length}`);

if (bookings.length === 0) {
    console.log('  (none — with THIS key. A different access code or key mode holds different bookings.)');
}

for (const b of bookings) {
    const h = b.hotel ?? {};
    console.log(
        `  ${String(b.reference?.client ?? '-').padEnd(26)} ${String(b.status).padEnd(11)}` +
        ` ${String(h.bookingDate ?? '-').slice(0, 10)}  ${String(h.hotelName ?? h.hotelCode ?? '-').slice(0, 34).padEnd(35)}` +
        ` ${h.checkIn ?? '-'}→${h.checkOut ?? '-'}  ${b.price?.gross ?? '-'} ${b.price?.currency ?? ''}` +
        `  supplierRef=${b.reference?.supplier ?? '-'}`
    );
}

if (DIFF && bookings.length > 0) {
    const DB_URL = process.env.DATABASE_URL;
    if (!DB_URL) {
        console.log('\n--diff needs DATABASE_URL.');
    } else {
        const sql = postgres(DB_URL, {
            ssl: DB_URL.includes('rds.amazonaws.com') ? { rejectUnauthorized: false } : undefined,
            max: 1,
        });
        const refs = bookings.map(b => b.reference?.client).filter(Boolean);
        const known = await sql`SELECT booking_id FROM bookings WHERE booking_id = ANY(${refs})`;
        const knownSet = new Set(known.map(r => r.booking_id));
        const orphans = refs.filter(r => !knownSet.has(r));

        console.log(`\n${refs.length - orphans.length} of ${refs.length} exist in the bookings table.`);
        if (orphans.length) {
            console.log('OTV holds these with NO row in our database:');
            // Cancel by CLIENT reference — OTV rejects the supplier reference.
            orphans.forEach(r => console.log(`  ${r}`));
        }
        await sql.end();
    }
}
