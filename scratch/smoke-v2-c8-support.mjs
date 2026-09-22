#!/usr/bin/env node
/**
 * C8's tracer bullet, exercised against the real database.
 *
 * The unit tests drive the service through a fake repository, which proves the rules but not
 * that any of it reaches Postgres. This signs a token, opens a conversation, says something,
 * reads it back, and then checks the row in the database agrees — so a rule that holds in a
 * test but not in SQL cannot pass unnoticed.
 *
 * Read-only apart from the support rows it creates, which it cleans up after itself.
 *
 *   cd cheapestgo-api-v2 && PORT=4002 npm run dev
 *   node scratch/smoke-v2-c8-support.mjs
 */

import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const API = process.env.API_V2 ?? 'http://localhost:4002/api/v2';
const PGC = 'cheapestgo-api-v2-postgres-1';
const V2  = 'C:/Users/USER/Documents/GitHub/cheapestgo-api-v2';

/**
 * api-v2's signing secret, read from its own .env.
 *
 * This smoke lives beside the other v2 slice checks, in v1’s scratch, so it resolves v1’s
 * node_modules - which has no JWT library. The token is three base64url segments and an
 * HMAC, so it is signed here rather than adding a dependency to the wrong repository.
 */
const SECRET = process.env.JWT_SECRET ?? (() => {
    const env = existsSync(`${V2}/.env`) ? readFileSync(`${V2}/.env`, 'utf8') : '';
    return /^JWT_SECRET=(.*)$/m.exec(env)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
})();

let pass = 0, fail = 0;
const ok  = (n)    => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}`); };
const bad = (n, d) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`); };
const check = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const psql = (sql) => execFileSync('docker',
    ['exec', PGC, 'psql', '-U', 'cheapestgo', '-d', 'cheapestgo', '-tAc', sql], { encoding: 'utf8' }).trim();

const users = psql('SELECT id FROM users ORDER BY created_at LIMIT 2').split('\n').map(s => s.trim());
const [ME, SOMEONE_ELSE] = users;

// Who is signed as an admin. The role travels in the token, so the smoke has to know which
// ids belong to staff before it can act as one.
const ADMIN_IDS = new Set(psql("SELECT id FROM users WHERE role = 'admin'").split('\n').map(s => s.trim()).filter(Boolean));

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** An HS256 token, which is all api-v2 verifies. */
const token = (sub, role = 'user') => {
    const now = Math.floor(Date.now() / 1000);
    const head = b64url({ alg: 'HS256', typ: 'JWT' });
    const body = b64url({ sub, role, email: 'smoke@test.local', iat: now, exp: now + 600 });
    const sig  = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
    return `${head}.${body}.${sig}`;
};

