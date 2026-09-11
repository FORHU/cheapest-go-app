import fs from 'fs'; import postgres from 'postgres';
const fileEnv = fs.readFileSync('.env','utf8');
const url = fileEnv.match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,'');
const sql = postgres(url, { ssl:false, max:1, connect_timeout:8, onnotice: ()=>{} });
const [{n}] = await sql`select count(*)::int n from schema_migrations`;
console.log('local schema_migrations rows:', n);
if (n) console.table(await sql`select version from schema_migrations order by version limit 20`);
const want = ['users','bookings','flight_bookings','unified_bookings','email_logs',
              'support_conversations','support_messages','support_notes','support_conversation_bookings'];
const have = await sql`select table_name from information_schema.tables
   where table_schema='public' and table_name = ANY(${want})`;
const set = new Set(have.map(r=>r.table_name));
console.log('\ntable                          present');
for (const t of want) console.log(`  ${t.padEnd(30)} ${set.has(t) ? 'yes' : 'NO'}`);
const [{c}] = await sql`select count(*)::int c from information_schema.tables where table_schema='public'`;
console.log(`\ntotal public tables: ${c}`);
await sql.end();
