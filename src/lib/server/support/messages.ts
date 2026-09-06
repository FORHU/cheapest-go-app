import { getSqlAdmin } from '@/lib/db/postgres';
import { publish } from './events';
import { SupportValidationError } from './conversations';
import type { SupportNoticeCode } from './responder';

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
    createdAt: string;
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
    if (!body) throw new SupportValidationError('Message cannot be empty.');
    if (body.length > MAX_MESSAGE_LENGTH) {
        throw new SupportValidationError(`Message cannot be longer than ${MAX_MESSAGE_LENGTH} characters.`);
    }
    if (input.senderType === 'agent' && !input.senderAdminId) {
        throw new SupportValidationError('An agent message must name the agent.');
    }

    const sql = getSqlAdmin();
    const rows = await sql.unsafe<SupportMessage[]>(
        `WITH inserted AS (
             INSERT INTO support_messages (conversation_id, sender_type, sender_admin_id, body, notice_code)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING ${COLUMNS}
         ), touched AS (
             UPDATE support_conversations
                SET last_message_at = now()
              WHERE id = $1
         )
         SELECT * FROM inserted`,
        [input.conversationId, input.senderType, input.senderAdminId ?? null, body, input.noticeCode ?? null],
    );

    const message = rows[0];
    await publish({ conversationId: message.conversationId, messageId: message.id });
    return message;
}

/** One message by id — what a stream listener reads after being woken by a notify. */
export async function getMessage(messageId: string): Promise<SupportMessage | null> {
    const sql = getSqlAdmin();
    const rows = await sql.unsafe<SupportMessage[]>(
        `SELECT ${COLUMNS} FROM support_messages WHERE id = $1`,
        [messageId],
    );
    return rows[0] ?? null;
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
    return rows;
}
