import fs from 'fs'; import postgres from 'postgres';
const env=fs.readFileSync('.env','utf8');
const url=env.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,'');
const sql=postgres(url,{ssl:{rejectUnauthorized:false},max:1,connect_timeout:30,onnotice:()=>{}});
// Hotel codes TGX returned as AVAILABLE for Rome dest 3023
const CODES = ['7501293','7399543'];
console.log('── are TGX-available Rome hotels in hotel_content? ──');
console.table(await sql`
  select hotel_id, lower(city) as city, upper(country) as cc, content_source, review_count
    from hotel_content where hotel_id = ANY(${CODES})`);
console.log('── what the search SELECTS for Rome (top 5 of the 300) ──');
console.table(await sql`
  select hotel_id, lower(city) as city, review_count, content_source
    from hotel_content
   where city ILIKE '%Rom%' AND LOWER(country)='it'
     AND (hotel_id ~ '^[0-9]+$' OR hotel_id ~ '^[A-Z]{2}[0-9]+$')
     AND (content_source IS NULL OR content_source != 'etg')
   order by review_count desc nulls last limit 5`);
console.log('── how many Rome rows are eligible at all ──');
console.table(await sql`
  select count(*)::int as eligible,
         count(*) filter (where content_source='etg')::int as etg_excluded
    from hotel_content where city ILIKE '%Rom%' AND LOWER(country)='it'`);
await sql.end();