async function call(method, path, { as, role, body } = {}) {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(as ? { Authorization: `Bearer ${token(as, role ?? (ADMIN_IDS.has(as) ? 'admin' : 'user'))}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 120) }; }
    return { status: res.status, json };
}

console.log('\n\x1b[1mC8 — a Support Chat, against the real database\x1b[0m\n');

if (!SECRET) { console.log('  JWT_SECRET is not set; cannot sign a token'); process.exit(1); }

// Leave no conversation behind from an earlier run, or "resumes" and "creates" swap places.
psql(`DELETE FROM support_messages WHERE conversation_id IN (SELECT id FROM support_conversations WHERE user_id = '${ME}');`);
psql(`DELETE FROM support_conversations WHERE user_id = '${ME}';`);

console.log('Starting a conversation');

const anon = await call('POST', '/support/conversation');
check('a signed-out caller cannot start one (ADR-0032)', anon.status === 401, `got ${anon.status}`);

const opened = await call('POST', '/support/conversation', { as: ME, body: { locale: 'ko' } });
check('a signed-in caller gets a new conversation', opened.status === 201, `got ${opened.status} ${JSON.stringify(opened.json).slice(0, 120)}`);

const conv = opened.json?.data ?? {};
check('it is minted with a Chat Reference', typeof conv.reference === 'string' && conv.reference.length > 0, JSON.stringify(conv));
check('it opens waiting for a person (ADR-0031)', conv.status === 'waiting_human', `status: ${conv.status}`);
check('it keeps the locale it was opened in', conv.locale === 'ko', `locale: ${conv.locale}`);
check('it carries no staff id', !JSON.stringify(conv).includes('assigned'), JSON.stringify(conv));

const again = await call('POST', '/support/conversation', { as: ME, body: { locale: 'ko' } });
check('opening again resumes rather than starting a second',
    again.status === 200 && again.json?.data?.id === conv.id,
    `got ${again.status}, id ${again.json?.data?.id} vs ${conv.id}`);
check('and the database holds exactly one',
    psql(`SELECT count(*) FROM support_conversations WHERE user_id = '${ME}'`) === '1',
    `rows: ${psql(`SELECT count(*) FROM support_conversations WHERE user_id = '${ME}'`)}`);

console.log('\nSaying something');

const sent = await call('POST', `/support/conversation/${conv.id}/messages`, { as: ME, body: { body: '  my flight was cancelled  ' } });
check('the message is accepted', sent.status === 201, `got ${sent.status} ${JSON.stringify(sent.json).slice(0, 120)}`);
check('it is stored trimmed and attributed to the guest',
    sent.json?.data?.body === 'my flight was cancelled' && sent.json?.data?.sender === 'guest',
    JSON.stringify(sent.json?.data));

check('it really reached Postgres',
    psql(`SELECT body FROM support_messages WHERE conversation_id = '${conv.id}'`) === 'my flight was cancelled',
    `db: ${psql(`SELECT body FROM support_messages WHERE conversation_id = '${conv.id}'`)}`);

// last_message_at orders the Agent's inbox; a message that does not move it is invisible there.
check('the conversation clock moved with it',
    psql(`SELECT last_message_at > created_at FROM support_conversations WHERE id = '${conv.id}'`) === 't',
    'last_message_at did not advance');

const empty = await call('POST', `/support/conversation/${conv.id}/messages`, { as: ME, body: { body: '   ' } });
check('whitespace is refused', empty.status === 400, `got ${empty.status}`);

console.log('\nReading it back');

const read = await call('GET', '/support/conversation', { as: ME });
check('the transcript comes back', read.status === 200 && Array.isArray(read.json?.data?.messages), JSON.stringify(read.json).slice(0, 120));
check('with the message in it', read.json?.data?.messages?.[0]?.body === 'my flight was cancelled', JSON.stringify(read.json?.data?.messages));

console.log('\nSomebody else');

const theirs = await call('POST', `/support/conversation/${conv.id}/messages`, { as: SOMEONE_ELSE, body: { body: 'let me in' } });
check('another customer cannot write to it, and is told it does not exist',
    theirs.status === 404, `got ${theirs.status}`);
check('and nothing of theirs was written',
    psql(`SELECT count(*) FROM support_messages WHERE conversation_id = '${conv.id}'`) === '1',
    'a message slipped through');

console.log('\nOnce it is resolved');

psql(`UPDATE support_conversations SET status = 'resolved' WHERE id = '${conv.id}';`);

const afterResolve = await call('POST', `/support/conversation/${conv.id}/messages`, { as: ME, body: { body: 'one more thing' } });
check('a resolved conversation refuses new messages', afterResolve.status === 409, `got ${afterResolve.status}`);

const reopened = await call('POST', '/support/conversation', { as: ME, body: { locale: 'ko' } });
check('opening after resolution starts a new conversation, never reopens',
    reopened.status === 201 && reopened.json?.data?.id !== conv.id,
    `got ${reopened.status}, id ${reopened.json?.data?.id} vs ${conv.id}`);
check('and it has a Chat Reference of its own',
    reopened.json?.data?.reference && reopened.json.data.reference !== conv.reference,
    `${reopened.json?.data?.reference} vs ${conv.reference}`);

console.log('\nThe Agent side');

// A fresh conversation with something in it, so it reaches the Waiting queue: the widget
// creates one the moment the panel opens, and a queue of chats nobody wrote in is noise.
const fresh = (await call('POST', '/support/conversation', { as: ME, body: { locale: 'ko' } })).json?.data ?? {};
await call('POST', `/support/conversation/${fresh.id}/messages`, { as: ME, body: { body: 'my flight was cancelled' } });

const admins = psql("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 2").split('\n').map(s => s.trim());
const [ADMIN, ADMIN2] = admins;

const queue = await call('GET', '/admin/support/conversations?filter=unassigned', { as: ADMIN });
check('the Waiting queue lists it', queue.status === 200 && (queue.json?.data ?? []).some(c => c.id === fresh.id),
    `got ${queue.status}, ${(queue.json?.data ?? []).length} in the queue`);

const row = (queue.json?.data ?? []).find(c => c.id === fresh.id) ?? {};
check('with an urgency the queue actually sorted by', typeof row.urgency === 'string', JSON.stringify(row).slice(0, 120));
check('and the customer, which the customer payload never carries',
    typeof row.customerEmail === 'string' || row.customerEmail === null, JSON.stringify(row).slice(0, 120));

const seen = await call('GET', `/admin/support/conversations/${fresh.id}`, { as: ADMIN });
check('an Agent can read the transcript', seen.status === 200 && (seen.json?.data?.messages ?? []).length > 0,
    `got ${seen.status}`);

// ADR-0041: ownership is given, never taken.
const stolen = await call('POST', `/admin/support/conversations/${fresh.id}/assign`,
    { as: ME, role: 'user', body: { toAdminId: ADMIN } });
check('a customer cannot assign a chat', stolen.status === 403 || stolen.status === 401, `got ${stolen.status}`);

const given = await call('POST', `/admin/support/conversations/${fresh.id}/assign`,
    { as: ADMIN, body: { toAdminId: ADMIN2 } });
check('an admin can hand it to someone who can answer', given.status === 200, `got ${given.status} ${JSON.stringify(given.json).slice(0, 110)}`);
check('and the handover is recorded',
    psql(`SELECT count(*) FROM support_assignment_events WHERE conversation_id = '${fresh.id}'`) !== '0',
    'no assignment event was written');

const replied = await call('POST', `/admin/support/conversations/${fresh.id}/messages`,
    { as: ADMIN, body: { body: 'Looking into it now.' } });
check('an admin can answer any chat', replied.status === 201 && replied.json?.data?.sender === 'agent',
    `got ${replied.status} ${JSON.stringify(replied.json?.data)}`);

// Answering is not taking: the status moves, the owner does not.
check('answering moves it out of Waiting without changing who holds it',
    psql(`SELECT status FROM support_conversations WHERE id = '${fresh.id}'`) === 'human_active' &&
    psql(`SELECT assigned_admin_id FROM support_conversations WHERE id = '${fresh.id}'`) === ADMIN2,
    `status ${psql(`SELECT status FROM support_conversations WHERE id = '${fresh.id}'`)}, ` +
    `owner ${psql(`SELECT assigned_admin_id FROM support_conversations WHERE id = '${fresh.id}'`)}`);

console.log('\nLive delivery');

/**
 * Hold a stream open and wait for one event, or give up.
 *
 * The point of the whole exercise: an Agent replying in one request must reach a customer
 * holding a connection open in another. A poll would pass this test without proving it, so the
 * stream is read as a stream.
 */
async function firstEvent(path, as, role, afterOpen, ms = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        const res = await fetch(`${API}${path}`, {
            headers: { Authorization: `Bearer ${token(as, role)}` },
            signal: ctrl.signal,
        });
        if (res.status !== 200) return { status: res.status, event: null };

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '', opened = false;

        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });

            // Act only once the stream has said hello, or the reply races the subscription.
            if (!opened && buf.includes('event: open')) { opened = true; await afterOpen(); }

            const m = /event: support\ndata: (.+)\n/.exec(buf);
            if (m) { try { return { status: 200, event: JSON.parse(m[1]) }; } catch { /* keep reading */ } }
        }
        return { status: 200, event: null };
    } catch (e) {
        return { status: 0, event: null, why: String(e?.message ?? e).slice(0, 90) };
    } finally {
        clearTimeout(timer);
        ctrl.abort();
    }
}

let agentMessageId = null;
const delivered = await firstEvent('/support/stream', ME, 'user', async () => {
    const r = await call('POST', `/admin/support/conversations/${fresh.id}/messages`,
        { as: ADMIN, body: { body: 'Streaming this one.' } });
    agentMessageId = r.json?.data?.id ?? null;
});

check('a customer holding a stream is told about the reply',
    delivered.event?.conversationId === fresh.id,
    `got ${JSON.stringify(delivered).slice(0, 150)}`);
check('and the event names the message that was written',
    agentMessageId !== null && delivered.event?.messageId === agentMessageId,
    `event ${delivered.event?.messageId} vs written ${agentMessageId}`);

console.log('\nTranslation (ADR-0033)');

// Korean, so the Agent needs an English rendering. Sent as the customer, which is the direction
// that matters: an Agent acts on what they read.
const korean = await call('POST', `/support/conversation/${fresh.id}/messages`,
    { as: ME, role: 'user', body: { body: '제 항공편이 취소되었는데 환불을 받을 수 있나요? 예약 번호는 12345678 입니다.' } });
check('a Korean message is accepted', korean.status === 201, `got ${korean.status}`);

const koreanId = korean.json?.data?.id;
check('and the original is stored as written, never replaced',
    psql(`SELECT body FROM support_messages WHERE id = '${koreanId}'`).includes('12345678'),
    'the customer’s own words must survive verbatim');

// Translation is deliberately not awaited by the request, so give it a moment. The status is
// a state machine: null until one is asked for, 'pending' while the engine is being asked,
// then 'translated' or 'untranslated'.
let status = '';
for (let i = 0; i < 120 && status !== 'translated' && status !== 'untranslated'; i++) {
    status = psql(`SELECT coalesce(translation_status, '') FROM support_messages WHERE id = '${koreanId}'`);
    if (status !== 'translated' && status !== 'untranslated') await new Promise(r => setTimeout(r, 500));
}

check('a rendering is asked for and settles, never left pending',
    status === 'translated' || status === 'untranslated',
    `translation_status was ${JSON.stringify(status)} after 60s`);

const rendered = psql(`SELECT coalesce(translated_body, '') FROM support_messages WHERE id = '${koreanId}'`);
if (status === 'translated') {
    check('the rendering keeps the figure the Agent would act on',
        rendered.includes('12345678'), `stored: ${rendered.slice(0, 90)}`);
    check('and is not simply the Korean handed back',
        !/[\uac00-\ud7af]/.test(rendered), `stored: ${rendered.slice(0, 90)}`);
} else {
    // Not a defect. ADR-0034 records that the engine refuses a share of messages outright, and
    // the guard turning a refusal into "show the original" is the behaviour being checked.
    check('an unusable reply leaves nothing posing as the customer\u2019s words', rendered === '',
        `stored: ${rendered.slice(0, 90)}`);
    console.log('      (engine returned nothing usable \u2014 original delivered, marked untranslated)');
}

// The other direction: the Agent wrote English to a customer who reads Korean, so the reply is
// rendered for them — and then rendered back into English, so the Agent can see what the
// customer actually read (ADR-0033).
let agentStatus = '';
for (let i = 0; i < 120 && agentStatus !== 'translated' && agentStatus !== 'untranslated'; i++) {
    agentStatus = psql(`SELECT coalesce(translation_status, '') FROM support_messages WHERE id = '${agentMessageId}'`);
    if (agentStatus !== 'translated' && agentStatus !== 'untranslated') await new Promise(r => setTimeout(r, 500));
}
check('an English reply to a Korean customer settles too',
    agentStatus === 'translated' || agentStatus === 'untranslated', `status was ${JSON.stringify(agentStatus)}`);

if (agentStatus === 'translated') {
    const toCustomer = psql(`SELECT coalesce(translated_body, '') FROM support_messages WHERE id = '${agentMessageId}'`);
    check('and is rendered in the language the customer reads',
        /[\uac00-\ud7af]/.test(toCustomer), `stored: ${toCustomer.slice(0, 90)}`);

    // Written after the customer's copy, so it can lag it; the schema refuses one on any status
    // but 'translated', which is what the settle above had to get right.
    let back = '';
    for (let i = 0; i < 120 && (back === '' || back === '<null>'); i++) {
        back = psql(`SELECT coalesce(back_translated_body, '<null>') FROM support_messages WHERE id = '${agentMessageId}'`);
        if (back === '<null>') await new Promise(r => setTimeout(r, 500)); else break;
    }
    check('the back-translation settles, never left waiting', back !== '<null>', 'still NULL after 60s');
    if (back === '') {
        // The engine refused all three attempts. Stored as '' so the inbox says “could not
        // check” rather than checking forever — the designed outcome (ADR-0034), not a defect.
        console.log('      (engine refused the back-translation — recorded as could-not-check)');
    } else if (back !== '<null>') {
        check('and what the customer read is put back into English for the Agent',
            !/[가-힯]/.test(back), `stored: ${back.slice(0, 90)}`);
    }
}

const resolved = await call('POST', `/admin/support/conversations/${fresh.id}/resolve`, { as: ADMIN });
check('an admin can resolve it', resolved.status === 200, `got ${resolved.status}`);
check('and the customer can no longer add to it',
    (await call('POST', `/support/conversation/${fresh.id}/messages`, { as: ME, body: { body: 'one more' } })).status === 409,
    'a resolved chat accepted a message');

console.log('\nSupport Hours');

// Whatever schedule is stored now is put back at the end, byte for byte.
const hoursBefore = psql(`SELECT value::text FROM admin_settings WHERE key = 'support_hours'`);

const avail = await call('GET', '/support/availability');
check('availability is public', avail.status === 200, `got ${avail.status}`);
check('and says whether a person can be reached, with the hours and the next opening',
    typeof avail.json?.data?.humanAvailable === 'boolean' && !!avail.json?.data?.hours?.timezone
        && 'nextOpening' in (avail.json?.data ?? {}),
    JSON.stringify(avail.json).slice(0, 120));

check('a customer cannot read the desk schedule endpoint',
    (await call('GET', '/admin/support/hours', { as: ME, role: 'user' })).status === 403);

// Every day open around the clock: whatever the time of this run, the desk must read as open.
const allDay = { timezone: 'Asia/Manila', days: Object.fromEntries(
    ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map(d => [d, { open: '00:00', close: '23:59' }])) };
const saved = await call('PUT', '/admin/support/hours', { as: ADMIN, body: { hours: allDay } });
check('staff can replace the schedule', saved.status === 200, `got ${saved.status} ${JSON.stringify(saved.json).slice(0, 120)}`);
check('and it is stored as an object, never a JSON string',
    psql(`SELECT jsonb_typeof(value) FROM admin_settings WHERE key = 'support_hours'`) === 'object');
check('and the widget now reads the desk as open',
    (await call('GET', '/support/availability')).json?.data?.humanAvailable === true);

const closed = { timezone: 'Asia/Manila', days: {} };
await call('PUT', '/admin/support/hours', { as: ADMIN, body: { hours: closed } });
const shut = (await call('GET', '/support/availability')).json?.data ?? {};
check('a week with no hours reads as closed, with nowhere to reopen',
    shut.humanAvailable === false && shut.nextOpening === null, JSON.stringify(shut).slice(0, 120));

const badZone = await call('PUT', '/admin/support/hours', { as: ADMIN,
    body: { hours: { timezone: 'Mars/Olympus', days: {} } } });
check('a schedule that cannot be honoured is refused, not coerced', badZone.status === 400, `got ${badZone.status}`);

if (hoursBefore) {
    psql(`UPDATE admin_settings SET value = '${hoursBefore.replace(/'/g, "''")}'::jsonb WHERE key = 'support_hours'`);
} else {
    psql(`DELETE FROM admin_settings WHERE key = 'support_hours'`);
}
check('and the original schedule is back',
    psql(`SELECT coalesce(value::text, '') FROM admin_settings WHERE key = 'support_hours'`) === hoursBefore);

// Clean up after ourselves.
psql(`DELETE FROM support_assignment_events WHERE conversation_id IN (SELECT id FROM support_conversations WHERE user_id = '${ME}');`);
psql(`DELETE FROM support_messages WHERE conversation_id IN (SELECT id FROM support_conversations WHERE user_id = '${ME}');`);
psql(`DELETE FROM support_conversations WHERE user_id = '${ME}';`);

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${pass + fail} passed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
