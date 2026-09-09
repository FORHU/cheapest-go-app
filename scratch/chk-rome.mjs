import fs from 'fs'; import postgres from 'postgres';
const env=fs.readFileSync('.env','utf8');
const url=env.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,'');
const sql=postgres(url,{ssl:{rejectUnauthorized:false},max:1,connect_timeout:30,onnotice:()=>{}});
console.log('── Italian cities in hotel_content, biggest first ──');
console.table(await sql`
  select lower(city) as city, count(*)::int as hotels
    from hotel_content where upper(country)='IT'
   group by 1 order by hotels desc limit 10`);
console.log('── anything that looks like Rome ──');
console.table(await sql`
  select lower(city) as city, upper(country) as cc, count(*)::int as hotels
    from hotel_content
   where lower(city) in ('roma','rome','rom') or lower(city) like 'rome %' or lower(city) like 'roma %'
   group by 1,2 order by hotels desc limit 10`);
await sql.end();
