import { describe, it, expect, afterAll, afterEach, vi } from 'vitest';

/**
 * The rendering stored beside a message, after it is delivered.
 *
 * Integration rather than unit tests because the thing being checked is a row: that a message
 * is delivered in its author's words first, and that its translation then lands on that same
 * row with the language it is in and a status — or, when translating fails, that the row says
 * so rather than staying "translating…" forever. A fake store would report whatever it was
 * handed and keep passing while every real send stored nothing.
 *
 * ChatWonder itself is stubbed. It is a model behind an HTTP call: asked the same question
 * twice it answers differently, so a test that asserted on its real output would be
 * asserting on the weather. What is worth pinning down is what this repository does with
 * each shape of answer; the live behaviour is measured by the scripts in scratch/.
 *
 * Skips when no database is reachable, so a machine without Docker stays green.
 */

async function databaseReachable(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin()`SELECT 1`;
        return true;
    } catch {
        return false;
    }
}

async function sql() {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    return getSqlAdmin();
}

const createdConversations: string[] = [];

/**
 * A conversation from a given storefront locale, on the guest path.
 *
 * Name and email are not decoration: a conversation is born `waiting_human`, and the table
 * refuses a queued row that nobody can answer — an Agent picking it up has to have someone
 * to reply to.
 */
async function makeConversation(locale: string): Promise<string> {
    const db = await sql();
    const rows = await db<{ id: string }[]>`
        INSERT INTO support_conversations
            (guest_token_hash, guest_name, guest_email, source_brand, locale)
        VALUES (
            ${`translation-${crypto.randomUUID()}`},
            'Translation Test',
            ${`translation-${crypto.randomUUID()}@example.test`},
            'CheapestGo',
            ${locale}
        )
        RETURNING id
    `;
    createdConversations.push(rows[0].id);
    return rows[0].id;
}

/** ChatWonder, answering every translation with the same rendering. */
function boxAnswers(rendering: string) {
    const fetchMock = vi.fn(async (url: string) =>
        String(url).endsWith('/session-id')
            ? new Response(JSON.stringify({ session_id: 's-1' }))
            : new Response(JSON.stringify({ response: rendering })),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

interface TranslationRow {
    body: string;
    translated_body: string | null;
    translated_lang: string | null;
    translation_status: string | null;
}

async function readRow(id: string): Promise<TranslationRow> {
    const db = await sql();
    const [row] = await db<TranslationRow[]>`
        SELECT body, translated_body, translated_lang, translation_status
          FROM support_messages WHERE id = ${id}::uuid
    `;
    return row;
}

/** The row once the background translation has finished, one way or the other. */
async function settledRow(id: string): Promise<TranslationRow> {
    return vi.waitFor(async () => {
        const row = await readRow(id);
        if (row.translation_status !== 'translated' && row.translation_status !== 'untranslated') {
            throw new Error(`still ${row.translation_status}`);
        }
        return row;
    }, { timeout: 5_000, interval: 50 });
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

afterAll(async () => {
    if (!(await databaseReachable())) return;
    const db = await sql();
    for (const id of createdConversations) {
        await db`DELETE FROM support_messages WHERE conversation_id = ${id}::uuid`;
        await db`DELETE FROM support_conversations WHERE id = ${id}::uuid`;
    }
});

describe('appendMessage translation', () => {
    it('delivers the customer message first, then stores its English rendering on the same row', async (ctx) => {
        if (!(await databaseReachable())) return ctx.skip();
        vi.stubEnv('TRANSLATION_BASE_URL', 'https://translate.test');
        boxAnswers('When will the refund be processed?');

        const { appendMessage } = await import('./messages');
        const conversationId = await makeConversation('ko');

        const message = await appendMessage({ conversationId, senderType: 'guest', body: '환불 언제 되나요?' });

        // Delivered in the customer's own words, without waiting on the translator.
        expect(message.body).toBe('환불 언제 되나요?');
        expect(message.translatedBody).toBeNull();

        // Read back rather than trust an object: the column is the point.
        const row = await settledRow(message.id);
        expect(row).toMatchObject({
            body: '환불 언제 되나요?',
            translated_body: 'When will the refund be processed?',
            translated_lang: 'en',
            translation_status: 'translated',
        });
    });

    it('translates a Korean customer on the English storefront', async (ctx) => {
        // Keyed on the storefront locale, this message reached the Agent untranslated.
        if (!(await databaseReachable())) return ctx.skip();
        vi.stubEnv('TRANSLATION_BASE_URL', 'https://translate.test');
        boxAnswers('I cannot find my flight bookings.');

        const { appendMessage } = await import('./messages');
        const conversationId = await makeConversation('en');

        const message = await appendMessage({
            conversationId,
            senderType: 'guest',
            body: '항공편 예약 내역을 찾을 수 없습니다.',
        });

        expect(await settledRow(message.id)).toMatchObject({
            translated_body: 'I cannot find my flight bookings.',
            translated_lang: 'en',
            translation_status: 'translated',
        });
    });

    it('still sends the message when the box is unreachable, and marks it untranslated', async (ctx) => {
        if (!(await databaseReachable())) return ctx.skip();
        vi.stubEnv('TRANSLATION_BASE_URL', 'https://translate.test');
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const { appendMessage } = await import('./messages');
        const conversationId = await makeConversation('ko');

        // The guarantee: a third party being down is not a customer's failed send.
        const message = await appendMessage({ conversationId, senderType: 'guest', body: '환불 언제 되나요?' });
        expect(message.id).toBeTruthy();
        expect(message.body).toBe('환불 언제 되나요?');

        // And the reader is told, rather than left looking at "translating…".
        expect(await settledRow(message.id)).toMatchObject({
            translated_body: null,
            translation_status: 'untranslated',
        });
    });

    it('stores a refusal as nothing, never as the customer’s words', async (ctx) => {
        if (!(await databaseReachable())) return ctx.skip();
        vi.stubEnv('TRANSLATION_BASE_URL', 'https://translate.test');
        boxAnswers('I cannot assist with that.');
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const { appendMessage } = await import('./messages');
        const conversationId = await makeConversation('ko');

        const message = await appendMessage({ conversationId, senderType: 'guest', body: '항공편 예약 내역을 찾을 수 없습니다.' });

        expect(await settledRow(message.id)).toMatchObject({
            translated_body: null,
            translation_status: 'untranslated',
        });
    });

    it('stores nothing, and asks nothing, for English between English speakers', async (ctx) => {
        if (!(await databaseReachable())) return ctx.skip();
        vi.stubEnv('TRANSLATION_BASE_URL', 'https://translate.test');
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { appendMessage, translateInBackground } = await import('./messages');
        const conversationId = await makeConversation('en');

        const message = await appendMessage({
            conversationId,
            senderType: 'guest',
            body: 'When will the refund be processed?',
        });
        await translateInBackground(message.id);

        expect(await readRow(message.id)).toMatchObject({ translated_body: null, translation_status: null });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('stores nothing on a system notice, which each reader renders for itself', async (ctx) => {
        if (!(await databaseReachable())) return ctx.skip();
        vi.stubEnv('TRANSLATION_BASE_URL', 'https://translate.test');
        const fetchMock = boxAnswers('지원 시간이 아닙니다.');

        const { appendMessage, translateInBackground } = await import('./messages');
        const conversationId = await makeConversation('ko');

        const message = await appendMessage({
            conversationId,
            senderType: 'system',
            body: 'Support is closed.',
            noticeCode: 'asked_for_person',
        });
        await translateInBackground(message.id);

        expect(await readRow(message.id)).toMatchObject({ translated_body: null, translation_status: null });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
