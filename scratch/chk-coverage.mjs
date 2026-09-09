import fs from 'fs'; import postgres from 'postgres';
const env=fs.readFileSync('.env','utf8');
const url=env.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,'');
const sql=postgres(url,{ssl:{rejectUnauthorized:false},max:1,connect_timeout:30,onnotice:()=>{}});

const TARGETS = [
  ['paris','FR'],['rome','IT'],['london','GB'],['tokyo','JP'],['seoul','KR'],
  ['barcelona','ES'],['amsterdam','NL'],['bangkok','TH'],['phuket','TH'],
  ['singapore','SG'],['dubai','AE'],['istanbul','TR'],['new york','US'],
  ['los angeles','US'],['sydney','AU'],['hong kong','HK'],['kuala lumpur','MY'],
  ['manila','PH'],['nairobi','KE'],['denpasar','ID'],
];

const out = [];
for (const [city, cc] of TARGETS) {
  const [{ n }] = await sql`select count(*)::int as n from hotel_content
     where lower(city)=${city} and upper(country)=${cc}`;
  const top = await sql`select lower(city) as city, count(*)::int as n from hotel_content
     where upper(country)=${cc} group by 1 order by n desc limit 1`;
  out.push({
    search: `${city} (${cc})`,
    hotels: n,
    biggest_in_country: top[0] ? `${top[0].city} (${top[0].n})` : '—',
    suspect: top[0] && top[0].city !== city && n < top[0].n / 10 ? 'YES' : '',
  });
}
console.table(out);
await sql.end();
