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
    /**
     * An Agent's translated reply, translated back into English — what the customer read,
     * for an Agent who cannot read the translation. Null until made, and on every other row;
     * '' when it was attempted and could not be made.
     */
    backTranslatedBody: string | null;
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
    translation_status AS "translationStatus",
    back_translated_body AS "backTranslatedBody"
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

    // Whether this message will be translated, and into what — decided before the row is
    // written, so the very first copy any reader receives already says a translation is on
    // its way and whom it is for. The customer's widget holds an Agent's reply until its
    // translation has settled; a first copy with no status would show the English and then
    // swap it, which is what holding exists to avoid.
    const target = body ? await translationPlanFor(input.conversationId, input.senderType, body) : null;

    // One transaction, because the binding below can still refuse the whole send: a
    // wordless message whose file ids turn out to bind nothing is a blank row in the
    // transcript, and rolling back is the only way to not leave one.
    const message = await sql.begin(async tx => {
        const rows = await tx.unsafe<SupportMessage[]>(
            `WITH inserted AS (
                 INSERT INTO support_messages
                     (conversation_id, sender_type, sender_admin_id, body, notice_code,
                      translation_status, translated_lang)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
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
                target ? 'pending' : null,
                target,
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
    if (target) void translateInBackground(message.id);

    return message;
}

/**
 * The language a message will be translated into, or null when it will not be — no
 * translator configured, English between English speakers, or a system notice.
 */
async function translationPlanFor(
    conversationId: string,
    senderType: string,
    body: string,
): Promise<SupportLang | null> {
    const { planTranslation, translationConfigured } = await import('./translation');
    if (!translationConfigured() || !body.trim()) return null;

    // Only an Agent's reply needs to know the customer's language — read it off the
    // customer's own messages, and only then spend the query.
    const customerLang = senderType === 'agent' ? await customerLanguage(conversationId) : 'en';
    return planTranslation(senderType, body, customerLang);
}

/** Messages this process is translating right now, so a sweep never starts a second run. */
const translating = new Set<string>();

/**
 * Translate one delivered message and store the result beside its author's words.
 *
 * Runs after delivery and is never awaited by a send. **Every path ends in a settled status
 * — translated or untranslated — and a publish.** That is load-bearing, not tidiness: the
 * customer's widget holds an Agent's reply until its translation settles, so a row left
 * 'pending' is a reply the customer never sees. An unexpected error therefore settles it as
 * untranslated (the Agent's own words, marked) rather than leaving it. A process that dies
 * mid-translation cannot do even that; `resumeStalledTranslations` picks those up.
 *
 * Safe to run twice for the same message: a settled row is left alone, and the final write
 * only lands on a row still pending.
 */
export async function translateInBackground(messageId: string): Promise<void> {
    if (translating.has(messageId)) return;
    translating.add(messageId);

    const sql = getSqlAdmin();
    let conversationId: string | null = null;
    try {
        const rows = await sql<{
            conversationId: string;
            senderType: string;
            body: string;
            translationStatus: string | null;
            translatedLang: string | null;
        }[]>`
            SELECT conversation_id    AS "conversationId",
                   sender_type        AS "senderType",
                   body,
                   translation_status AS "translationStatus",
                   translated_lang    AS "translatedLang"
              FROM support_messages
             WHERE id = ${messageId}
        `;
        const row = rows[0];
        if (!row) return;
        conversationId = row.conversationId;

        // Already settled — by an earlier run, or by another process.
        if (row.translationStatus === 'translated' || row.translationStatus === 'untranslated') return;

        const { translate } = await import('./translation');

        // The plan was recorded when the message was written. A row from before that, or
        // one written with no translator configured, is planned now.
        const target = (row.translatedLang as SupportLang | null)
            ?? await translationPlanFor(row.conversationId, row.senderType, row.body);

        if (!target) {
            // Nothing to translate after all. A row somehow left pending must still settle,
            // or a held reply would never be shown.
            if (row.translationStatus === 'pending') await settleUntranslated(messageId, row.conversationId);
            return;
        }

        if (row.translationStatus !== 'pending') {
            await sql`
                UPDATE support_messages
                   SET translation_status = 'pending', translated_lang = ${target}
                 WHERE id = ${messageId} AND translation_status IS NULL
            `;
            await publish({ conversationId: row.conversationId, messageId });
        }

        const translated = await translate(row.body, target);

        // Only onto a row still pending: a second run that finished first has already said
        // what this one would.
        let landed = false;
        if (translated) {
            const updated = await sql`
                UPDATE support_messages
                   SET translated_body = ${translated},
                       translated_lang = ${target},
                       translation_status = 'translated'
                 WHERE id = ${messageId} AND translation_status = 'pending'
                RETURNING id
            `;
            landed = updated.length > 0;
        } else {
            // Refused, wrapped past recovery, timed out or unreachable. The original stands
            // and is marked — never a refusal stored as the customer's words.
            await sql`
                UPDATE support_messages
                   SET translation_status = 'untranslated'
                 WHERE id = ${messageId} AND translation_status = 'pending'
            `;
        }

        await publish({ conversationId: row.conversationId, messageId });

        // After the customer has their reply, never before: the back-translation is for the
        // Agent, and the customer's wait must not include it.
        if (landed && translated && row.senderType === 'agent' && target !== 'en') {
            await storeBackTranslation(messageId, row.conversationId, translated);
        }
    } catch (err) {
        // Nothing here may reach the sender. The message is already delivered.
        console.error('[support/translation] background translation failed:', err);
        if (conversationId) {
            await settleUntranslated(messageId, conversationId).catch(settleErr =>
                console.error('[support/translation] could not settle as untranslated:', settleErr));
        }
    } finally {
        translating.delete(messageId);
    }
}

/**
 * Translate an Agent's delivered reply back into English and store it beside the reply, so
 * the Agent can see what the customer read.
 *
 * Its own try: failing here must not touch the forward translation, which was delivered and
 * is correct as far as anyone can tell. A failure is stored as '' — "could not check" — so
 * the inbox stops saying it is checking.
 */
async function storeBackTranslation(messageId: string, conversationId: string, translated: string): Promise<void> {
    const sql = getSqlAdmin();
    try {
        const { translate } = await import('./translation');
        const back = await translate(translated, 'en');
        await sql`
            UPDATE support_messages
               SET back_translated_body = ${back ?? ''}
             WHERE id = ${messageId} AND translation_status = 'translated'
        `;
        await publish({ conversationId, messageId });
    } catch (err) {
        console.error('[support/translation] back-translation failed:', err);
        await sql`
            UPDATE support_messages SET back_translated_body = ''
             WHERE id = ${messageId} AND translation_status = 'translated' AND back_translated_body IS NULL
        `.catch(() => {});
    }
}

async function settleUntranslated(messageId: string, conversationId: string): Promise<void> {
    const sql = getSqlAdmin();
    await sql`
        UPDATE support_messages
           SET translation_status = 'untranslated', translated_body = NULL
         WHERE id = ${messageId} AND translation_status = 'pending'
    `;
    await publish({ conversationId, messageId });
}

/**
 * Longer than any translation takes. The worst case — a 4,000-character message whose pieces
 * each exhaust their attempts and are halved twice — is a little over two minutes, so a row
 * still pending past this was abandoned by a process that stopped, not one still working.
 */
export const STALLED_TRANSLATION_MS = 3 * 60 * 1000;

/**
 * Finish translations a stopped process left pending.
 *
 * A deploy restarts the app, and a translation in flight at that moment leaves its row
 * 'pending' with nothing coming to settle it. The customer's widget holds such a reply
 * indefinitely, so something must: this runs every minute from the cron sidecar.
 *
 * @returns how many were picked up.
 */
export async function resumeStalledTranslations(limit = 50): Promise<number> {
    const sql = getSqlAdmin();
    const rows = await sql<{ id: string }[]>`
        SELECT id FROM support_messages
         WHERE translation_status = 'pending'
           AND created_at < now() - (${STALLED_TRANSLATION_MS} * interval '1 millisecond')
         ORDER BY created_at
         LIMIT ${limit}
    `;
    await Promise.all(rows.map(row => translateInBackground(row.id)));
    return rows.length;
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
async function customerLanguage(conversationId: string): Promise<SupportLang> {
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
        const [conversation] = await sql<{ locale: string }[]>`
            SELECT locale FROM support_conversations WHERE id = ${conversationId}
        `;
        const locale = conversation?.locale;
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
