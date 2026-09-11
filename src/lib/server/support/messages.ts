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
import type { SupportLang } from './translation';
import { MAX_MESSAGE_LENGTH } from '@/lib/support/limits';

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
    /**
     * Files sent with this message. Empty for almost every row, so it is hydrated in one
     * query per read rather than joined into the message select - a join would multiply the
     * message row by its attachments and make every reader deduplicate.
     */
    attachments: SupportAttachmentView[];
    /**
     * One machine translation, stored beside the author's words and never in place of them
     * (ADR-0033). A customer's message carries an English rendering for the Agent; an
     * Agent's reply carries one in the customer's language. Null when nothing needed
     * translating, while it is still running, or when it failed.
     */
    translatedBody: string | null;
    /** The language translatedBody is in. */
    translatedLang: string | null;
    /**
     * null (nothing to translate), 'pending', 'translated', or 'untranslated'. The last is
     * not an error to retry: the message was delivered in its author's words, and this is
     * what tells the reader that is what they are looking at.
     */
    translationStatus: 'pending' | 'translated' | 'untranslated' | null;
}

// Longest message accepted — kept beside the chat boxes that enforce it too.
export { MAX_MESSAGE_LENGTH };

/** Most messages returned in one read, so a long history cannot become an unbounded response. */
export const MESSAGE_PAGE_SIZE = 200;

const COLUMNS = `
    id,
    conversation_id  AS "conversationId",
    sender_type      AS "senderType",
    sender_admin_id  AS "senderAdminId",
    body,
    notice_code      AS "noticeCode",
    created_at       AS "createdAt",
    translated_body    AS "translatedBody",
    translated_lang    AS "translatedLang",
    translation_status AS "translationStatus"
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

    // One transaction, because the binding below can still refuse the whole send: a
    // wordless message whose file ids turn out to bind nothing is a blank row in the
    // transcript, and rolling back is the only way to not leave one.
    const message = await sql.begin(async tx => {
        const rows = await tx.unsafe<SupportMessage[]>(
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

    // Translation runs after the message is delivered, never before it, and is not awaited.
    //
    // CONTEXT.md: a malfunction never changes a conversation's state. The translator is a
    // relay on another team's box that has been down, rate-limited and refusing within the
    // last week; if a send waited on it, every one of those would become a message that did
    // not arrive. Instead the author's words land now, and the translation follows through
    // the same publish — listeners re-read the row, so no second event type is needed.
    //
    // Safe to leave unawaited because this is a long-lived EC2 process, not a function that
    // is frozen when the response returns.
    void translateInBackground(message.id);

    return message;
}

/**
 * Translate one delivered message and store the result beside its author's words.
 *
 * Runs after delivery and is never awaited by a send. Every path ends in a stored status and
 * a publish, including failure: a translation that silently never arrives would leave the
 * reader looking at "translating…" forever, which is worse than "not translated".
 *
 * Exported for the tests and for a manual re-run; nothing in a request path awaits it.
 */
export async function translateInBackground(messageId: string): Promise<void> {
    try {
        const sql = getSqlAdmin();
        const rows = await sql<{
            conversationId: string;
            senderType: string;
            body: string;
            locale: string;
        }[]>`
            SELECT m.conversation_id AS "conversationId",
                   m.sender_type     AS "senderType",
                   m.body,
                   c.locale
              FROM support_messages m
              JOIN support_conversations c ON c.id = m.conversation_id
             WHERE m.id = ${messageId}
        `;
        const row = rows[0];
        if (!row) return;

        const { planTranslation, translate, translationConfigured } = await import('./translation');

        // Only an Agent's reply needs to know the customer's language, and only when it is
        // in English — read it off the customer's own messages before spending a query.
        const customerLang = row.senderType === 'agent'
            ? await customerLanguage(row.conversationId, row.locale)
            : 'en';
        const target = planTranslation(row.senderType, row.body, customerLang);

        // Nothing to do: English between English speakers, a system notice, or a message that
        // is only files. Status stays NULL, which every reader renders as "just the original".
        if (!target || !row.body.trim()) return;

        // No translator configured is not a failure to report on every message — it is a
        // deployment without the feature. Leave the row untouched.
        if (!translationConfigured()) return;

        // Marked pending first, so a reader who opens the chat mid-translation sees it is
        // coming rather than concluding there is none. The target language is recorded now,
        // not on success: it is what says which reader the translation is for, and so which
        // side shows "translating…" and, if it fails, "could not translate".
        await sql`
            UPDATE support_messages
               SET translation_status = 'pending',
                   translated_lang = ${target}
             WHERE id = ${messageId} AND translation_status IS NULL
        `;
        await publish({ conversationId: row.conversationId, messageId });

        const translated = await translate(row.body, target);

        if (translated) {
            await sql`
                UPDATE support_messages
                   SET translated_body = ${translated},
                       translated_lang = ${target},
                       translation_status = 'translated'
                 WHERE id = ${messageId}
            `;
        } else {
            // Refused, wrapped past recovery, timed out or unreachable. The original stands
            // and is marked — never a refusal stored as the customer's words.
            await sql`
                UPDATE support_messages
                   SET translation_status = 'untranslated'
                 WHERE id = ${messageId}
            `;
        }

        await publish({ conversationId: row.conversationId, messageId });
    } catch (err) {
        // Nothing here may reach the sender. The message is already delivered; a failure to
        // translate it is logged and otherwise changes nothing.
        console.error('[support/translation] background translation failed:', err);
    }
}

/**
 * The language the customer writes in, read from what they have actually written.
 *
 * The storefront locale is only a fallback, for a reply sent before the customer has said
 * anything. It is wrong often enough to matter — a Korean customer on cheapestgo.com reads
 * an English storefront and writes Korean.
 *
 * The latest message *not* in English wins, not simply the latest message: a Korean customer
 * who answers "OK" or pastes a booking reference has not switched to English, and replies
 * that suddenly stopped being translated would strand them. A customer who has only ever
 * written English is English, whatever storefront they came from.
 */
async function customerLanguage(conversationId: string, locale: string): Promise<SupportLang> {
    const sql = getSqlAdmin();
    const rows = await sql<{ body: string }[]>`
        SELECT body FROM support_messages
         WHERE conversation_id = ${conversationId}
           AND sender_type = 'guest'
           AND body <> ''
         ORDER BY created_at DESC, id DESC
         LIMIT 20
    `;
    const { detectLang } = await import('./translation');

    if (rows.length === 0) {
        return (['en', 'ko', 'ja', 'zh'] as const).find(l => l === locale) ?? 'en';
    }
    for (const { body } of rows) {
        const lang = detectLang(body);
        if (lang !== 'en') return lang;
    }
    return 'en';
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
