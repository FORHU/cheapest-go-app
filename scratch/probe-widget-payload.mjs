/**
 * The customer's payload must not carry staff-only fields: `senderAdminId` names a colleague
 * by internal id and `backTranslatedBody` is the Agent's own check on their reply. Both used
 * to reach the widget. LOCAL :3000 only; cleans up after itself.
 *   node scratch/probe-widget-payload.mjs
 */
import fs from 'fs';
import postgres from 'postgres';
import { hash } from '@node-rs/argon2';

const BASE = 'http://localhost:3000';
const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/m)[1].replace(/^["']|["']$/g, '');
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) throw new Error('Refusing: DATABASE_URL is not local.');
const sql = postgres(dbUrl, { ssl: false, max: 2 });
const run = Date.now();
const ids = [];
let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++; };

async function user(role, first) {
    const email = `payload-${role}-${run}@example.test`;
    const [row] = await sql`INSERT INTO users (email, password_hash, role, first_name, last_name)
                            VALUES (${email}, ${await hash('Smoke-password-1!')}, ${role}, ${first}, 'Probe') RETURNING id`;
    ids.push(row.id);
    const login = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE },
        body: JSON.stringify({ email, password: 'Smoke-password-1!' }),
    });
    if (!login.ok) throw new Error(`login ${email}: ${login.status}`);
    return { id: row.id, cookie: login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') };
}

const call = (path, cookie, init = {}) => fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE, Cookie: cookie, ...(init.headers ?? {}) },
});

try {
    const customer = await user('user', 'Cara');
    const admin = await user('admin', 'Ada');

    await call('/api/support/conversation', customer.cookie, { method: 'POST', body: JSON.stringify({ locale: 'en' }) });
    await call('/api/support/conversation/messages', customer.cookie, { method: 'POST', body: JSON.stringify({ body: 'Where is my voucher?' }) });

    const [conv] = await sql`SELECT id FROM support_conversations WHERE user_id = ${customer.id} ORDER BY created_at DESC LIMIT 1`;
    const reply = await call(`/api/admin/support/conversations/${conv.id}/messages`, admin.cookie, {
        method: 'POST', body: JSON.stringify({ body: 'Sending it now.' }),
    });
    check('the admin replied', reply.ok, String(reply.status));

    // Give the reply a back-translation, the second staff-only field.
    await sql`UPDATE support_messages SET back_translated_body = 'I am sending it now.'
               WHERE conversation_id = ${conv.id} AND sender_type = 'agent'`;

    const body = await (await call('/api/support/conversation', customer.cookie)).text();
    check('the customer sees the reply', body.includes('Sending it now.'));
    check('no staff account id in the payload', !body.includes('senderAdminId') && !body.includes(admin.id), body.includes(admin.id) ? 'admin id present' : '');
    check('no back-translation in the payload', !body.includes('backTranslatedBody') && !body.includes('I am sending it now.'));

    const history = await (await call('/api/support/conversation/messages', customer.cookie)).text();
    check('same for the messages endpoint', !history.includes('senderAdminId') && !history.includes('backTranslatedBody'));

    // And the inbox still gets what it needs.
    const detail = await (await call(`/api/admin/support/conversations/${conv.id}`, admin.cookie)).json();
    const agentRow = detail.messages.find(m => m.senderType === 'agent');
    check('the inbox still knows the author', agentRow?.senderAdminId === admin.id, agentRow?.senderName ?? 'no name');
    check('the inbox still has the back-translation', agentRow?.backTranslatedBody === 'I am sending it now.');
} finally {
    await sql`DELETE FROM support_conversations WHERE user_id = ANY(${sql.array(ids)}::uuid[])`.catch(() => {});
    await sql`DELETE FROM users WHERE id = ANY(${sql.array(ids)}::uuid[])`.catch(e => console.error(e.message));
    await sql.end();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
