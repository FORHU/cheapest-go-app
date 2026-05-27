/**
 * Duffel Live Key Test: Search → Book → Cancel
 * Uses the Duffel balance payment (no card charged).
 * Run: node scripts/test-duffel-live.mjs
 */

const LIVE_TOKEN = process.env.DUFFEL_ACCESS_TOKEN || '';
const BASE = 'https://api.duffel.com';
const HEADERS = {
  'Authorization': `Bearer ${LIVE_TOKEN}`,
  'Duffel-Version': 'v2',
  'Content-Type': 'application/json',
};

async function duffel(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...HEADERS, ...opts.headers } });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.errors?.[0]?.message ?? JSON.stringify(data);
    throw Object.assign(new Error(`Duffel ${res.status}: ${msg}`), { status: res.status, raw: data });
  }
  return data;
}

// ── Step 1: Offer Request (Search) ──────────────────────────────────
console.log('\nStep 1: Searching for flights (MNL → SIN, 2026-09-15)...');
const offerReq = await duffel('/air/offer_requests?return_offers=true', {
  method: 'POST',
  body: JSON.stringify({
    data: {
      slices: [{ origin: 'MNL', destination: 'SIN', departure_date: '2026-09-15' }],
      passengers: [{ type: 'adult' }],
      cabin_class: 'economy',
    },
  }),
});

const offers = offerReq.data?.offers ?? [];
console.log(`Found ${offers.length} offers`);
if (!offers.length) throw new Error('No offers returned');

// Pick cheapest refundable offer (prefer refundable for safe testing)
const refundable = offers.filter(o => o.conditions?.refund_before_departure?.allowed === true);
const chosen = refundable[0] ?? offers[0];

console.log(`\nChosen offer: ${chosen.id}`);
console.log(`  Price: ${chosen.total_amount} ${chosen.total_currency}`);
console.log(`  Airline: ${chosen.slices?.[0]?.segments?.[0]?.marketing_carrier?.name ?? 'N/A'}`);
console.log(`  Refundable: ${chosen.conditions?.refund_before_departure?.allowed ?? false}`);
console.log(`  Expires: ${chosen.expires_at}`);

if (new Date(chosen.expires_at) < new Date()) throw new Error('Chosen offer is already expired');

// ── Step 2: Book ────────────────────────────────────────────────────
console.log('\nStep 2: Creating order (LIVE booking)...');
const duffelPax = chosen.passengers[0];
const orderRes = await duffel('/air/orders', {
  method: 'POST',
  body: JSON.stringify({
    data: {
      type: 'instant',
      selected_offers: [chosen.id],
      passengers: [{
        id: duffelPax.id,
        title: 'mr',
        given_name: 'CHEAPESTGO',
        family_name: 'TEST',
        born_on: '1990-01-01',
        email: 'test@cheapestgo.com',
        phone_number: '+639171234567',
        gender: 'm',
      }],
      payments: [{
        type: 'balance',
        amount: chosen.total_amount,
        currency: chosen.total_currency,
      }],
    },
  }),
});

const order = orderRes.data;
console.log(`\n=== BOOK SUCCESS ===`);
console.log(`  Order ID:  ${order.id}`);
console.log(`  PNR:       ${order.booking_reference}`);
console.log(`  Status:    ${order.status}`);
console.log(`  Price:     ${order.total_amount} ${order.total_currency}`);
console.log(`  Actions:   ${order.available_actions?.join(', ') ?? 'none'}`);

// ── Step 3: Create Cancellation ─────────────────────────────────────
console.log('\nStep 3: Creating cancellation quote...');
const cancRes = await duffel('/air/order_cancellations', {
  method: 'POST',
  body: JSON.stringify({ data: { order_id: order.id } }),
});

const cancellation = cancRes.data;
console.log(`  Cancellation ID: ${cancellation.id}`);
console.log(`  Refund preview:  ${cancellation.refund_amount} ${cancellation.refund_currency}`);
console.log(`  Refund to:       ${cancellation.refund_to}`);

// ── Step 4: Confirm Cancellation ────────────────────────────────────
console.log('\nStep 4: Confirming cancellation...');
const confirmRes = await duffel(`/air/order_cancellations/${cancellation.id}/actions/confirm`, {
  method: 'POST',
});

const confirmed = confirmRes.data;
console.log(`\n=== CANCEL SUCCESS ===`);
console.log(`  Refund:   ${confirmed.refund_amount} ${confirmed.refund_currency}`);
console.log(`  Refund to: ${confirmed.refund_to}`);
console.log(`\nDuffel live key test PASSED.`);
