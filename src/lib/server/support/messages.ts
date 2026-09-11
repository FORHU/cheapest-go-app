import { getSqlAdmin } from '@/lib/db/postgres';
import { publish } from './events';
import { SupportValidationError } from './conversations';
import {
    attachmentsByMessage,
    bindAttachmentsToMessage,
    MAX_ATTACHMENTS_PER_MESSAGE,
    type SupportAttachmentView,
} from './attachments';
import type { SupportNoticeCode } from './notices';
import { translationFor, translationConfigFromEnv } from './translation';

export type SupportSender = 'guest' | 'ai' | 'agent' | 'system';

export interface SupportMessage {
    id: string;
    conversationId: string;
    senderType: SupportSender;
    senderAdminId: string | null;
    body: string;
    /**
     * Set on `system` rows only. Which notice this is, so the widget and the admin inbox
     * each render it in their own reader's language; `body` is the English fallback.
     */
    noticeCode: SupportNoticeCode | null;
    /**
     * The machine rendering of `body`, stored when it was written and never recomputed
     * (ADR-0033). English for a customer's words, the customer's locale for an Agent's.
     *
     * Null is ordinary, not an error: an English conversation needs no rendering, and
     * neither does a message sent while the translator was unreachable. Every reader shows
     * the original in that case, marked untranslated.
     */
    translatedBody: string | null;
    createdAt: string;
    /**
     * Files sent with this message. Empty for almost every row, so it is hydrated in one
     * query per read rather than joined into the message select - a join would multiply the
     * message row by its attachments and make every reader deduplicate.
     */
    attachments: SupportAttachmentView[];
}

/**
 * Longest message accepted. Support questions are prose, not documents, and the ceiling
 * is what stops one paste filling a row, a stream frame and an AI context window at once.
 */
export const MAX_MESSAGE_LENGTH = 4000;

/** Most messages returned in one read, so a long history cannot become an unbounded response. */
export const MESSAGE_PAGE_SIZE = 200;

const COLUMNS = `
    id,
    conversation_id  AS "conversationId",
    sender_type      AS "senderType",
    sender_admin_id  AS "senderAdminId",
    body,
    notice_code      AS "noticeCode",
    translated_body  AS "translatedBody",
    created_at       AS "createdAt"
`;

export interface AppendMessageInput {
    conversationId: string;
    senderType: SupportSender;
    body: string;
    /** Required when senderType is 'agent'; the table refuses an unattributed agent reply. */
    senderAdminId?: string | null;
    /** System rows only — the table refuses a code on anyone else's words. */
    noticeCode?: SupportNoticeCode | null;
    /**
     * Files already uploaded to this conversation, to be sent with this message.
     *
     * Ids, not bytes: the upload happened while the customer was still typing, over its own
     * route. An id that is not an unsent file of this conversation binds nothing, which is
     * what makes it safe to take these straight from a request body.
     */
    attachmentIds?: string[];
}

/**
 * Write a message and tell every process about it.
 *
 * The insert and the bump of `last_message_at` share one statement so the inbox ordering
 * cannot drift from the messages it orders by. The notify happens after the write has
 * committed — a listener woken earlier would read the row and not find it.
 */
