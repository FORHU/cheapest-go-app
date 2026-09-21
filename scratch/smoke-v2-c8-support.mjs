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
import jwt from 'jsonwebtoken';
import 'dotenv/config';

const API = process.env.API_V2 ?? 'http://localhost:4002/api/v2';
const PGC = 'cheapestgo-api-v2-postgres-1';
const SECRET = process.env.JWT_SECRET;

let pass = 0, fail = 0;
const ok  = (n)    => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}`); };
const bad = (n, d) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${n}\n      ${d}`); };
const check = (n, c, d = '') => (c ? ok(n) : bad(n, d));

const psql = (sql) => execFileSync('docker',
    ['exec', PGC, 'psql', '-U', 'cheapestgo', '-d', 'cheapestgo', '-tAc', sql], { encoding: 'utf8' }).trim();

const users = psql('SELECT id FROM users ORDER BY created_at LIMIT 2').split('\n').map(s => s.trim());
const [ME, SOMEONE_ELSE] = users;

const token = (sub) => jwt.sign({ sub, role: 'user', email: 'smoke@test.local' }, SECRET, { expiresIn: '10m' });

async function call(method, path, { as, body } = {}) {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(as ? { Authorization: `Bearer ${token(as)}` } : {}),
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

const reopened = await call('POST', '/support/conversation', { as: ME, body: {} });
check('opening after resolution starts a new conversation, never reopens',
    reopened.status === 201 && reopened.json?.data?.id !== conv.id,
    `got ${reopened.status}, id ${reopened.json?.data?.id} vs ${conv.id}`);
check('and it has a Chat Reference of its own',
    reopened.json?.data?.reference && reopened.json.data.reference !== conv.reference,
    `${reopened.json?.data?.reference} vs ${conv.reference}`);

// Clean up after ourselves.
psql(`DELETE FROM support_messages WHERE conversation_id IN (SELECT id FROM support_conversations WHERE user_id = '${ME}');`);
psql(`DELETE FROM support_conversations WHERE user_id = '${ME}';`);

console.log(`\n${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${pass + fail} passed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
