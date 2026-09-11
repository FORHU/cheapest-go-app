import { getSqlAdmin } from '@/lib/db/postgres';
import { SupportValidationError } from './conversations';
import { deleteObject, putObject } from '@/lib/server/storage/s3';

/**
 * Files on a Support Chat.
 *
 * See ADR-0040. The short version: the bucket is private, an attachment is reached only
 * through a route that re-checks who is asking, and what a browser claims about a file is
 * never what decides how it is stored.
 */

export type AttachmentUploader = 'guest' | 'agent';

/**
 * Anything that can run a statement: the pool, or a transaction taken from it.
 *
 * Binding has to be able to join the caller's transaction, because a message and the files
 * on it must both land or neither must - a bound file whose message rolled back would be
 * evidence attached to nothing.
 */
type SqlExecutor = Pick<ReturnType<typeof getSqlAdmin>, 'unsafe'>;

export interface SupportAttachment {
    id: string;
    conversationId: string;
    messageId: string | null;
    storageKey: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    uploadedByType: AttachmentUploader;
    uploadedByAdminId: string | null;
    createdAt: string;
    /**
     * When the bytes were removed under the retention rule, or null while they are still
     * fetchable. The row outlives the object on purpose — see the retention migration.
     */
    bytesDeletedAt: string | null;
}

/**
 * An attachment as everybody outside this module is allowed to see it.
 *
 * No `storageKey`. The key is the only thing that names the object in the bucket, and a
 * message is serialised into an HTTP response, an SSE frame and the admin inbox - three
 * places a key has no business being. Downloads go through a route that looks the key up
 * from the id, having first decided the asker is entitled to it.
 */
export interface SupportAttachmentView {
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    uploadedByType: AttachmentUploader;
    /**
     * True once the bytes have expired under the retention rule, while the row remains.
     *
     * Must be kept in step with the identically-named type in `components/support/types.ts`,
     * which is declared separately so a client bundle never imports a module that opens
     * database connections. This pair is the price of that convention.
     */
    bytesDeleted: boolean;
}

/**
 * Biggest file accepted.
 *
 * A phone photograph of a booking confirmation is 2-5 MB and a scanned PDF a little more,
 * so this clears the real cases with room to spare. It is not generous on purpose: the
 * bytes cross the app process on their way to S3, and the ceiling is what stops one upload
 * deciding how much memory a request can cost.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * Most files on one message. Five covers "here is the whole email thread" without letting
 * a single send turn into an unbounded number of objects, rows and download routes.
 */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

/**
 * What may be uploaded, by what the bytes actually are.
 *
 * Deliberately short. Everything a support conversation genuinely needs is a picture or a
 * PDF, and every addition to this list is a new file type an Agent is being asked to open
 * on a work machine. Office documents and archives are absent for that reason, not by
 * oversight.
 */
export const ALLOWED_CONTENT_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'application/pdf',
] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

/** What a reader of the transcript gets. Deliberately not `storage_key`. */
const VIEW_COLUMNS = `
    id,
    message_id           AS "messageId",
    file_name            AS "fileName",
    content_type         AS "contentType",
    size_bytes::int      AS "sizeBytes",
    uploaded_by_type     AS "uploadedByType",
    -- Whether, not when. A transcript needs to know the file is gone; the date it went is a
    -- question for the row. Omitting this would make every expired attachment read as still
    -- present, and the reader would find that out only by clicking it.
    (bytes_deleted_at IS NOT NULL) AS "bytesDeleted"
`;

const COLUMNS = `
    id,
    conversation_id      AS "conversationId",
    message_id           AS "messageId",
    storage_key          AS "storageKey",
    file_name            AS "fileName",
    content_type         AS "contentType",
    size_bytes::int      AS "sizeBytes",
    uploaded_by_type     AS "uploadedByType",
    uploaded_by_admin_id AS "uploadedByAdminId",
    created_at           AS "createdAt",
    bytes_deleted_at     AS "bytesDeletedAt"
`;

