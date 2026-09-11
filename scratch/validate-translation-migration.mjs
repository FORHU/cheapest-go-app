/** Apply the translation migration and test its constraints, inside a rolled-back tx. */
import fs from 'fs'; import postgres from 'postgres';
const fileEnv = fs.readFileSync('.env','utf8');
const url = process.env.RDS_DATABASE_URL?.trim() || fileEnv.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g,'');
const host = url.match(/@([^/:?]+)/)?.[1] ?? '?';
const isLocal = /^(localhost|127\.0\.0\.1)$/.test(host);
console.log(`target: ${host}${isLocal ? '  (local)' : '  ** LIVE **'}\n`);
const sql = postgres(url,{ssl:isLocal?false:{rejectUnauthorized:false},max:1,connect_timeout:30,onnotice:()=>{}});
const up = fs.readFileSync('db/migrations/20260911000001_support_message_translation.sql','utf8')
  .split(/^--\s*migrate:down\s*$/m)[0].replace(/^--\s*migrate:up\s*$/m,'').trim();
let pass=0, fail=0;
const check=(n,ok)=>{ ok?pass++:fail++; console.log(`  ${ok?'ok  ':'FAIL'}  ${n}`); };
const refused = async (tx, q) => { try { await tx`SAVEPOINT s`; await tx.unsafe(q); await tx`RELEASE SAVEPOINT s`; return false; } catch { await tx`ROLLBACK TO SAVEPOINT s`; return true; } };
try {
  await sql.begin(async tx => {
    await tx.unsafe(up); check('migration applies', true);
    const [c] = await tx`select id from support_conversations limit 1`;
    const [m] = await tx`insert into support_messages (conversation_id, sender_type, body)
                          values (${c.id}, 'guest', '도와주세요') returning id`;
    const id = m.id;
    check('a plain message needs no translation fields',
      (await tx`select translation_status from support_messages where id=${id}`)[0].translation_status === null);
    await tx`update support_messages set translation_status='pending' where id=${id}`;
    check('pending is allowed with no text', true);
    await tx`update support_messages set translated_body='Please help', translated_lang='en', translation_status='translated' where id=${id}`;
    check('translated with text and language is allowed', true);
    check('translated with NO text is refused',
      await refused(tx, `update support_messages set translated_body=null where id='${id}'`));
    check('translated with NO language is refused',
      await refused(tx, `update support_messages set translated_lang=null where id='${id}'`));
    check('text on an untranslated row is refused',
      await refused(tx, `update support_messages set translation_status='untranslated' where id='${id}'`));
    check('an unknown status is refused',
      await refused(tx, `update support_messages set translation_status='failed', translated_body=null, translated_lang=null where id='${id}'`));
    throw new Error('__rollback__');
  });
} catch(e){ if(e.message!=='__rollback__'){ fail++; console.error('THREW:', e.message); } }
console.log(`\nrolled back — unchanged\n${pass} passed, ${fail} failed`);
await sql.end(); process.exit(fail?1:0);
