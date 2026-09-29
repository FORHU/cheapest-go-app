/**
 * BG-14 at the API, both sides, with translation in play: a Korean-locale customer posts
 * 4,000 Korean characters; an admin replies with 4,000 and 5,000 English characters. Reports
 * status and timing, and the stored translation state a few seconds later. LOCAL :3000.
 * Cleans up its users and chat.
 *   node scratch/probe-bg14-both-sides.mjs
 */
import fs from 'fs';
import postgres from 'postgres';
import { hash } from '@node-rs/argon2';

const BASE = 'http://localhost:3000';
const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/m)[1].replace(/^["']|["']$/g, '');
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) throw new Error('Refusing: DATABASE_URL is not local.');
const sql = postgres(dbUrl, { ssl: false, max: 2 });
const PASSWORD = 'Smoke-password-1!';
const run = Date.now();
const ids = [];

async function makeUser(role, email) {
    const [row] = await sql`INSERT INTO users (email, password_hash, role, first_name, last_name)
                            VALUES (${email}, ${await hash(PASSWORD)}, ${role}, 'Bg', 'Fourteen') RETURNING id`;
    ids.push(row.id);
    const login = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE },
        body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (!login.ok) throw new Error(`login ${email}: ${login.status}`);
    return { id: row.id, headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE, Cookie: login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') } };
}

const timed = async (label, url, init) => {
    const t = Date.now();
    const res = await fetch(url, init);
    const text = await res.text();
    console.log(`${label} → ${res.status} in ${Date.now() - t} ms  ${text.slice(0, 110)}`);
    return { res, text };
};

try {
    const customer = await makeUser('user', `bg14-ko-${run}@example.test`);
    const admin = await makeUser('admin', `bg14-admin-${run}@example.test`);

    const open = await timed('customer opens chat (ko)', `${BASE}/api/support/conversation`, {
        method: 'POST', headers: { ...customer.headers, Cookie: `${customer.headers.Cookie}; locale=ko` }, body: JSON.stringify({ locale: 'ko' }),
    });
    const conversationId = JSON.parse(open.text).conversation.id;
    await sql`UPDATE support_conversations SET locale = 'ko' WHERE id = ${conversationId}`;

    const korean = '예약 확인서를 받지 못했습니다. 결제가 두 번 되었는지 확인해 주세요. '.repeat(120).slice(0, 4000);
    await timed('customer 4,000 Korean chars', `${BASE}/api/support/conversation/messages`, {
        method: 'POST', headers: customer.headers, body: JSON.stringify({ body: korean }),
    });

    const english = (n) => 'Thanks for waiting, I am checking your booking with the hotel now. '.repeat(Math.ceil(n / 68)).slice(0, n);
    await timed('admin 4,000-char reply', `${BASE}/api/admin/support/conversations/${conversationId}/messages`, {
        method: 'POST', headers: admin.headers, body: JSON.stringify({ body: english(4000) }),
    });
    await timed('admin 5,000-char reply', `${BASE}/api/admin/support/conversations/${conversationId}/messages`, {
        method: 'POST', headers: admin.headers, body: JSON.stringify({ body: english(5000) }),
    });

    await new Promise(r => setTimeout(r, 8000));
    const rows = await sql`SELECT sender_type, length(body)::int AS len, translation_status, length(translated_body)::int AS translated_len
                           FROM support_messages WHERE conversation_id = ${conversationId} ORDER BY created_at`;
    console.log('stored after 8 s:', rows);
} finally {
    await sql`DELETE FROM support_conversations WHERE user_id = ANY(${sql.array(ids)}::uuid[])`.catch(() => {});
    await sql`DELETE FROM users WHERE id = ANY(${sql.array(ids)}::uuid[])`.catch(e => console.error(e.message));
    await sql.end();
}
