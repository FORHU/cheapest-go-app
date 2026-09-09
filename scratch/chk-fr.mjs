import fs from 'fs'; import postgres from 'postgres';
const env=fs.readFileSync('.env','utf8');
const url=env.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,'');
const sql=postgres(url,{ssl:{rejectUnauthorized:false},max:1,connect_timeout:25,onnotice:()=>{}});
console.log('── French cities that DID survive the sync ──');
console.table(await sql`
  select city_key, destination_code, dest_type, parent_code from tgx_destination_cache
   where parent_code like '%#FR' order by city_key limit 12`);
console.log('── how many rows per parent country (top 8) ──');
console.table(await sql`
  select substring(parent_code from '#([A-Z]{2})$') as cc, count(*)::int as n
    from tgx_destination_cache where parent_code ~ '#[A-Z]{2}$'
   group by 1 order by n desc limit 8`);
console.log('── Indonesian cities (Bali should be here) ──');
console.table(await sql`
  select city_key, destination_code, dest_type from tgx_destination_cache
   where parent_code like '%#ID' order by city_key limit 10`);
await sql.end();
