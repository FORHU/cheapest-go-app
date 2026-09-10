import fs from 'fs'; import postgres from 'postgres';
const env=fs.readFileSync('.env','utf8');
const pick = k => (env.match(new RegExp('^'+k+'=(.*)$','m'))||[])[1]?.trim().replace(/^"|"$/g,'');
const target = process.argv[2]==='local' ? pick('DATABASE_URL') : pick('RDS_DATABASE_URL');
const isLocal = process.argv[2]==='local';
const sql=postgres(target,{ssl:isLocal?false:{rejectUnauthorized:false},max:1,connect_timeout:25,onnotice:()=>{}});
const label = isLocal ? 'LOCAL' : 'LIVE';
try {
  const [{n}] = await sql`select count(*)::int n from schema_migrations`;
  console.log(`${label} schema_migrations: ${n}`);
  const cols = await sql`select table_name, column_name from information_schema.columns
     where table_schema='public' and (
       (table_name='support_conversations' and column_name in ('reference','priority')))
     order by column_name`;
  console.log(`${label} new columns: ${cols.map(c=>c.column_name).join(', ') || '(none)'}`);
  const tabs = await sql`select table_name from information_schema.tables
     where table_schema='public' and table_name in ('support_notes','support_conversation_bookings')`;
  console.log(`${label} new tables: ${tabs.map(t=>t.table_name).join(', ') || '(none)'}`);
  const bad = await sql`select count(*)::int n from support_conversations
     where reference is null or reference !~ '^CS-[0-9A-HJKMNP-TV-Z]{6}$'`;
  console.log(`${label} malformed/null references: ${bad[0].n}`);
  const refs = await sql`select reference, status from support_conversations order by created_at limit 5`;
  console.table(refs);
} catch (e) { console.log(`${label} FAILED: ${e.message}`); }
await sql.end();
