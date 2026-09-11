/**
 * Apply both attachment migrations and run every query that touches the new column, inside
 * ONE transaction that is always rolled back.
 *
 * The retention column is read by three different statements — the sweep, the transcript
 * view, and the single-row fetch — and a column name that is right in the type and wrong in
 * the SQL fails only at runtime, on a page an Agent is looking at.
 *
 *   node scratch/validate-attachment-retention.mjs
 *   RDS_DATABASE_URL="postgresql://...localhost:5433/..." node scratch/validate-attachment-retention.mjs
 */
import fs from 'fs';
import postgres from 'postgres';

const fileEnv = fs.readFileSync('.env', 'utf8');
const url = process.env.RDS_DATABASE_URL?.trim()
    || fileEnv.match(/^RDS_DATABASE_URL=(.*)$/m)[1].trim().replace(/^"|"$/g, '');

const host = url.match(/@([^/:?]+)/)?.[1] ?? 'unknown';
const isLocal = /^(localhost|127\.0\.0\.1)$/.test(host);
console.log(`target: ${host}${isLocal ? '  (local)' : '  ** LIVE **'}\n`);

const sql = postgres(url, {
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 1,
    connect_timeout: 30,
    onnotice: () => {},
});

const up = file => fs.readFileSync('db/migrations/' + file, 'utf8')
    .split(/^--\s*migrate:down\s*$/m)[0]
    .replace(/^--\s*migrate:up\s*$/m, '')
    .trim();

let ok = true;
const check = (label, pass, detail = '') => {
    console.log(`${label.padEnd(28, '.')} ${pass ? 'OK' : 'FAIL'}${detail ? '  ' + detail : ''}`);
    if (!pass) ok = false;
};

try {
    await sql.begin(async tx => {
        await tx.unsafe(up('20260910000001_support_message_attachments.sql'));
        check('attachments table', true);

        await tx.unsafe(up('20260910000002_support_attachment_retention.sql'));
        check('retention migration', true);

        // 1. The sweep.
        const due = await tx.unsafe(
            `SELECT a.id, a.storage_key AS "storageKey"
               FROM support_message_attachments a
               JOIN support_conversations c ON c.id = a.conversation_id
              WHERE a.bytes_deleted_at IS NULL
                AND a.message_id IS NOT NULL
                AND c.status = 'resolved'
                AND c.last_message_at < now() - ($1 || ' days')::interval
              ORDER BY a.created_at ASC
              LIMIT $2`,
            ['90', 500],
        );
        check('sweep query', true, `${due.length} due now`);

        // 2. The transcript view — VIEW_COLUMNS, the one an omission would silently break.
        const view = await tx.unsafe(
            `SELECT id,
                    message_id       AS "messageId",
                    file_name        AS "fileName",
                    content_type     AS "contentType",
                    size_bytes::int  AS "sizeBytes",
                    uploaded_by_type AS "uploadedByType",
                    (bytes_deleted_at IS NOT NULL) AS "bytesDeleted"
               FROM support_message_attachments
              LIMIT 1`,
        );
        check('transcript view query', true, `${view.length} row(s)`);

        // 3. The single-row fetch the download route uses.
        const one = await tx.unsafe(
            `SELECT id, bytes_deleted_at AS "bytesDeletedAt", storage_key AS "storageKey"
               FROM support_message_attachments LIMIT 1`,
        );
        check('download row query', true, `${one.length} row(s)`);

        const idx = await tx.unsafe(
            `SELECT indexname FROM pg_indexes
              WHERE tablename = 'support_message_attachments'
                AND indexname LIKE '%retention%'`,
        );
        check('partial index', idx.length === 1, idx[0]?.indexname ?? 'missing');

        throw new Error('__rollback__');
    });
} catch (e) {
    if (e.message === '__rollback__') console.log('\nrolled back — unchanged');
    else { ok = false; console.error('\nFAILED:', e.message); }
}

await sql.end();
process.exit(ok ? 0 : 1);
