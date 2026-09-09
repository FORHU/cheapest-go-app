import fs from 'fs'; import postgres from 'postgres';
const env=fs.readFileSync('.env','utf8');
const url=env.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,'');
const sql=postgres(url,{ssl:{rejectUnauthorized:false},max:1,connect_timeout:30,onnotice:()=>{}});
// English name -> [candidate spellings], country
const CHECK = [
  ['IT', ['rome','rom','milan','mailand','florence','florenz','venice','venedig','naples','neapel','turin','genoa','genua']],
  ['JP', ['tokyo','tokio','osaka','kyoto']],
  ['CZ', ['prague','prag']],
  ['AT', ['vienna','wien','salzburg']],
  ['DE', ['munich','muenchen','münchen','cologne','koeln','köln','berlin']],
  ['CH', ['zurich','zuerich','zürich','geneva','genf']],
  ['GR', ['athens','athen','santorini']],
  ['PT', ['lisbon','lissabon','porto']],
  ['PL', ['warsaw','warschau','krakow','krakau']],
  ['HU', ['budapest']],
  ['BE', ['brussels','bruessel','brüssel','bruges','bruegge','brügge']],
  ['DK', ['copenhagen','kopenhagen']],
  ['RU', ['moscow','moskau']],
  ['EG', ['cairo','kairo']],
  ['MA', ['marrakech','marrakesch']],
];
for (const [cc, names] of CHECK) {
  const rows = await sql`select lower(city) as city, count(*)::int as n from hotel_content
     where upper(country)=${cc} and lower(city) = ANY(${names}) group by 1 order by n desc`;
  if (rows.length) console.log(cc.padEnd(3), rows.map(r=>`${r.city}=${r.n}`).join('  '));
}
await sql.end();
