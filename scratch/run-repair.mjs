// Runs scratch/repair-rows.sql against LIVE RDS inside one transaction.
//   node scratch/run-repair.mjs            → dry run, always ROLLBACK
//   node scratch/run-repair.mjs --commit   → COMMIT
import fs from 'node:fs';
import postgres from 'postgres';

const COMMIT = process.argv.includes('--commit');

const env = fs.readFileSync('.env', 'utf8');
const url = env
  .split(/\r?\n/)
  .find((l) => l.startsWith('RDS_DATABASE_URL='))
  ?.slice('RDS_DATABASE_URL='.length)
  .trim()
  .replace(/^["']|["']$/g, '');
if (!url) throw new Error('RDS_DATABASE_URL not found in .env');

const host = new URL(url).host;
if (!/rds\.amazonaws\.com/.test(host)) {
  throw new Error(`Refusing to run: expected RDS, got ${host}`);
}

const fileSql = fs.readFileSync('scratch/repair-rows.sql', 'utf8');

console.log(`target : ${host}`);
console.log(`mode   : ${COMMIT ? 'COMMIT — changes will be saved' : 'DRY RUN — will roll back'}\n`);

const sql = postgres(url, { max: 1, connect_timeout: 15, idle_timeout: 5, onnotice: () => {} });

class Rollback extends Error {}

try {
  await sql.begin(async (tx) => {
    const results = await tx.unsafe(fileSql).simple();
    const sets = Array.isArray(results?.[0]) ? results : [results];

    let stmt = 0;
    for (const r of sets) {
      stmt++;
      if (r && r.length) {
        console.log(`--- statement ${stmt}: ${r.length} row(s) ---`);
        console.table(
          r.map((row) => ({
            booking: row.booking_id,
            property: row.property_name,
            status: row.status,
            price: `${row.total_price} ${row.currency}`,
            meta: row.meta_type,
            supplierRef: row.supplier_ref,
          }))
        );
      } else {
        console.log(`--- statement ${stmt}: ${r?.count ?? 0} row(s) affected ---`);
      }
    }

    if (!COMMIT) throw new Rollback();
  });
  console.log('\nCOMMITTED.');
} catch (e) {
  if (e instanceof Rollback) {
    console.log('\nROLLED BACK — nothing was written. Re-run with --commit when ready.');
  } else {
    console.error('\nFAILED, transaction rolled back:', e.message);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