/**
 * What these bytes are, read from the bytes.
 *
 * The browser sends a Content-Type with every part of a multipart body and it is worth
 * nothing: it is derived from the file extension on most platforms and is settable outright
 * by anything that is not a browser. Trusting it means an executable stored and later
 * served as `image/png`, which is the whole of how an upload endpoint becomes a way to host
 * someone else's payload.
 *
 * So the declared type is discarded and the file is identified by its signature. Returns
 * null for anything not on the allowlist, which the caller turns into a refusal.
 */
export function sniffContentType(bytes: Buffer): AllowedContentType | null {
    if (bytes.length < 12) return null;

    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';

    if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return 'image/png';
    }

    const ascii = (start: number, end: number) => bytes.subarray(start, end).toString('latin1');

    if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif';

    // RIFF containers hold more than images; the WEBP fourcc at byte 8 is what narrows it.
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';

    if (ascii(0, 5) === '%PDF-') return 'application/pdf';

    // HEIC is an ISO base media file; the brand after `ftyp` says which flavour. iPhones
    // produce these by default, so a customer photographing a document sends one without
    // having chosen to.
    if (ascii(4, 8) === 'ftyp') {
        const brand = ascii(8, 12);
        if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'].includes(brand)) {
            return 'image/heic';
        }
    }

    return null;
}

/**
 * A file name safe to store and to echo back.
 *
 * Only ever used for display and for the download's Content-Disposition - never to build a
 * storage key - but a name that arrived from a browser can still carry a path separator, a
 * NUL, or 400 characters of padding, and none of those improve any screen they reach.
 */
export function sanitiseFileName(raw: string): string {
    const base = raw.split(/[\\/]/).pop() ?? '';
    // Control characters filtered by code point rather than by a regex literal: the
    // class would have to contain the very bytes it is removing.
    const cleaned = Array.from(base)
        .filter(ch => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127)
        .join('')
        .trim();
    return (cleaned || 'attachment').slice(0, 200);
}

/**
 * The S3 key for an attachment.
 *
 * Built from two uuids and nothing else. The customer's file name is not in it, so there
 * is no encoding, traversal or collision question to get right, and a key cannot be
 * guessed from anything the customer knows. The `support/` prefix is what the instance
 * role's policy is scoped to.
 */
export function attachmentStorageKey(conversationId: string, attachmentId: string): string {
    return `support/${conversationId}/${attachmentId}`;
}

export interface StoreAttachmentInput {
    conversationId: string;
    fileName: string;
    bytes: Buffer;
    uploadedByType: AttachmentUploader;
    /** Required when an Agent is uploading; the table refuses an unattributed staff file. */
    uploadedByAdminId?: string | null;
}

/**
 * Accept one file: check it, put it in the bucket, record it.
 *
 * The row is written after the object exists, so a row never points at a missing file. The
 * reverse - an object with no row - is possible if the insert fails, and is cleaned up
 * here rather than left for the lifecycle rule, because an unreferenced file holding a
 * customer's passport page should not wait 30 days to go away.
 */
