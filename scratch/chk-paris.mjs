import fs from 'fs';
import postgres from 'postgres';
const env = fs.readFileSync('.env','utf8');
const url = env.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,'');
const sql = postgres(url,{ssl:{rejectUnauthorized:false},max:1,connect_timeout:25,onnotice:()=>{}});
console.log('── cache rows for paris / london / tokyo ──');
console.table(await sql`
  select city_key, destination_code, parent_code, created_at
    from tgx_destination_cache
   where city_key in ('paris','paris:fr','london','london:gb','tokyo','tokyo:jp','rome','rome:it','bali','bali:id')
   order by city_key`);
console.log('── any scoped (city:cc) rows at all? ──');
console.table(await sql`
  select count(*)::int as scoped_rows from tgx_destination_cache where city_key like '%:__'`);
await sql.end();
