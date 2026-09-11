import fs from 'fs';
import postgres from 'postgres';
const env = fs.readFileSync('.env','utf8');
const url = env.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,'');
const sql = postgres(url,{ssl:{rejectUnauthorized:false},max:1,connect_timeout:25,onnotice:()=>{}});

const q = async (label, fn) => { try { console.log(`\n── ${label} ──`); console.table(await fn()); } catch(e){ console.log(`  FAILED: ${e.message}`); } };

await q('schema_migrations count', () => sql`select count(*)::int as rows from schema_migrations`);

await q('new column / table present', () => sql`
  select 'support_conversations.waiting_notified_at' as thing,
         count(*)::int as present from information_schema.columns
   where table_schema='public' and table_name='support_conversations' and column_name='waiting_notified_at'
  union all
  select 'table supplier_booking_attempts', count(*)::int from information_schema.tables
   where table_schema='public' and table_name='supplier_booking_attempts'`);

await q('status default on support_conversations', () => sql`
  select column_default from information_schema.columns
   where table_schema='public' and table_name='support_conversations' and column_name='status'`);

await q('support_conversations by status', () => sql`
  select status, count(*)::int as n from support_conversations group by status order by n desc`);

await q("assistant_retired notices posted", () => sql`
  select count(*)::int as n from support_messages where notice_code='assistant_retired'`);

for (const t of ['bookings','flight_bookings','unified_bookings']) {
  await q(`${t}.source_brand`, () => sql`
    select coalesce(source_brand,'(null)') as source_brand, count(*)::int as n
      from ${sql(t)} group by source_brand order by n desc`);
}
await sql.end();