export async function appendMessage(input: AppendMessageInput): Promise<SupportMessage> {
    const body = input.body.trim();
    const attachmentIds = input.attachmentIds ?? [];

    // A message with files and no words is a real message - "here is the confirmation you
    // asked for" is often the whole of it - so emptiness is only emptiness when nothing at
    // all was sent.
    if (!body && attachmentIds.length === 0) {
        throw new SupportValidationError('Message cannot be empty.');
    }
    if (body.length > MAX_MESSAGE_LENGTH) {
        throw new SupportValidationError(`Message cannot be longer than ${MAX_MESSAGE_LENGTH} characters.`);
    }
    if (attachmentIds.length > MAX_ATTACHMENTS_PER_MESSAGE) {
        throw new SupportValidationError(
            `A message can carry at most ${MAX_ATTACHMENTS_PER_MESSAGE} files.`,
        );
    }
    if (input.senderType === 'agent' && !input.senderAdminId) {
        throw new SupportValidationError('An agent message must name the agent.');
    }

    const sql = getSqlAdmin();

    /**
     * The rendering to store beside this message, worked out before the row is written.
     *
     * Inline rather than after the insert, so the transcript never shows a message that is
     * untranslated and then quietly is not. The cost is that a send waits on a third party,
     * which is why `translationFor` has a short timeout and answers null for every failure:
     * past it the message is delivered in its author's own words, marked untranslated, and
     * nothing else about the conversation moves.
     */
    const [conversation] = await sql<{ locale: string }[]>`
        SELECT locale FROM support_conversations WHERE id = ${input.conversationId}::uuid
    `;
    const translatedBody = conversation
        ? await translationFor(input.senderType, conversation.locale, body, translationConfigFromEnv())
        : null;

    // One transaction, because the binding below can still refuse the whole send: a
    // wordless message whose file ids turn out to bind nothing is a blank row in the
    // transcript, and rolling back is the only way to not leave one.
    const message = await sql.begin(async tx => {
        const rows = await tx.unsafe<SupportMessage[]>(
            `WITH inserted AS (
                 INSERT INTO support_messages
                     (conversation_id, sender_type, sender_admin_id, body, notice_code, translated_body)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING ${COLUMNS}
             ), touched AS (
                 UPDATE support_conversations
                    SET last_message_at = now()
                  WHERE id = $1
             )
             SELECT * FROM inserted`,
            [
                input.conversationId,
                input.senderType,
                input.senderAdminId ?? null,
                body,
                input.noticeCode ?? null,
                translatedBody,
            ],
        );

        const inserted = rows[0];
        const bound = await bindAttachmentsToMessage(
            input.conversationId,
            inserted.id,
            attachmentIds,
            tx,
        );

        if (!body && bound === 0) {
            throw new SupportValidationError('Those files are no longer available to send.');
        }

        return inserted;
    });

    // Hydrated from the same ids that were just bound rather than re-read: the transaction
    // has committed, so this is the one shape every reader of this message will see.
    message.attachments = await attachmentsByMessage([message.id]).then(m => m.get(message.id) ?? []);

    await publish({ conversationId: message.conversationId, messageId: message.id });
    return message;
}

/**
 * Put each message's files on it.
 *
 * Separate from the message select on purpose - see the note on `SupportMessage.attachments`
 * - and one query for the whole page rather than one per row.
 */
async function withAttachments(rows: SupportMessage[]): Promise<SupportMessage[]> {
    if (rows.length === 0) return rows;

    const grouped = await attachmentsByMessage(rows.map(row => row.id));
    for (const row of rows) row.attachments = grouped.get(row.id) ?? [];
    return rows;
}

/** One message by id — what a stream listener reads after being woken by a notify. */
export async function getMessage(messageId: string): Promise<SupportMessage | null> {
    const sql = getSqlAdmin();
    const rows = await sql.unsafe<SupportMessage[]>(
        `SELECT ${COLUMNS} FROM support_messages WHERE id = $1`,
        [messageId],
    );
    if (!rows[0]) return null;
    return (await withAttachments(rows))[0];
}

/**
 * A conversation's messages in order, optionally only those after `sinceMessageId`.
 *
 * Ordering is on (created_at, id) rather than created_at alone: two messages written in
 * the same millisecond would otherwise come back in an arbitrary order, and a cursor over
 * an unstable order skips rows. The same pair is the cursor comparison.
 */
export async function listMessages(
    conversationId: string,
    sinceMessageId?: string | null,
): Promise<SupportMessage[]> {
    const sql = getSqlAdmin();
    const rows = await sql.unsafe<SupportMessage[]>(
        `SELECT ${COLUMNS} FROM support_messages
          WHERE conversation_id = $1
            AND ($2::uuid IS NULL
                 OR (created_at, id) > (
                     SELECT created_at, id FROM support_messages WHERE id = $2::uuid
                 ))
          ORDER BY created_at, id
          LIMIT $3`,
        [conversationId, sinceMessageId ?? null, MESSAGE_PAGE_SIZE],
    );
    return withAttachments(rows);
}