export async function storeAttachment(input: StoreAttachmentInput): Promise<SupportAttachment> {
    if (input.bytes.length === 0) {
        throw new SupportValidationError('That file is empty.');
    }
    if (input.bytes.length > MAX_ATTACHMENT_BYTES) {
        throw new SupportValidationError(
            `Files must be ${Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB or smaller.`,
        );
    }
    if (input.uploadedByType === 'agent' && !input.uploadedByAdminId) {
        throw new SupportValidationError('An agent upload must name the agent.');
    }

    const contentType = sniffContentType(input.bytes);
    if (!contentType) {
        throw new SupportValidationError('That file type is not supported. Send an image or a PDF.');
    }

    const sql = getSqlAdmin();
    const fileName = sanitiseFileName(input.fileName);

    // The id is minted here rather than by the column default, because the storage key is
    // built from it and the object has to exist before the row does.
    const [{ id }] = await sql<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`;
    const storageKey = attachmentStorageKey(input.conversationId, id);

    await putObject({ key: storageKey, body: input.bytes, contentType });

    try {
        const rows = await sql.unsafe<SupportAttachment[]>(
            `INSERT INTO support_message_attachments
                 (id, conversation_id, storage_key, file_name, content_type, size_bytes,
                  uploaded_by_type, uploaded_by_admin_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING ${COLUMNS}`,
            [
                id,
                input.conversationId,
                storageKey,
                fileName,
                contentType,
                input.bytes.length,
                input.uploadedByType,
                input.uploadedByAdminId ?? null,
            ],
        );
        return rows[0];
    } catch (err) {
        // Nothing references this object; leaving it would be an unreachable copy of a
        // customer's document. A failure to clean up must not mask the original error.
        await deleteObject(storageKey).catch(() => {});
        throw err;
    }
}

/**
 * The attachments on a set of messages, grouped by message.
 *
 * One query for a whole transcript rather than one per message: a conversation is read on
 * every widget open and every SSE backfill, and a per-message read would make that cost
 * grow with the length of the conversation.
 */
export async function attachmentsByMessage(
    messageIds: string[],
): Promise<Map<string, SupportAttachmentView[]>> {
    const grouped = new Map<string, SupportAttachmentView[]>();
    if (messageIds.length === 0) return grouped;

    const sql = getSqlAdmin();
    const rows = await sql.unsafe<(SupportAttachmentView & { messageId: string | null })[]>(
        `SELECT ${VIEW_COLUMNS} FROM support_message_attachments
          WHERE message_id = ANY($1::uuid[])
          ORDER BY created_at, id`,
        [messageIds],
    );

    for (const { messageId, ...view } of rows) {
        if (!messageId) continue;
        const existing = grouped.get(messageId);
        if (existing) existing.push(view);
        else grouped.set(messageId, [view]);
    }
    return grouped;
}

/** The same shape, for the upload route's answer to "what did you just take from me". */
export function toAttachmentView(row: SupportAttachment): SupportAttachmentView {
    return {
        id: row.id,
        fileName: row.fileName,
        contentType: row.contentType,
        sizeBytes: row.sizeBytes,
        uploadedByType: row.uploadedByType,
        // A boolean, not the date. Whoever is reading the transcript needs to know the file
        // is gone; exactly when it expired is a question for the row, not for a chat bubble.
        bytesDeleted: row.bytesDeletedAt !== null,
    };
}

/** Days after a conversation is Resolved that an attachment's bytes are removed. */
export const ATTACHMENT_RETENTION_DAYS = 90;

export interface PurgeResult {
    considered: number;
    deleted: number;
    failed: number;
}

/**
 * Remove the bytes of attachments whose conversations were resolved long enough ago.
 *
 * The row is kept and marked. Deleting it would make the transcript lie — an Agent thanking
 * someone for a passport, against a message carrying nothing — and leave no way to tell a
 * file that expired from one that was never sent.
 *
 * Ordered oldest-first and capped, so a first run against a bucket that has been filling for
 * months does a bounded amount of work per invocation rather than one enormous sweep. The
 * object is deleted before the row is marked: marking first would strand the object with
 * nothing left pointing at it, which is the one failure this cannot recover from on its own.
 */
export async function purgeExpiredAttachments(limit = 500): Promise<PurgeResult> {
    const sql = getSqlAdmin();

    // Only what the sweep needs: the object to delete and the row to mark. Spelled out
    // rather than reusing COLUMNS, which is unaliased and would have to be rewritten to
    // carry a table prefix — clever string surgery on a query is how the wrong column
    // quietly gets read.
    const due = await sql.unsafe<{ id: string; storageKey: string }[]>(
        `SELECT a.id, a.storage_key AS "storageKey"
           FROM support_message_attachments a
           JOIN support_conversations c ON c.id = a.conversation_id
          WHERE a.bytes_deleted_at IS NULL
            AND a.message_id IS NOT NULL
            AND c.status = 'resolved'
            -- last_message_at is when the conversation was last active, which for a resolved
            -- one is when it was resolved. A chat that reopens moves it forward, so the clock
            -- restarts — which is right: a customer still talking has not finished with the
            -- evidence.
            AND c.last_message_at < now() - ($1 || ' days')::interval
          ORDER BY a.created_at ASC
          LIMIT $2`,
        [String(ATTACHMENT_RETENTION_DAYS), limit],
    );

    let deleted = 0;
    let failed = 0;

    for (const attachment of due) {
        try {
            await deleteObject(attachment.storageKey);
            await sql`
                UPDATE support_message_attachments
                   SET bytes_deleted_at = now()
                 WHERE id = ${attachment.id}
            `;
            deleted++;
        } catch (err) {
            // Left unmarked so the next run tries again. A bucket that is briefly
            // unreachable must not cause a row to be recorded as purged when it is not.
            failed++;
            console.warn(
                `[support/attachments] purge failed for ${attachment.id}:`,
                err instanceof Error ? err.message.slice(0, 120) : err,
            );
        }
    }

    return { considered: due.length, deleted, failed };
}

/** One attachment by id, or null. The caller decides whether the asker may have it. */
export async function findAttachment(attachmentId: string): Promise<SupportAttachment | null> {
    const sql = getSqlAdmin();
    const rows = await sql.unsafe<SupportAttachment[]>(
        `SELECT ${COLUMNS} FROM support_message_attachments WHERE id = $1`,
        [attachmentId],
    );
    return rows[0] ?? null;
}

/**
 * Attach uploaded files to the message that is being sent.
 *
 * Scoped to unbound rows in the same conversation, which is what makes this safe to call
 * with ids from a request body: an id belonging to somebody else's chat, or to a file
 * already sent, matches nothing and is silently not bound rather than moved. The count
 * that comes back lets the caller tell "you sent files" from "you sent ids".
 */
export async function bindAttachmentsToMessage(
    conversationId: string,
    messageId: string,
    attachmentIds: string[],
    executor?: SqlExecutor,
): Promise<number> {
    if (attachmentIds.length === 0) return 0;

    const sql = executor ?? getSqlAdmin();
    const rows = await sql.unsafe<{ id: string }[]>(
        `UPDATE support_message_attachments
            SET message_id = $1
          WHERE conversation_id = $2
            AND message_id IS NULL
            AND id = ANY($3::uuid[])
        RETURNING id`,
        [messageId, conversationId, attachmentIds],
    );
    return rows.length;
}

/**
 * Take back a file that has not been sent.
 *
 * Only ever an unsent one. A file already on a message is part of the transcript, and the
 * transcript is the record a dispute is settled from - removing evidence from it is not
 * something a composer's little x should be able to do.
 *
 * Returns false when nothing matched, which is the same answer for "already sent", "never
 * existed" and "belongs to someone else". The caller turns all three into a 404.
 */
export async function deleteUnboundAttachment(
    conversationId: string,
    attachmentId: string,
): Promise<boolean> {
    const sql = getSqlAdmin();
    const rows = await sql.unsafe<{ storageKey: string }[]>(
        `DELETE FROM support_message_attachments
          WHERE id = $1 AND conversation_id = $2 AND message_id IS NULL
      RETURNING storage_key AS "storageKey"`,
        [attachmentId, conversationId],
    );

    const removed = rows[0];
    if (!removed) return false;

    // Row first, object second. The other order would leave a row pointing at nothing if
    // this half failed, and a broken link in a transcript is worse than a stray object the
    // lifecycle rule will collect.
    await deleteObject(removed.storageKey).catch(err => {
        console.error('[support/attachments] orphaned object', removed.storageKey, err);
    });
    return true;
}

/**
 * How many files are waiting on a conversation, unsent.
 *
 * The per-message ceiling is enforced at upload time as well as at send time, because a
 * client that uploads twenty files and then sends one message has already cost twenty
 * objects regardless of what the send does with them.
 */
export async function countUnboundAttachments(conversationId: string): Promise<number> {
    const sql = getSqlAdmin();
    const rows = await sql.unsafe<{ count: number }[]>(
        `SELECT count(*)::int AS count FROM support_message_attachments
          WHERE conversation_id = $1 AND message_id IS NULL`,
        [conversationId],
    );
    return rows[0]?.count ?? 0;
}
