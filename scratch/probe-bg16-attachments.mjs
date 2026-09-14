/**
 * BG-16 at the API against the LOCAL dev server (:3000): upload a PDF, a PNG, a Word
 * document and a 12 MB photo as a customer, and a PDF as an agent (assigned and not). Prints
 * each status and message. Cleans up users, chat and any stored rows.
 *   node scratch/probe-bg16-attachments.mjs
 */
import fs from 'fs';
import postgres from 'postgres';
import { hash } from '@node-rs/argon2';

const BASE = 'http://localhost:3000';
const env = fs.readFileSync('.env', 'utf8');
const read = (k) => env.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*?)\\s*$`, 'm'))?.[1].replace(/^["']|["']$/g, '');
const dbUrl = read('DATABASE_URL');
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) throw new Error('Refusing: DATABASE_URL is not local.');
console.log('local config: SUPPORT_ATTACHMENTS_BUCKET', read('SUPPORT_ATTACHMENTS_BUCKET') ? 'set' : 'NOT set', '| AWS_REGION', read('AWS_REGION') ? 'set' : 'NOT set');
const sql = postgres(dbUrl, { ssl: false, max: 2 });
const run = Date.now();
const ids = [];

async function user(role, email) {
    const [row] = await sql`INSERT INTO users (email, password_hash, role, first_name, last_name)
                            VALUES (${email}, ${await hash('Smoke-password-1!')}, ${role}, 'Bg', 'Sixteen') RETURNING id`;
    ids.push(row.id);
    const login = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE },
        body: JSON.stringify({ email, password: 'Smoke-password-1!' }),
    });
    return { id: row.id, cookie: login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') };
}

const files = {
    pdf: { name: 'booking.pdf', type: 'application/pdf', bytes: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') },
    png: { name: 'screenshot.png', type: 'image/png', bytes: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]) },
    docx: { name: 'itinerary.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.alloc(64)]) },
    bigPhoto: { name: 'IMG_20260914.jpg', type: 'image/jpeg', bytes: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(12 * 1024 * 1024)]) },
};

async function upload(label, url, cookie, file) {
    const form = new FormData();
    form.append('file', new Blob([file.bytes], { type: file.type }), file.name);
    const res = await fetch(url, { method: 'POST', headers: { 'X-Requested-By': 'cheapestgo-client', Origin: BASE, Cookie: cookie }, body: form });
    console.log(`${label.padEnd(34)} → ${res.status} ${(await res.text()).slice(0, 110)}`);
}

try {
    const customer = await user('user', `bg16-c-${run}@example.test`);
    const agent = await user('support_agent', `bg16-a-${run}@example.test`);
    const admin = await user('admin', `bg16-ad-${run}@example.test`);

    const open = await fetch(`${BASE}/api/support/conversation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE, Cookie: customer.cookie }, body: '{}',
    });
    const conversationId = (await open.json()).conversation.id;

    for (const [kind, file] of Object.entries(files)) {
        await upload(`customer ${kind}`, `${BASE}/api/support/conversation/attachments`, customer.cookie, file);
    }

    const adminUrl = `${BASE}/api/admin/support/conversations/${conversationId}/attachments`;
    await upload('agent pdf (chat not assigned)', adminUrl, agent.cookie, files.pdf);
    await sql`UPDATE support_conversations SET assigned_admin_id = ${agent.id}, status = 'human_active' WHERE id = ${conversationId}`;
    await upload('agent pdf (chat assigned to them)', adminUrl, agent.cookie, files.pdf);
    await upload('admin pdf', adminUrl, admin.cookie, files.pdf);
    await upload('agent docx', adminUrl, agent.cookie, files.docx);
} finally {
    await sql`DELETE FROM support_conversations WHERE user_id = ANY(${sql.array(ids)}::uuid[])`.catch(() => {});
    await sql`DELETE FROM users WHERE id = ANY(${sql.array(ids)}::uuid[])`.catch(e => console.error(e.message));
    await sql.end();
}
