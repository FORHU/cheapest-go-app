/**
 * BG-14 at the API, no browser: a customer posts support messages of 3,000 / 4,000 / 5,000
 * characters. Reports status, time taken and body for each, and what was stored. LOCAL :3000.
 * Cleans up its test user.
 *   node scratch/probe-bg14-api.mjs
 */
import fs from 'fs';
import postgres from 'postgres';
import { hash } from '@node-rs/argon2';

const BASE = 'http://localhost:3000';
const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/m)[1].replace(/^["']|["']$/g, '');
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) throw new Error('Refusing: DATABASE_URL is not local.');
const sql = postgres(dbUrl, { ssl: false, max: 2 });

const email = `bg14-api-${Date.now()}@example.test`;
const [user] = await sql`INSERT INTO users (email, password_hash, role, first_name, last_name)
                         VALUES (${email}, ${await hash('Smoke-password-1!')}, 'user', 'Bg', 'Api') RETURNING id`;
try {
    const login = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE },
        body: JSON.stringify({ email, password: 'Smoke-password-1!' }),
    });
    const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const headers = { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE, Cookie: cookie };

    // Open a chat the way the widget does.
    const open = await fetch(`${BASE}/api/support/conversation`, { method: 'POST', headers, body: JSON.stringify({}) });
    console.log('open chat →', open.status, (await open.text()).slice(0, 120));

    for (const n of [3000, 4000, 5000]) {
        const body = 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. '.repeat(Math.ceil(n / 58)).slice(0, n);
        const t = Date.now();
        const res = await fetch(`${BASE}/api/support/conversation/messages`, {
            method: 'POST', headers, body: JSON.stringify({ body, clientId: `probe-${n}` }),
        });
        const text = await res.text();
        console.log(`${n} chars → ${res.status} in ${Date.now() - t} ms  ${text.slice(0, 160)}`);
    }

    const stored = await sql`
        SELECT length(m.body)::int AS len, m.translation_status
        FROM support_messages m JOIN support_conversations c ON c.id = m.conversation_id
        WHERE c.user_id = ${user.id} ORDER BY m.created_at`;
    console.log('stored:', stored);
} finally {
    await sql`DELETE FROM support_conversations WHERE user_id = ${user.id}`.catch(() => {});
    await sql`DELETE FROM users WHERE id = ${user.id}`;
    await sql.end();
}
