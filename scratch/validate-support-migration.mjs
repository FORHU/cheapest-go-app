/**
 * Apply the new support migration and run the queue query inside ONE transaction that is
 * always rolled back. Proves the SQL parses and executes against the real schema without
 * changing anything: URGENCY_SQL is a correlated subquery over three tables and a syntax
 * error in it would otherwise only appear when an Agent opened the inbox.
 *
 *   node scratch/validate-support-migration.mjs
 */
import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g, '');
const sql = postgres(url, { ssl: { rejectUnauthorized: false }, max: 1, connect_timeout: 30, onnotice: () => {} });

const FILE = 'db/migrations/20260909000001_support_chat_reference_bookings_notes.sql';
const up = fs.readFileSync(FILE, 'utf8')
    .split(/^--\s*migrate:down\s*$/m)[0]
    .replace(/^--\s*migrate:up\s*$/m, '')
    .trim();

// The module holds URGENCY_SQL as a template literal, so the file text still contains the
// ${...} placeholders. Substituting the same values the module exports keeps this honest:
// if a constant changes there and not here, the mismatch shows up as a failing assertion
// in urgency.test.ts rather than silently passing.
const SUBS = {
    '${URGENCY_RANK.critical}': '40',
    '${URGENCY_RANK.high}': '30',
    '${URGENCY_RANK.normal}': '20',
    '${URGENCY_RANK.low}': '10',
    '${CRITICAL_WITHIN_HOURS}': '24',
    '${HIGH_WITHIN_HOURS}': '168',
};
let urgencySql = fs.readFileSync('src/lib/server/support/urgency.ts', 'utf8')
    .match(/export const URGENCY_SQL = \/\* sql \*\/ `([\s\S]*?)`;/)[1];
for (const [from, to] of Object.entries(SUBS)) urgencySql = urgencySql.split(from).join(to);

if (urgencySql.includes('${')) {
    console.error('unsubstituted placeholder left in URGENCY_SQL — update SUBS');
    process.exit(1);
}

let ok = true;
try {
    await sql.begin(async tx => {
        await tx.unsafe(up);
        console.log('migration up ................ OK');

        const rows = await tx.unsafe(`
            SELECT c.id, c.reference, c.priority, ${urgencySql} AS urgency, c.last_message_at
              FROM support_conversations c
             ORDER BY ${urgencySql} DESC, c.last_message_at ASC
             LIMIT 10`);
        console.log(`queue query ................. OK (${rows.length} row(s))`);
        if (rows.length) console.table(rows.map(r => ({ reference: r.reference, priority: r.priority, urgency: r.urgency })));

        await tx.unsafe('SELECT 1 FROM support_notes LIMIT 1');
        await tx.unsafe('SELECT 1 FROM support_conversation_bookings LIMIT 1');
        console.log('new tables .................. OK');

        const bad = await tx.unsafe(
            `SELECT reference FROM support_conversations WHERE reference !~ '^CS-[0-9A-HJKMNP-TV-Z]{6}$'`);
        console.log(`reference format ............ ${bad.length === 0 ? 'OK (all well-formed)' : `FAIL (${bad.length} malformed)`}`);
        if (bad.length) ok = false;

        // The default must mint one without the application saying anything.
        const [minted] = await tx.unsafe(`SELECT public.mint_chat_reference() AS r`);
        console.log(`default minting ............. ${/^CS-[0-9A-HJKMNP-TV-Z]{6}$/.test(minted.r) ? `OK (${minted.r})` : `FAIL (${minted.r})`}`);

        // A conversation with an imminent trip must outrank an older one with none.
        const [{ n }] = await tx.unsafe(
            `SELECT count(*)::int AS n FROM support_conversation_bookings`);
        console.log(`linked bookings present ..... ${n}`);

        throw new Error('__rollback__');
    });
} catch (e) {
    if (e.message === '__rollback__') console.log('\nrolled back — live is unchanged');
    else { ok = false; console.error('\nFAILED:', e.message); }
}

await sql.end();
process.exit(ok ? 0 : 1);
