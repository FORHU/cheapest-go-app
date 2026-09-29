/**
 * LIVE, read-only: the state of Support Chats and Assignment right now.
 *
 *   node scratch/check-live-support-state.mjs [CS-REFERENCE]
 */
import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/^\s*RDS_DATABASE_URL\s*=\s*(.*?)\s*$/m)[1].replace(/^["']|["']$/g, '');
const sql = postgres(url, { ssl: { rejectUnauthorized: false }, max: 1, connect_timeout: 25 });
const ref = process.argv[2];

const [{ t }] = await sql`SELECT to_regclass('public.support_assignment_events') AS t`;
const recorded = await sql`SELECT version FROM schema_migrations WHERE version LIKE '2026091100000%' ORDER BY version`;
console.log(`assignment events table: ${t ? 'present' : 'MISSING'}`);
console.log(`recorded: ${recorded.map(r => r.version).join(', ') || '(none)'}\n`);

const staff = await sql`
    SELECT id, email, role FROM users WHERE role IN ('admin', 'support_agent') ORDER BY role, email`;
console.log('staff:');
for (const s of staff) console.log(`  ${s.role.padEnd(14)} ${s.email}`);

const byOwner = await sql`
    SELECT c.status, COALESCE(u.email, '(unassigned)') AS owner, u.role, count(*)::int AS n
      FROM support_conversations c LEFT JOIN users u ON u.id = c.assigned_admin_id
     GROUP BY 1, 2, 3 ORDER BY 1, 2`;
console.log('\nconversations by status and owner:');
for (const r of byOwner) console.log(`  ${r.status.padEnd(14)} ${String(r.n).padStart(3)}  ${r.owner}${r.role ? ` (${r.role})` : ''}`);

if (t) {
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM support_assignment_events`;
    console.log(`\nassignment events recorded: ${n}`);
}

if (ref) {
    const [c] = await sql`
        SELECT c.id, c.reference, c.status, c.created_at, c.last_message_at, u.email AS owner
          FROM support_conversations c LEFT JOIN users u ON u.id = c.assigned_admin_id
         WHERE c.reference = ${ref}`;
    if (!c) { console.log(`\n${ref}: not found`); }
    else {
        console.log(`\n${ref}: ${c.status}, owner ${c.owner ?? '(none)'}, opened ${c.created_at.toISOString()}`);
        const msgs = await sql`
            SELECT created_at, sender_type, left(body, 60) AS body FROM support_messages
             WHERE conversation_id = ${c.id} ORDER BY created_at`;
        for (const m of msgs) console.log(`  ${m.created_at.toISOString().slice(0, 16)} ${m.sender_type.padEnd(6)} ${m.body}`);
        if (t) {
            const ev = await sql`
                SELECT e.created_at, e.kind, f.email AS from_email, o.email AS to_email
                  FROM support_assignment_events e
                  LEFT JOIN users f ON f.id = e.from_admin_id
                  LEFT JOIN users o ON o.id = e.to_admin_id
                 WHERE e.conversation_id = ${c.id} ORDER BY e.created_at`;
            for (const e of ev) console.log(`  event ${e.created_at.toISOString().slice(0, 16)} ${e.kind} ${e.from_email ?? ''} → ${e.to_email ?? ''}`);
        }
    }
}
await sql.end();
