import fs from 'fs'; import postgres from 'postgres';
const fileEnv = fs.readFileSync('.env','utf8');
const pick = k => (fileEnv.match(new RegExp('^'+k+'=(.*)$','m'))||[])[1]?.trim().replace(/^"|"$/g,'');
for (const [label, url] of [['LIVE', pick('RDS_DATABASE_URL')], ['LOCAL', pick('DATABASE_URL')]]) {
  const host = url.match(/@([^/:?]+)/)?.[1] ?? '?';
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(host);
  const sql = postgres(url,{ssl:isLocal?false:{rejectUnauthorized:false},max:1,connect_timeout:20,onnotice:()=>{}});
  try {
    const [{n}] = await sql`select count(*)::int n from schema_migrations`;
    const has = await sql`select version from schema_migrations where version like '20260910%' order by version`;
    const tbl = await sql`select table_name from information_schema.tables
       where table_schema='public' and table_name='support_message_attachments'`;
    const col = await sql`select column_name from information_schema.columns
       where table_schema='public' and table_name='support_message_attachments' and column_name='bytes_deleted_at'`;
    console.log(`${label}: ${n} rows | attachments table: ${tbl.length?'yes':'NO'} | bytes_deleted_at: ${col.length?'yes':'NO'}`);
    console.log(`  20260910 recorded: ${has.length ? has.map(r=>r.version).join(', ') : 'none'}`);
  } catch(e){ console.log(`${label}: FAILED ${e.message.slice(0,60)}`); }
  await sql.end();
}
