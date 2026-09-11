/**
 * End-to-end smoke of Assignment by admin (ADR-0041) against a RUNNING dev server on :3000
 * and the LOCAL database — real sign-in, real cookies, real routes, the live admin stream,
 * and the server-rendered inbox pages.
 *
 * Creates throwaway users (smoke-*@example.test) and removes them, with their chats, at the
 * end, pass or fail.
 *
 *   pnpm dev   (in another terminal)
 *   npx tsx scratch/smoke-assignment.ts
 */
import fs from 'fs';
import postgres from 'postgres';
import { hash } from '@node-rs/argon2';

const BASE = 'http://localhost:3000';
const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/m)![1].replace(/^["']|["']$/g, '');
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) throw new Error('Refusing: DATABASE_URL is not local.');
const sql = postgres(dbUrl, { ssl: false, max: 2 });

const PASSWORD = 'Smoke-test-password-1!';
const run = crypto.randomUUID().slice(0, 8);
const userIds: string[] = [];

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
    console.log(`${ok ? '  ✓' : '  ✗'} ${label}${!ok && detail ? `  — ${detail}` : ''}`);
    if (!ok) failures++;
}

async function makeUser(role: string, name: string) {
    const email = `smoke-${name.toLowerCase()}-${run}@example.test`;
    const [row] = await sql<{ id: string }[]>`
        INSERT INTO users (email, password_hash, role, first_name)
        VALUES (${email}, ${await hash(PASSWORD)}, ${role}, ${name})
        RETURNING id
    `;
    userIds.push(row.id);
    return { id: row.id, email, name };
}

