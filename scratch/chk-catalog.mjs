import fs from 'fs'; import postgres from 'postgres';
const env=fs.readFileSync('.env','utf8');
const url=env.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,'');
const sql=postgres(url,{ssl:{rejectUnauthorized:false},max:1,connect_timeout:30,onnotice:()=>{}});
console.log('── hotel_content counts by city ──');
console.table(await sql`
  select lower(city) as city, upper(country) as cc, count(*)::int as hotels
    from hotel_content
   where (lower(city)='paris' and upper(country)='FR')
      or (lower(city)='rome'  and upper(country)='IT')
      or (lower(city)='tokyo' and upper(country)='JP')
      or (lower(city)='denpasar' and upper(country)='ID')
   group by 1,2 order by hotels desc`);
console.log('── hotel_id shape (first 3 per city) ──');
for (const [c,cc] of [['paris','FR'],['rome','IT'],['tokyo','JP']]) {
  const r = await sql`select hotel_id from hotel_content
     where lower(city)=${c} and upper(country)=${cc} limit 3`;
  console.log(`  ${c}: ${r.map(x=>x.hotel_id).join(', ')}`);
}
await sql.end();
