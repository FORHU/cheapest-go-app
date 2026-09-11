/**
 * Read-only: the translation state of recent support messages, to tell "never translated"
 * from "translated, but the reader's screen never got the update".
 *
 *   node scratch/check-message-translation.mjs --local [text fragment]
 *   node scratch/check-message-translation.mjs [text fragment]          # live
 */
import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env', 'utf8');
const read = (name) => env.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*?)\\s*$`, 'm'))?.[1].replace(/^["']|["']$/g, '');
const local = process.argv.includes('--local');
const fragment = process.argv.slice(2).find(a => !a.startsWith('--'));
const url = local ? read('DATABASE_URL') : read('RDS_DATABASE_URL');
const host = url.match(/@([^/:?]+)/)?.[1];
const isLocal = /^(localhost|127\.0\.0\.1)$/.test(host);
console.log(`target: ${host}${isLocal ? '  (local)' : '  ** LIVE ** (read-only)'}\n`);

const sql = postgres(url, { ssl: isLocal ? false : { rejectUnauthorized: false }, max: 1, connect_timeout: 25 });

const rows = await sql`
    SELECT m.created_at, m.sender_type, c.locale, m.body,
           m.translation_status, m.translated_lang, m.translated_body
      FROM support_messages m
      JOIN support_conversations c ON c.id = m.conversation_id
     WHERE m.sender_type IN ('guest', 'agent')
       ${fragment ? sql`AND m.conversation_id IN (
            SELECT conversation_id FROM support_messages WHERE body ILIKE ${'%' + fragment + '%'})` : sql``}
     ORDER BY m.created_at DESC
     LIMIT 12
`;
for (const r of rows.reverse()) {
    console.log(`${r.created_at.toISOString().slice(11, 19)} ${r.sender_type.padEnd(5)} [${r.locale}] ${JSON.stringify(r.body.slice(0, 50))}`);
    console.log(`         status=${r.translation_status ?? 'null'} lang=${r.translated_lang ?? '-'} → ${r.translated_body ? JSON.stringify(r.translated_body.slice(0, 60)) : '-'}`);
}
await sql.end();
