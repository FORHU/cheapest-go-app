import fs from 'fs'; import postgres from 'postgres';
const url = fs.readFileSync('.env','utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,'');
const sql = postgres(url,{ssl:false,max:1,connect_timeout:8,onnotice:()=>{}});
const rows = await sql`select version from schema_migrations order by version desc limit 6`;
console.log('newest local versions:', rows.map(r=>r.version).join(', '));
const SUPPORT = ['20260905000001','20260906000001','20260906000002','20260906000003',
  '20260906000004','20260906000005','20260907000001','20260907000002','20260907000003','20260909000001'];
const hit = await sql`select version from schema_migrations where version = ANY(${SUPPORT})`;
console.log('support-era versions already recorded locally:', hit.length ? hit.map(r=>r.version).join(', ') : 'none');
console.log('\nformat check:');
const fmt = await sql`select
   count(*) filter (where version ~ '^[0-9]+$')::int as bare,
   count(*) filter (where version ~ '_')::int as with_name
  from schema_migrations`;
console.table(fmt);
await sql.end();
