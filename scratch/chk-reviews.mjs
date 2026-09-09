import fs from 'fs'; import postgres from 'postgres';
const env=fs.readFileSync('.env','utf8');
const url=env.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,'');
const sql=postgres(url,{ssl:{rejectUnauthorized:false},max:1,connect_timeout:30,onnotice:()=>{}});
console.table(await sql`
  select lower(city) as city, count(*)::int as rows,
         count(review_count)::int as with_reviews
    from hotel_content
   where lower(city) in ('rom','paris','tokio','tokyo','london','seoul','denpasar')
   group by 1 order by rows desc`);
await sql.end();
