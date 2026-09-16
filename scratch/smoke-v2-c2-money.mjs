/**
 * C2 (hotel booking money rules) against a running api-v2 on :4000.
 *
 * **Creates no booking.** The standing rule is that hotel bookings hit the live OTV API, so
 * nothing here calls prebook, book or confirm. The quote row a payment is priced from is
 * inserted directly into the local database instead, which exercises the whole charge path —
 * the recorded quote, the strict conversion, the markup and the Stripe amount — without a
 * single supplier call.
 *
 * Stripe runs in test mode locally (checked before this was written); the PaymentIntents it
 * creates are test objects and no money moves.
 *
 *   node scratch/smoke-v2-c2-money.mjs
 */
import { execFileSync } from 'child_process';
import { createHmac } from 'crypto';

const API = 'http://localhost:4000/api/v2';
const run = Date.now();
let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures++;
};

const sql = (statement) => execFileSync('docker', [
    'exec', 'cheapestgo-api-v2-postgres-1',
    'psql', '-U', 'cheapestgo', '-d', 'cheapestgo', '-tAc', statement,
], { encoding: 'utf8' }).trim();

const call = (path, init = {}) => fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
});

const email    = `c2-money-${run}@example.test`;
const password = 'Smoke-password-1!';
const prebookId = `SMOKE:${run}`;

