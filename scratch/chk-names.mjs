import fs from 'fs'; import postgres from 'postgres';
const env=fs.readFileSync('.env','utf8');
const url=env.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,'');
const sql=postgres(url,{ssl:{rejectUnauthorized:false},max:1,connect_timeout:30,onnotice:()=>{}});
const show = async (label, q) => { console.log(`── ${label} ──`); console.table(await q); };

await show('Thailand top cities', sql`select lower(city) as city, count(*)::int as n
   from hotel_content where upper(country)='TH' group by 1 order by n desc limit 8`);
await show('Hong Kong (any country code)', sql`select lower(city) as city, upper(country) as cc, count(*)::int as n
   from hotel_content where lower(city) like '%hong%kong%' or lower(city)='hongkong'
   group by 1,2 order by n desc limit 6`);
await show('Japan top cities', sql`select lower(city) as city, count(*)::int as n
   from hotel_content where upper(country)='JP' group by 1 order by n desc limit 8`);
await show('Italy — Rome spellings', sql`select lower(city) as city, count(*)::int as n
   from hotel_content where upper(country)='IT' and (lower(city) like 'rom%') group by 1 order by n desc limit 6`);
await sql.end();
