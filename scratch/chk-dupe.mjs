import fs from 'fs'; import postgres from 'postgres';
const env=fs.readFileSync('.env','utf8');
const url=env.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,'');
const sql=postgres(url,{ssl:{rejectUnauthorized:false},max:1,connect_timeout:25,onnotice:()=>{}});
console.table(await sql`select version, applied_at from schema_migrations
  where version like '20260909%' order by applied_at`);
const [{n}] = await sql`select count(*)::int n from schema_migrations`;
console.log('total rows:', n);
await sql.end();
