/**
 * BG-19 against the LOCAL dev server (:3000), LOCAL database and Stripe TEST mode: proceed to
 * payment for a hotel, go back, proceed again — i.e. POST /api/booking/create-payment twice
 * with the same quote, amount and currency. Prints both answers. Uses a synthetic prebook
 * quote row; test-mode PaymentIntents are never charged. Cleans up its rows.
 *   node scratch/repro-bg19-create-payment-twice.mjs
 */
import fs from 'fs';
import postgres from 'postgres';
import { hash } from '@node-rs/argon2';

const BASE = 'http://localhost:3000';
const env = fs.readFileSync('.env', 'utf8');
const read = (k) => env.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*?)\\s*$`, 'm'))?.[1].replace(/^["']|["']$/g, '');
const dbUrl = read('DATABASE_URL');
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) throw new Error('Refusing: DATABASE_URL is not local.');
if (!read('STRIPE_SECRET_KEY')?.startsWith('sk_test_')) throw new Error('Refusing: Stripe key is not a test key.');
const sql = postgres(dbUrl, { ssl: false, max: 2 });

const run = Date.now();
const email = `bg19-${run}@example.test`;
const prebookId = `bg19-prebook-${run}`;
let userId;

try {
    [{ id: userId }] = await sql`INSERT INTO users (email, password_hash, role, first_name, last_name)
                                 VALUES (${email}, ${await hash('Smoke-password-1!')}, 'user', 'Bg', 'Nineteen') RETURNING id`;
    const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'hotel_prebook_quotes'`;
    console.log('hotel_prebook_quotes columns:', cols.map(c => c.column_name).join(', '));
    await sql`INSERT INTO hotel_prebook_quotes (prebook_id, gross, currency, expires_at)
              VALUES (${prebookId}, ${100}, ${'USD'}, now() + interval '30 minutes')`;

    const login = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE },
        body: JSON.stringify({ email, password: 'Smoke-password-1!' }),
    });
    const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');

    const body = {
        prebookId, amount: Number(process.env.AMOUNT ?? 100), currency: 'USD', holderEmail: email,
        propertyName: `BG-19 Test Hotel ${run}`, roomName: 'Double room',
        checkIn: '2026-10-01', checkOut: '2026-10-03',
    };
    for (const attempt of ['first proceed', 'back, proceed again']) {
        const res = await fetch(`${BASE}/api/booking/create-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE, Cookie: cookie },
            body: JSON.stringify(body),
        });
        const text = await res.text();
        let summary = text.slice(0, 200);
        try { const j = JSON.parse(text); summary = JSON.stringify({ success: j.success, error: j.error, code: j.code, paymentIntentId: j.data?.paymentIntentId }); } catch {}
        console.log(`${attempt.padEnd(22)} → ${res.status} ${summary}`);
    }
} finally {
    await sql`DELETE FROM hotel_prebook_quotes WHERE prebook_id = ${prebookId}`.catch(() => {});
    if (userId) await sql`DELETE FROM users WHERE id = ${userId}`.catch(e => console.error(e.message));
    await sql.end();
}
