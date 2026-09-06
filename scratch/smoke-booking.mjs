// End-to-end hotel booking smoke test against the LOCAL dev server + LOCAL db.
// Usage: node scratch/smoke-booking.mjs <step>
//   step: prebook | pay | confirm | all
import fs from 'node:fs';

const BASE = 'http://localhost:3000';
const SESSION = process.env.CG_SESSION;
if (!SESSION) throw new Error('set CG_SESSION');

const env = fs.readFileSync('.env', 'utf8');
const pick = (k) =>
  env.split(/\r?\n/).find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim().replace(/^["']|["']$/g, '');
const STRIPE_KEY = pick('STRIPE_SECRET_KEY');
if (!STRIPE_KEY.startsWith('sk_test_')) throw new Error(`Refusing: STRIPE_SECRET_KEY is not a test key (${STRIPE_KEY.slice(0, 8)})`);

const STATE = 'scratch/.smoke-state.json';
const load = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {});
const save = (o) => fs.writeFileSync(STATE, JSON.stringify({ ...load(), ...o }, null, 2));

const H = {
  'Content-Type': 'application/json',
  'X-Requested-By': 'cheapestgo-client',
  Cookie: `cg-session=${SESSION}`,
  Origin: BASE,
};

async function post(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 600) }; }
  return { status: r.status, json };
}

const CHECKIN = '2026-10-15';
const CHECKOUT = '2026-10-17';
const HOLDER = { firstName: 'Smoke', lastName: 'Test', email: 'clydeantonio.work@gmail.com' };

async function search() {
  const r = await fetch(BASE + '/api/search/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cityName: 'Seoul', countryCode: 'KR', checkin: CHECKIN, checkout: CHECKOUT,
      adults: '2', children: '0', guest_nationality: 'US',
    }),
  });
  const text = await r.text();
  // Prefer the Miasageori hotel (11162318) — free-cancellation Standard room.
  const all = [...text.matchAll(/"offerId":"(TGX:[^"]*)"/g)].map((m) => m[1]);
  const pref = all.find((o) => o.includes('d11162318')) || all[0];
  if (!pref) throw new Error('no offers returned');
  console.log(`offers: ${all.length}, chosen hotel: ${pref.match(/!~\|d(\d+)/)?.[1]}`);
  save({ offerId: pref });
  return pref;
}

const step = process.argv[2] || 'all';

if (step === 'search' || step === 'all') await search();

if (step === 'prebook' || step === 'all') {
  const { offerId } = load();
  const r = await post('/api/booking/prebook', {
    offerId, adults: 2, children: 0, roomName: 'Standard room', currency: 'USD',
  });
  console.log('PREBOOK', r.status, JSON.stringify(r.json).slice(0, 900));
  const d = r.json?.data ?? r.json;
  save({
    prebookId: d?.prebookId,
    chargeAmount: d?.display?.total,
    chargeCurrency: (d?.display?.currency || 'USD').toLowerCase(),
    refundableTag: d?.cancellationPolicies?.refundableTag,
  });
  console.log('\nsaved →', JSON.stringify(load(), null, 2).slice(0, 400));
}

if (step === 'pay' || step === 'all') {
  const s = load();
  const r = await post('/api/booking/create-payment', {
    prebookId: s.prebookId,
    amount: s.chargeAmount,
    currency: s.chargeCurrency,
    holderEmail: HOLDER.email,
    propertyName: 'Miasageori Station Daewon',
    roomName: 'Standard room',
    checkIn: CHECKIN,
    checkOut: CHECKOUT,
  });
  console.log('CREATE-PAYMENT', r.status, JSON.stringify(r.json).slice(0, 500));
  const pi = r.json?.data?.paymentIntentId;
  if (!pi) process.exit(1);
  save({ paymentIntentId: pi });

  // Confirm the PI with Stripe's test card — sandbox key only, guarded above.
  const body = new URLSearchParams({ payment_method: 'pm_card_visa', return_url: BASE + '/trips' });
  const sr = await fetch(`https://api.stripe.com/v1/payment_intents/${pi}/confirm`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(STRIPE_KEY + ':').toString('base64'),
               'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const sj = await sr.json();
  console.log('STRIPE CONFIRM', sr.status, sj.status, sj.id, sj.amount, sj.currency,
              '| livemode:', sj.livemode, '| bookingReference:', sj.metadata?.bookingReference);
  save({ stripeStatus: sj.status, bookingReference: sj.metadata?.bookingReference, livemode: sj.livemode });
}

if (step === 'confirm' || step === 'all') {
  const s = load();
  const r = await post('/api/booking/confirm', {
    prebookId: s.prebookId,
    paymentIntentId: s.paymentIntentId,
    holder: HOLDER,
    guests: [{ occupancyNumber: 1, ...HOLDER }],
    payment: { method: 'stripe', transactionId: s.paymentIntentId },
    propertyName: 'Miasageori Station Daewon',
    roomName: 'Standard room',
    checkIn: CHECKIN,
    checkOut: CHECKOUT,
    adults: 2,
    children: 0,
    currency: s.chargeCurrency.toUpperCase(),
    quotedPrice: s.chargeAmount,
  });
  console.log('CONFIRM', r.status, JSON.stringify(r.json).slice(0, 800));
  save({ confirmStatus: r.status, bookingId: r.json?.data?.bookingId, dbId: r.json?.data?.dbId });
}
