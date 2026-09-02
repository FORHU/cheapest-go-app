/**
 * Backfill departure/arrival terminals onto flight segments booked before the fix.
 *
 * Duffel returns origin_terminal/destination_terminal on its segments, and
 * parseDuffelOffer nested them under departure.terminal — but normalizedToFlightOffer
 * read the flat `seg.terminal`, so the value was discarded in the one transform every
 * search response passes through. It never reached the client, the /book payload or
 * flight_segments, and admin and the confirmation email then correctly rendered nothing.
 * Verified against a stored booking: RPDTBL's order carries terminal "2"/"1" while its
 * segment rows hold NULL.
 *
 * The order still holds what the offer lost, and Duffel keeps orders indefinitely, so the
 * data is recoverable for any booking with a duffel_order_id.
 *
 * Segments are matched on route plus flight number rather than position — a slice index is
 * not unique within a booking, and matching by array order would silently write the return
 * leg's terminal onto the outbound if either list were ordered differently.
 *
 * The key decides what is visible: a live order is Not Found under a test key and vice
 * versa. Run this wherever the key that made the bookings lives, and read the
 * "unreachable" count as "wrong key for these", not as "no data".
 *
 * Idempotent: only touches rows where both terminal columns are NULL, and only writes a
 * column the order actually filled.
 *
 *   node scripts/backfill-segment-terminals.mjs            # report only, writes nothing
 *   node scripts/backfill-segment-terminals.mjs --apply    # perform the backfill
 */

import postgres from 'postgres';

const DB_URL = process.env.DATABASE_URL
    || 'postgresql://cheapestgo:cheapestgo@localhost:5433/cheapestgo?sslmode=disable';
const DUFFEL_KEY = process.env.DUFFEL_ACCESS_TOKEN;
const APPLY = process.argv.includes('--apply');

if (!DUFFEL_KEY) {
    console.error('DUFFEL_ACCESS_TOKEN is not set — nothing can be fetched.');
    process.exit(1);
}

const sql = postgres(DB_URL, { ssl: DB_URL.includes('rds.amazonaws.com') ? { rejectUnauthorized: false } : undefined, max: 1 });

async function fetchOrder(orderId) {
    const res = await fetch(`https://api.duffel.com/air/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${DUFFEL_KEY}`, 'Duffel-Version': 'v2' },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: body?.errors?.[0]?.title ?? `HTTP ${res.status}` };
    return { order: body.data };
}

/** Every segment of an order, flattened, keyed the way flight_segments stores them. */
function orderTerminals(order) {
    const out = new Map();
    for (const slice of order?.slices ?? []) {
        for (const seg of slice.segments ?? []) {
            const carrier = seg.marketing_carrier?.iata_code ?? '';
            const key = `${seg.origin?.iata_code}|${seg.destination?.iata_code}|${carrier}${seg.marketing_carrier_flight_number ?? ''}`;
            out.set(key, {
                origin_terminal: seg.origin_terminal ?? null,
                destination_terminal: seg.destination_terminal ?? null,
            });
        }
    }
    return out;
}

const rows = await sql`
    SELECT fs.id, fs.booking_id, fs.origin, fs.destination, fs.flight_number,
           fb.duffel_order_id, fb.pnr, fb.status
    FROM flight_segments fs
    JOIN flight_bookings fb ON fb.id = fs.booking_id
    WHERE fs.origin_terminal IS NULL
      AND fs.destination_terminal IS NULL
      AND fb.duffel_order_id IS NOT NULL
    ORDER BY fb.created_at DESC, fs.segment_index
`;

if (rows.length === 0) {
    console.log('Nothing to do — no segments are missing a terminal on a booking with a Duffel order.');
    await sql.end();
    process.exit(0);
}

const byOrder = new Map();
for (const r of rows) {
    if (!byOrder.has(r.duffel_order_id)) byOrder.set(r.duffel_order_id, []);
    byOrder.get(r.duffel_order_id).push(r);
}

console.log(`${rows.length} segment(s) across ${byOrder.size} booking(s) missing a terminal.`);
console.log(APPLY ? 'Applying.\n' : 'Dry run — pass --apply to write.\n');

let filled = 0, noData = 0, unreachable = 0, unmatched = 0;

for (const [orderId, segments] of byOrder) {
    const { pnr, status } = segments[0];
    const { order, error } = await fetchOrder(orderId);

    if (error) {
        unreachable += segments.length;
        console.log(`  ${pnr} (${status})  ${orderId} — ${error}`);
        continue;
    }

    const terminals = orderTerminals(order);
    for (const seg of segments) {
        const key = `${seg.origin}|${seg.destination}|${seg.flight_number}`;
        const found = terminals.get(key);
        if (!found) {
            unmatched++;
            console.log(`  ${pnr}  ${seg.origin}->${seg.destination} ${seg.flight_number} — no matching segment in the order`);
            continue;
        }
        if (!found.origin_terminal && !found.destination_terminal) {
            noData++;
            console.log(`  ${pnr}  ${seg.origin}->${seg.destination} ${seg.flight_number} — order has no terminal either`);
            continue;
        }
        filled++;
        console.log(`  ${pnr}  ${seg.origin}->${seg.destination} ${seg.flight_number} — ${found.origin_terminal ?? '—'} / ${found.destination_terminal ?? '—'}`);
        if (APPLY) {
            await sql`
                UPDATE flight_segments
                SET origin_terminal = ${found.origin_terminal},
                    destination_terminal = ${found.destination_terminal}
                WHERE id = ${seg.id}
            `;
        }
    }
}

console.log(`\n${filled} recoverable, ${noData} with no terminal in the order, ${unmatched} unmatched, ${unreachable} unreachable with this key.`);
if (filled > 0 && !APPLY) console.log('Re-run with --apply to write them.');

await sql.end();