/** A signed-in client: carries its own session cookie and the CSRF proof. */
async function signIn(email: string) {
    const res = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client', Origin: BASE },
        body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (!res.ok) throw new Error(`login ${email} → ${res.status} ${await res.text()}`);
    const cookie = res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');

    const call = async (method: string, path: string, body?: unknown) => {
        const r = await fetch(`${BASE}${path}`, {
            method,
            redirect: 'manual',
            headers: {
                Cookie: cookie,
                'X-Requested-By': 'cheapestgo-client',
                Origin: BASE,
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const text = await r.text();
        let json: any = null;
        try { json = JSON.parse(text); } catch { /* html or empty */ }
        return { status: r.status, json, text };
    };
    return { cookie, get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b) };
}

const listIds = (r: { json: any }) => (r.json?.conversations ?? []).map((c: any) => c.id) as string[];

async function main() {
    console.log(`run ${run} — against ${BASE}, local DB\n`);

    const admin = await makeUser('admin', 'Admin');
    const aida = await makeUser('support_agent', 'Aida');
    const ben = await makeUser('support_agent', 'Ben');
    const cust = await makeUser('user', 'Customer');

    const [A, AI, B, C] = await Promise.all([signIn(admin.email), signIn(aida.email), signIn(ben.email), signIn(cust.email)]);
    console.log('signed in: admin, Aida, Ben, customer\n');

    // Live admin stream, listening throughout.
    const events: any[] = [];
    const streamAbort = new AbortController();
    void (async () => {
        try {
            const res = await fetch(`${BASE}/api/admin/support/stream`, { headers: { Cookie: A.cookie }, signal: streamAbort.signal });
            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                for (const frame of buffer.split('\n\n').slice(0, -1)) {
                    const data = frame.match(/^data: (.*)$/m)?.[1];
                    if (frame.includes('event: activity') && data) events.push(JSON.parse(data));
                }
                buffer = buffer.split('\n\n').at(-1) ?? '';
            }
        } catch { /* aborted */ }
    })();

    console.log('1. A customer opens a chat');
    const opened = await C.post('/api/support/conversation', { locale: 'en' });
    check('customer opens a conversation', opened.status === 200 || opened.status === 201, `${opened.status} ${opened.text.slice(0, 120)}`);
    const convId: string = opened.json?.conversation?.id;
    const sent = await C.post('/api/support/conversation/messages', { body: 'Hi, I cannot find my booking.' });
    check('customer message delivered', sent.status === 200 || sent.status === 201, `${sent.status} ${sent.text.slice(0, 120)}`);

    console.log('\n2. It sits in Unassigned; nobody can race for it');
    const adminList = await A.get('/api/admin/support/conversations');
    check('admin lands on Unassigned, chat is there', adminList.json?.filter === 'unassigned' && listIds(adminList).includes(convId), JSON.stringify(adminList.json?.filter));
    check('admin badge counts Unassigned', (adminList.json?.counts?.waiting ?? 0) >= 1);
    const aidaDefault = await AI.get('/api/admin/support/conversations');
    check("Aida lands on Mine, and it is not there", aidaDefault.json?.filter === 'mine' && !listIds(aidaDefault).includes(convId));
    const aidaQueue = await AI.get('/api/admin/support/conversations?filter=unassigned');
    check('Aida can read the Unassigned queue', listIds(aidaQueue).includes(convId));
    const aidaDetail = await AI.get(`/api/admin/support/conversations/${convId}`);
    check('Aida can open and read it', aidaDetail.status === 200 && aidaDetail.json?.messages?.length >= 1, String(aidaDetail.status));
    const aidaReply = await AI.post(`/api/admin/support/conversations/${convId}/messages`, { body: 'I will take this!' });
    check('Aida cannot reply to an Unassigned chat (403)', aidaReply.status === 403, `${aidaReply.status} ${aidaReply.text.slice(0, 100)}`);
    const aidaAssign = await AI.post(`/api/admin/support/conversations/${convId}/assign`, { toAdminId: aida.id });
    check('Aida cannot assign it to herself (403)', aidaAssign.status === 403, String(aidaAssign.status));
    const aidaAgents = await AI.get('/api/admin/support/agents');
    check('Aida cannot see the team tally (403)', aidaAgents.status === 403, String(aidaAgents.status));

    console.log('\n3. The admin gives it to Aida');
    const team = await A.get('/api/admin/support/agents');
    check('admin gets the list of people to assign to', (team.json?.agents ?? []).some((a: any) => a.id === aida.id));
    const assigned = await A.post(`/api/admin/support/conversations/${convId}/assign`, { toAdminId: aida.id });
    check('admin assigns to Aida', assigned.status === 200, `${assigned.status} ${assigned.text.slice(0, 100)}`);
    await new Promise(r => setTimeout(r, 800));
    check('the live stream announced it (no message id)', events.some(e => e.conversationId === convId && e.messageId === null), JSON.stringify(events.slice(-3)));
    const aidaMine = await AI.get('/api/admin/support/conversations');
    check("it is in Aida's Mine, and her badge counts it", listIds(aidaMine).includes(convId) && aidaMine.json?.counts?.waiting >= 1);
    const named = (await A.get('/api/admin/support/conversations?filter=assigned')).json?.conversations?.find((c: any) => c.id === convId);
    check('the Assigned view names her', named?.assignedAdminName === 'Aida', JSON.stringify(named?.assignedAdminName));

    console.log('\n4. Only Aida writes; admin helps without taking it');
    const aidaOk = await AI.post(`/api/admin/support/conversations/${convId}/messages`, { body: 'Hello, I have your chat now.' });
    check('Aida replies in her own chat', aidaOk.status === 201, `${aidaOk.status} ${aidaOk.text.slice(0, 100)}`);
    const benReply = await B.post(`/api/admin/support/conversations/${convId}/messages`, { body: 'Ben here.' });
    check("Ben cannot reply in Aida's chat (403)", benReply.status === 403, String(benReply.status));
    const benResolve = await B.post(`/api/admin/support/conversations/${convId}/resolve`);
    check("Ben cannot resolve Aida's chat (403)", benResolve.status === 403, String(benResolve.status));
    const benReturn = await B.post(`/api/admin/support/conversations/${convId}/return`);
    check("Ben cannot give back Aida's chat (403)", benReturn.status === 403, String(benReturn.status));
    const adminReply = await A.post(`/api/admin/support/conversations/${convId}/messages`, { body: 'Admin adding a detail.' });
    const stillAida = (await A.get(`/api/admin/support/conversations/${convId}`)).json?.conversation?.assignedAdminId;
    check('admin replies without taking it', adminReply.status === 201 && stillAida === aida.id, `${adminReply.status} owner=${stillAida}`);
    const custSees = await C.get('/api/support/conversation/messages');
    const bodies = (custSees.json?.messages ?? []).map((m: any) => m.body);
    check('customer sees both replies', bodies.includes('Hello, I have your chat now.') && bodies.includes('Admin adding a detail.'), JSON.stringify(bodies));

    console.log('\n5. Aida gives it back; admin gives it to Ben; Ben resolves');
    const gaveBack = await AI.post(`/api/admin/support/conversations/${convId}/return`);
    check('Aida gives it back', gaveBack.status === 200, String(gaveBack.status));
    check('it is Unassigned again', listIds(await A.get('/api/admin/support/conversations?filter=unassigned')).includes(convId));
    await A.post(`/api/admin/support/conversations/${convId}/assign`, { toAdminId: ben.id });
    const resolved = await B.post(`/api/admin/support/conversations/${convId}/resolve`);
    check('Ben resolves his chat', resolved.status === 200, String(resolved.status));
    const tally = (await A.get('/api/admin/support/agents')).json?.tally ?? [];
    const of = (id: string) => tally.find((t: any) => t.adminId === id);
    check('the tally credits Ben, not Aida', of(ben.id)?.handled === 1 && of(aida.id)?.handled === 0, JSON.stringify([of(aida.id), of(ben.id)]));

    console.log('\n6. The customer comes back');
    await C.post('/api/support/conversation/messages', { body: 'One more question, please.' });
    const reopenedDetail = (await A.get(`/api/admin/support/conversations/${convId}`)).json?.conversation;
    check('reopened into Unassigned, owner dropped', reopenedDetail?.status === 'waiting_human' && reopenedDetail?.assignedAdminId === null, JSON.stringify(reopenedDetail?.status));

    console.log('\n7. Aida stops being a Support Agent');
    await A.post(`/api/admin/support/conversations/${convId}/assign`, { toAdminId: aida.id });
    const demoted = await A.post('/api/admin/promote', { userId: aida.id, newRole: 'user' });
    check('admin changes her role', demoted.status === 200, `${demoted.status} ${demoted.text.slice(0, 100)}`);
    const afterDemote = (await A.get(`/api/admin/support/conversations/${convId}`)).json?.conversation?.assignedAdminId;
    check('her open chat went back to Unassigned', afterDemote === null, String(afterDemote));

    console.log('\n8. The recorded history');
    const history = await sql<{ kind: string }[]>`
        SELECT kind FROM support_assignment_events WHERE conversation_id = ${convId} ORDER BY created_at, id`;
    const kinds = history.map(h => h.kind).join(' → ');
    check('every change is on record', kinds === 'assigned → returned → assigned → resolved → reopened → assigned → released', kinds);

    console.log('\n9. The pages render');
    const deskAida = await B.get('/admin/desk');
    check("Ben's desk renders", deskAida.status === 200 && deskAida.text.includes('Mine'), String(deskAida.status));
    const adminPage = await A.get('/admin/support');
    check("the admin's inbox renders", adminPage.status === 200 && adminPage.text.includes('Unassigned'), String(adminPage.status));

    streamAbort.abort();
}

try {
    await main();
} catch (err) {
    failures++;
    console.error('\nSMOKE ERRORED:', err);
} finally {
    // Chats first (their users are ON DELETE SET NULL), then the throwaway users.
    await sql`DELETE FROM support_conversations
               WHERE user_id = ANY(${sql.array(userIds)}::uuid[])`.catch(e => console.error('cleanup chats:', e.message));
    await sql`DELETE FROM users WHERE id = ANY(${sql.array(userIds)}::uuid[])`.catch(e => console.error('cleanup users:', e.message));
    await sql.end();
    console.log(failures ? `\nFAIL — ${failures} check(s) failed.` : '\nOK — every check passed.');
    process.exit(failures ? 1 : 0);
}
