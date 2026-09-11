import fs from 'fs'; import postgres from 'postgres';
const url = fs.readFileSync('.env','utf8').match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,'');
const sql = postgres(url,{ssl:{rejectUnauthorized:false},max:1,connect_timeout:25,onnotice:()=>{}});
const c = await sql`select column_name from information_schema.columns
  where table_schema='public' and table_name='support_messages' order by ordinal_position`;
console.log('  '+c.map(r=>r.column_name).join(', '));
await sql.end();
