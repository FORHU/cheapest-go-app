/**
 * Smoke-test every new support-ticketing SQL path against the real schema.
 *
 * Everything runs inside ONE transaction that is always rolled back, so this exercises the
 * live database's actual constraints, defaults and indexes without leaving a row behind.
 * That matters more than it sounds: the parts most likely to be wrong here are not the
 * TypeScript but the SQL — a CHECK that accepts a value it should refuse, an ON CONFLICT
 * that overwrites attribution, an ordering expression that reads three tables.
 *
 *   node scratch/smoke-support-ticketing.mjs
 */
import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g, '');
const sql = postgres(url, { ssl: { rejectUnauthorized: false }, max: 1, connect_timeout: 30, onnotice: () => {} });

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
    if (ok) { pass++; console.log(`  ok    ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
};

try {
    await sql.begin(async tx => {
        // ── fixtures ──────────────────────────────────────────────────────────────────
        const [user] = await tx`
            INSERT INTO users (id, email, role)
            VALUES (gen_random_uuid(), ${'smoke-' + Date.now() + '@example.invalid'}, 'user')
            RETURNING id`;
        const [agent] = await tx`
            INSERT INTO users (id, email, role)
            VALUES (gen_random_uuid(), ${'smoke-agent-' + Date.now() + '@example.invalid'}, 'admin')
            RETURNING id`;

        console.log('\n── Chat Reference ──');
        const [convA] = await tx`
            INSERT INTO support_conversations (user_id, status, locale)
            VALUES (${user.id}, 'waiting_human', 'en') RETURNING id, reference`;
        check('minted by the column default, no app involvement',
            /^CS-[0-9A-HJKMNP-TV-Z]{6}$/.test(convA.reference), convA.reference);

        const [convB] = await tx`
            INSERT INTO support_conversations (user_id, status, locale)
            VALUES (${user.id}, 'waiting_human', 'en') RETURNING id, reference`;
        check('two conversations get different references', convA.reference !== convB.reference);

        let dupBlocked = false;
        try {
            await tx`SAVEPOINT s1`;
            await tx`INSERT INTO support_conversations (user_id, status, locale, reference)
                     VALUES (${user.id}, 'waiting_human', 'en', ${convA.reference})`;
            await tx`RELEASE SAVEPOINT s1`;
        } catch { dupBlocked = true; await tx`ROLLBACK TO SAVEPOINT s1`; }
        check('a duplicate reference is refused by the unique index', dupBlocked);

        console.log('\n── Priority override ──');
        for (const p of ['low', 'normal', 'high', 'critical']) {
            await tx`UPDATE support_conversations SET priority = ${p} WHERE id = ${convA.id}`;
        }
        check('accepts every tier the UI offers', true);

        await tx`UPDATE support_conversations SET priority = NULL WHERE id = ${convA.id}`;
        const [cleared] = await tx`SELECT priority FROM support_conversations WHERE id = ${convA.id}`;
        check('null restores the computed value rather than defaulting to normal', cleared.priority === null);

        let badBlocked = false;
        try {
            await tx`SAVEPOINT s2`;
            await tx`UPDATE support_conversations SET priority = 'urgent' WHERE id = ${convA.id}`;
            await tx`RELEASE SAVEPOINT s2`;
        } catch { badBlocked = true; await tx`ROLLBACK TO SAVEPOINT s2`; }
        check('refuses a tier that is not one of the four', badBlocked);

        console.log('\n── Linked Bookings ──');
        // A stay starting tomorrow, owned by our fixture customer.
        const [trip] = await tx`
            INSERT INTO bookings (
                booking_id, user_id, booking_reference, check_in, check_out,
                property_name, room_name, total_price,
                holder_first_name, holder_last_name, holder_email, status
            )
            VALUES (
                ${'smoke-' + Date.now()}, ${user.id}, ${'CS-SMOKE1'},
                (now() + interval '18 hours')::date, (now() + interval '3 days')::date,
                'Smoke Test Hotel', 'Double', 100,
                'Smoke', 'Test', 'smoke@example.invalid', 'confirmed'
            )
            RETURNING booking_reference`;

        await tx`INSERT INTO support_conversation_bookings (conversation_id, booking_reference, linked_by)
                 VALUES (${convA.id}, ${trip.booking_reference}, NULL)`;
        await tx`INSERT INTO support_conversation_bookings (conversation_id, booking_reference, linked_by)
                 VALUES (${convA.id}, 'CG-NOTREAL', ${agent.id})`;

        const links = await tx`
            SELECT scb.booking_reference AS ref, scb.linked_by AS "linkedBy",
                   EXISTS (
                       SELECT 1 FROM bookings b WHERE b.booking_reference = scb.booking_reference
                       UNION ALL
                       SELECT 1 FROM flight_bookings fb WHERE fb.booking_reference = scb.booking_reference
                   ) AS known
              FROM support_conversation_bookings scb
             WHERE scb.conversation_id = ${convA.id} ORDER BY scb.linked_at`;
        check('a real reference reads as known',
            links.find(l => l.ref === 'CS-SMOKE1')?.known === true);
        check('a reference matching nothing reads as unknown',
            links.find(l => l.ref === 'CG-NOTREAL')?.known === false);
        check('the customer’s own link is recorded as theirs',
            links.find(l => l.ref === 'CS-SMOKE1')?.linkedBy === null);

        // Idempotent, and the first attribution stands.
        await tx`INSERT INTO support_conversation_bookings (conversation_id, booking_reference, linked_by)
                 VALUES (${convA.id}, ${trip.booking_reference}, ${agent.id})
                 ON CONFLICT (conversation_id, booking_reference) DO NOTHING`;
        const [again] = await tx`SELECT linked_by FROM support_conversation_bookings
                                  WHERE conversation_id = ${convA.id} AND booking_reference = ${trip.booking_reference}`;
        check('re-linking does not rewrite who named the trip', again.linked_by === null);

        console.log('\n── Internal Notes ──');
        const [note] = await tx`
            INSERT INTO support_notes (conversation_id, author_admin_id, body)
            VALUES (${convA.id}, ${agent.id}, 'Called the supplier.') RETURNING id`;
        check('a note is written', Boolean(note.id));

        const before = await tx`SELECT last_message_at FROM support_conversations WHERE id = ${convA.id}`;
        await tx`INSERT INTO support_notes (conversation_id, author_admin_id, body)
                 VALUES (${convA.id}, ${agent.id}, 'Second note.')`;
        const after = await tx`SELECT last_message_at FROM support_conversations WHERE id = ${convA.id}`;
        check('writing a note does not move the customer in the queue',
            String(before[0].last_message_at) === String(after[0].last_message_at));

        const mine = await tx`DELETE FROM support_notes WHERE id = ${note.id} AND author_admin_id = ${agent.id} RETURNING id`;
        check('an author can delete their own note', mine.length === 1);

        const [other] = await tx`INSERT INTO support_notes (conversation_id, author_admin_id, body)
                                 VALUES (${convA.id}, ${agent.id}, 'Someone else’s.') RETURNING id`;
        const notMine = await tx`DELETE FROM support_notes WHERE id = ${other.id} AND author_admin_id = ${user.id} RETURNING id`;
        check('a colleague’s note is not deletable', notMine.length === 0);

        console.log('\n── Urgency ordering (ADR-0039) ──');
        // convA has a trip starting in 18 hours; convB has none. convB wrote FIRST, so
        // strict FIFO would put it ahead — this is the whole point of the change.
        await tx`UPDATE support_conversations SET last_message_at = now() - interval '2 hours' WHERE id = ${convB.id}`;
        await tx`UPDATE support_conversations SET last_message_at = now() WHERE id = ${convA.id}`;

        const URG = fs.readFileSync('src/lib/server/support/urgency.ts', 'utf8')
            .match(/export const URGENCY_SQL = \/\* sql \*\/ `([\s\S]*?)`;/)[1]
            .split('${URGENCY_RANK.critical}').join('40')
            .split('${URGENCY_RANK.high}').join('30')
            .split('${URGENCY_RANK.normal}').join('20')
            .split('${URGENCY_RANK.low}').join('10')
            .split('${CRITICAL_WITHIN_HOURS}').join('24')
            .split('${HIGH_WITHIN_HOURS}').join('168');

        const queue = await tx.unsafe(`
            SELECT c.id, c.reference, ${URG} AS urgency, c.last_message_at
              FROM support_conversations c
             WHERE c.id IN ('${convA.id}','${convB.id}')
             ORDER BY ${URG} DESC, c.last_message_at ASC`);
        console.table(queue.map(r => ({ reference: r.reference, urgency: r.urgency })));
        check('the imminent trip is rated critical',
            Number(queue.find(r => r.id === convA.id).urgency) === 40);
        check('a chat with no trip is ordinary',
            Number(queue.find(r => r.id === convB.id).urgency) === 20);
        check('the traveller is answered before the earlier writer',
            queue[0].id === convA.id);

        // And an Agent can overrule it back down.
        await tx`UPDATE support_conversations SET priority = 'low' WHERE id = ${convA.id}`;
        const queue2 = await tx.unsafe(`
            SELECT c.id, ${URG} AS urgency FROM support_conversations c
             WHERE c.id = '${convA.id}'`);
        check('an Agent’s override beats the dates', Number(queue2[0].urgency) === 10);

        throw new Error('__rollback__');
    });
} catch (e) {
    if (e.message !== '__rollback__') { fail++; console.error('\nTHREW:', e.message); }
}

console.log(`\nrolled back — live is unchanged`);
console.log(`${pass} passed, ${fail} failed`);
await sql.end();
process.exit(fail === 0 ? 0 : 1);
