import fs from 'fs'; import postgres from 'postgres';
const fileEnv = fs.readFileSync('.env','utf8');
const url = process.env.RDS_DATABASE_URL?.trim()
  || fileEnv.match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,'');
const host = url.match(/@([^/:?]+)/)?.[1] ?? 'unknown';
const isLocal = /^(localhost|127\.0\.0\.1)$/.test(host);
console.log(`target: ${host}${isLocal ? '  (local)' : '  ** LIVE **'}`);
const sql = postgres(url, { ssl: isLocal ? false : {rejectUnauthorized:false}, max:1, connect_timeout: 6, onnotice: ()=>{} });
try {
  const [{ v }] = await sql`select version() as v`;
  console.log('connected:', v.split(',')[0]);
  const t = await sql`select table_name from information_schema.tables
     where table_schema='public' and table_name in ('schema_migrations','support_conversations','users')`;
  console.log('tables present:', t.map(r=>r.table_name).join(', ') || '(none — empty database)');
} catch (e) {
  console.log('CANNOT CONNECT:', e.message.slice(0,120));
}
await sql.end({ timeout: 3 }).catch(()=>{});