try {
    // ── An account to charge.
    const registered = await call('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, first_name: 'C2', last_name: 'Smoke' }),
    });
    const cookie = (registered.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ');
    check('an account can be created', registered.status === 201, String(registered.status));

    // ── A recorded supplier quote: $300 for the stay, in USD.
    sql(`INSERT INTO hotel_prebook_quotes (prebook_id, net, gross, currency, room_name)
         VALUES ('${prebookId}', 280, 300, 'USD', 'Smoke Room')`);

    // ── The charge comes off the recorded quote, marked up at the hotel rate.
    const paid = await call('/hotels/create-payment', {
        method: 'POST',
        headers: { Cookie: cookie },
        body: JSON.stringify({ prebookId, amount: 300, currency: 'USD', holderEmail: email }),
    });
    const paidBody = await paid.json().catch(() => ({}));
    check('a payment can be created from a recorded quote', paid.ok, `${paid.status} ${JSON.stringify(paidBody).slice(0, 80)}`);

    const piId = paidBody.data?.paymentIntentId;
    check('it returns a PaymentIntent', !!piId, String(piId));

    // Read the intent back from Stripe rather than trusting the response: what matters is
    // the amount that reached the processor.
    const stripeKey = process.env.STRIPE_SECRET_KEY ?? readEnv('STRIPE_SECRET_KEY');
    const pi = piId ? await stripeGet(`payment_intents/${piId}`, stripeKey) : null;

    // 300 + 5.9% = 317.70 → 31770 minor units. The old flat 5% would be 31500.
    check('the customer is charged the hotel rate on the server-derived base',
        pi?.amount === 31770, `${pi?.amount} ${pi?.currency}`);
    // Manual capture: the authorisation is taken now and the money only moves once the
    // supplier has actually confirmed the room. A fresh intent sits at
    // requires_payment_method until the browser confirms it, so the rule to check here is
    // the capture method, not the status.
    check('the money only moves once the room is confirmed',
        pi?.capture_method === 'manual', `${pi?.capture_method} / ${pi?.status}`);
    check('the effective markup rate is recorded on the charge',
        Number(pi?.metadata?.markupRate) === 0.059, String(pi?.metadata?.markupRate));

    // ── The reference exists before the charge does, and is ours, not FORHU's.
    const ref = pi?.metadata?.bookingReference;
    check('a booking reference is minted before the charge', !!ref, String(ref));
    check('it names the platform, not the parent company', /^(CG|GG)-[0-9A-HJKMNP-TV-Z]{6}$/.test(ref ?? ''), String(ref));

    // ── Replaying the same request returns the same intent (QA BG-19).
    const again = await call('/hotels/create-payment', {
        method: 'POST',
        headers: { Cookie: cookie },
        body: JSON.stringify({ prebookId, amount: 300, currency: 'USD', holderEmail: email }),
    });
    const againBody = await again.json().catch(() => ({}));
    check('stepping back and paying again reuses the same intent',
        again.ok && againBody.data?.paymentIntentId === piId,
        `${again.status} ${againBody.data?.paymentIntentId}`);

    // ── A quote past its 30 minutes cannot be charged from.
    sql(`UPDATE hotel_prebook_quotes SET expires_at = now() - interval '1 hour' WHERE prebook_id = '${prebookId}'`);
    const stale = await call('/hotels/create-payment', {
        method: 'POST',
        headers: { Cookie: cookie },
        body: JSON.stringify({ prebookId, amount: 300, currency: 'USD', holderEmail: email }),
    });
    check('an expired quote is refused', stale.status === 409 || stale.status === 400, String(stale.status));

    // ── The client's own figure is not what gets charged.
    sql(`UPDATE hotel_prebook_quotes SET expires_at = now() + interval '30 minutes' WHERE prebook_id = '${prebookId}'`);
    const lowball = await call('/hotels/create-payment', {
        method: 'POST',
        headers: { Cookie: cookie },
        body: JSON.stringify({ prebookId, amount: 1, currency: 'USD', holderEmail: email }),
    });
    const lowballBody = await lowball.json().catch(() => ({}));
    check('a client claiming a $1 price is refused, not charged $1',
        lowball.status === 409, `${lowball.status} ${(lowballBody.message ?? lowballBody.error ?? '').slice(0, 60)}`);

    // ── A webhook delivered twice is handled once.
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? readEnv('STRIPE_WEBHOOK_SECRET');
    const eventId = `evt_smoke_${run}`;
    const payload = JSON.stringify({
        id: eventId, object: 'event', type: 'customer.created',
        data: { object: { id: `cus_smoke_${run}`, object: 'customer' } },
    });
    const sendEvent = async () => {
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
        return fetch(`${API}/webhooks/stripe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${timestamp},v1=${signature}` },
            body: payload,
        });
    };

    const first = await sendEvent();
    check('a signed webhook is accepted', first.ok, String(first.status));
    check('and the event is claimed', sql(`SELECT count(*) FROM stripe_processed_events WHERE event_id = '${eventId}'`) === '1');
    check('and marked complete', sql(`SELECT completed_at IS NOT NULL FROM stripe_processed_events WHERE event_id = '${eventId}'`) === 't');

    const replay = await sendEvent();
    check('a replay is acknowledged without being handled again', replay.ok, String(replay.status));
    check('and leaves exactly one claim', sql(`SELECT count(*) FROM stripe_processed_events WHERE event_id = '${eventId}'`) === '1');

    const forged = await fetch(`${API}/webhooks/stripe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
        body: payload,
    });
    check('an unsigned event is refused', forged.status === 400, String(forged.status));
} finally {
    try {
        sql(`DELETE FROM hotel_prebook_quotes WHERE prebook_id LIKE 'SMOKE:%'`);
        sql(`DELETE FROM stripe_processed_events WHERE event_id LIKE 'evt_smoke_%'`);
        sql(`DELETE FROM users WHERE email = '${email}'`);
    } catch (err) {
        console.error('cleanup failed:', err.message?.slice(0, 120));
    }
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;

/** Read one key out of api-v2's .env without printing any of it. */
function readEnv(key) {
    const text = execFileSync('node', ['-e',
        `const fs=require('fs');const t=fs.readFileSync(process.argv[1],'utf8');` +
        `const m=t.match(new RegExp('^'+process.argv[2]+'=(.*)$','m'));process.stdout.write(m?m[1].trim():'')`,
        'C:/Users/USER/Documents/GitHub/cheapestgo-api-v2/.env', key,
    ], { encoding: 'utf8' });
    return text;
}

async function stripeGet(path, key) {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
        headers: { Authorization: `Bearer ${key}` },
    });
    return res.json().catch(() => null);
}
