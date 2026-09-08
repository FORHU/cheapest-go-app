/**
 * What Stripe actually charged us, per transaction.
 *
 * pricing.ts assumes a flat 2.9% + $0.30 (STRIPE_RATE / STRIPE_FLAT_FEE), which is
 * the US domestic-card rate. Charge Currency is KRW/USD/PHP, so international-card
 * and currency-conversion surcharges may apply and would not show up anywhere in
 * the model. This prints the real fee on every live charge so the rate can be set
 * from evidence instead of from Stripe's headline number.
 *
 *   node scratch/stripe-fees.mjs          # last 90 days
 *   node scratch/stripe-fees.mjs 180      # last 180 days
 *
 * Read-only: lists balance transactions and nothing else.
 */
import fs from 'fs';
import Stripe from 'stripe';

// process.env wins, so the live key can be supplied for one run without editing
// .env — which holds the sandbox key, and a sandbox run cannot answer the
// question this script exists for:
//
//   STRIPE_SECRET_KEY=sk_live_... node scratch/stripe-fees.mjs
const env = fs.readFileSync('.env', 'utf8');
const key = process.env.STRIPE_SECRET_KEY
    || env.match(/^STRIPE_SECRET_KEY=(.*)$/m)?.[1].trim().replace(/^"|"$/g, '');
if (!key) throw new Error('STRIPE_SECRET_KEY not found in process.env or .env');

const isLive = key.startsWith('sk_live');
console.log(`Key mode: ${isLive ? 'LIVE' : 'TEST'}`);
if (!isLive) {
    console.log('WARNING: test-mode charges are simulated and are all in whatever currency');
    console.log('the sandbox was exercised in. They cannot tell you what a Korean or');
    console.log('Philippine card really costs. Re-run with the live key:');
    console.log('  STRIPE_SECRET_KEY=sk_live_... node scratch/stripe-fees.mjs\n');
}

const days = Number(process.argv[2] || 90);
const since = Math.floor(Date.now() / 1000) - days * 86400;

// KRW has no minor unit — its amounts are already whole won.
const ZERO_DECIMAL = new Set(['krw', 'jpy', 'vnd', 'clp', 'isk', 'kmf', 'xaf', 'xof', 'xpf']);
const toMajor = (amount, currency) => ZERO_DECIMAL.has(currency) ? amount : amount / 100;

const stripe = new Stripe(key);
const rows = [];
for await (const txn of stripe.balanceTransactions.list({
    created: { gte: since },
    type: 'charge',
    limit: 100,
    expand: ['data.source'],
})) {
    rows.push(txn);
}

if (rows.length === 0) {
    console.log(`No charges in the last ${days} days. Try a wider window.`);
    process.exit(0);
}

console.log(`\n${rows.length} charge(s), last ${days} days\n`);
console.table(rows.map(t => {
    const gross = toMajor(t.amount, t.currency);
    const fee = toMajor(t.fee, t.currency);
    return {
        date: new Date(t.created * 1000).toISOString().slice(0, 10),
        currency: t.currency.toUpperCase(),
        gross: gross.toFixed(2),
        fee: fee.toFixed(2),
        'fee %': ((fee / gross) * 100).toFixed(2) + '%',
        // The whole question: is this 2.9% + $0.30, or 5.4% + $0.30?
        card: t.source?.payment_method_details?.card?.country ?? '?',
    };
}));

// Per-currency effective rate. With few rows this is indicative, not a fit —
// the per-transaction table above is the real evidence.
const byCurrency = {};
for (const t of rows) {
    const c = t.currency.toUpperCase();
    byCurrency[c] ??= { n: 0, gross: 0, fee: 0 };
    byCurrency[c].n++;
    byCurrency[c].gross += toMajor(t.amount, t.currency);
    byCurrency[c].fee += toMajor(t.fee, t.currency);
}

console.log('\nBlended effective rate per Charge Currency:\n');
console.table(Object.entries(byCurrency).map(([currency, v]) => ({
    currency,
    charges: v.n,
    gross: v.gross.toFixed(2),
    fee: v.fee.toFixed(2),
    'effective': ((v.fee / v.gross) * 100).toFixed(2) + '%',
    'vs pricing.ts 2.9%': (((v.fee / v.gross) - 0.029) * 100).toFixed(2) + ' pts',
})));

// A blended average is the wrong summary when the underlying rates are discrete.
// The first run of this script returned 3.46% blended, which looked like "2.9%
// plus a bit of noise" — and was in fact two exact populations, 2.900% and
// 3.900%, one percentage point apart. That gap is Stripe's currency-conversion
// surcharge, and averaging it away hides the only thing worth seeing.
//
// So: strip the flat fee, then group what is left by rate to two decimals.
console.log('\nDistinct fee tiers (flat fee removed, grouped to 0.01%):\n');

const STRIPE_FLAT_FEE = 0.30;
const tiers = new Map();
for (const t of rows) {
    const gross = toMajor(t.amount, t.currency);
    const fee = toMajor(t.fee, t.currency);
    if (gross <= 0) continue;
    // The flat fee is charged in the settlement currency; on a zero-decimal
    // currency it is not $0.30, so tiering there needs the real figure and this
    // approximation should be treated as indicative only.
    const rate = ((fee - STRIPE_FLAT_FEE) / gross) * 100;
    const bucket = `${t.currency.toUpperCase()} ${rate.toFixed(2)}%`;
    const cur = tiers.get(bucket) ?? { charges: 0, gross: 0, fee: 0 };
    cur.charges++; cur.gross += gross; cur.fee += fee;
    tiers.set(bucket, cur);
}

const totalGross = rows.reduce((s, t) => s + toMajor(t.amount, t.currency), 0);
console.table([...tiers.entries()]
    .sort((a, b) => b[1].gross - a[1].gross)
    .map(([tier, v]) => ({
        tier,
        charges: v.charges,
        gross: v.gross.toFixed(2),
        'share of gross': ((v.gross / totalGross) * 100).toFixed(1) + '%',
    })));

console.log('\nTwo tiers exactly 1.00 point apart = the currency-conversion surcharge.');
console.log('1.50 points apart = an international card. Both together = 2.50 points.');
console.log('Set STRIPE_RATE from the tier your real volume actually sits in — not');
console.log('from the blend, and not from Stripe\'s headline 2.9%.');
