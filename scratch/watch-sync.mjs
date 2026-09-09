import fs from 'fs'; import postgres from 'postgres';
const env=fs.readFileSync('.env','utf8');
const url=env.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,'');
const sql=postgres(url,{ssl:{rejectUnauthorized:false},max:1,connect_timeout:25,onnotice:()=>{}});
const r=await sql`select
   count(*)::int as total,
   count(*) filter (where city_key like '%:__')::int as scoped
 from tgx_destination_cache`;
console.log(`total=${r[0].total}  scoped=${r[0].scoped}`);
const k=await sql`select city_key, destination_code from tgx_destination_cache
   where city_key in ('paris:fr','rome:it','bali:id','seoul:kr','tokyo:jp') order by city_key`;
console.table(k);
await sql.end();
