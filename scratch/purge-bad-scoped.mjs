/**
 * Remove the scoped rows written by the 2026-09-09 diagnostic calls.
 *
 * `?resolveCity=Paris&cc=FR` against production ran the fixed resolver, which rejected the
 * Texas row and fell through to destinationSearcher — and cached what came back. What came
 * back was a ZONE for Alpine-Casparis Municipal Airport (0 availability), not Paris. Those
 * three rows are wrong answers under the right keys, which is worse than no row: the
 * resolver would read them first and never look further.
 *
 * sync-dest-cache will write the correct scoped rows. This clears the way for it.
 */
import fs from 'fs'; import postgres from 'postgres';
const env = fs.readFileSync('.env','utf8');
const url = env.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,'');
const sql = postgres(url,{ssl:{rejectUnauthorized:false},max:1,connect_timeout:25,onnotice:()=>{}});

const BAD = [['paris:fr','966233046'],['rome:it','966253996'],['bali:id','602651']];

console.log('── before ──');
console.table(await sql`select city_key, destination_code from tgx_destination_cache
                         where city_key in ${sql(BAD.map(b=>b[0]))} order by city_key`);

for (const [key, code] of BAD) {
    // Keyed on the code too, so a correct row written in the meantime is never deleted.
    const r = await sql`delete from tgx_destination_cache
                         where city_key = ${key} and destination_code = ${code}`;
    console.log(`  deleted ${r.count} row(s) for ${key} (${code})`);
}

console.log('── after: any scoped rows left? ──');
console.table(await sql`select city_key, destination_code from tgx_destination_cache
                         where city_key like '%:__' order by city_key limit 20`);
console.log('── bare rows are untouched ──');
console.table(await sql`select city_key, destination_code, parent_code from tgx_destination_cache
                         where city_key in ('paris','rome','bali') order by city_key`);
await sql.end();
