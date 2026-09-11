import { describe, it, expect, afterAll, afterEach, vi } from 'vitest';

/**
 * The rendering stored beside a message as it is written.
 *
 * Integration rather than unit tests because the thing being checked is a column: that the
 * translation reaches `support_messages.translated_body` on the same row, in the same
 * insert, and that a message whose translation failed is still a row. A fake store would
 * report whatever it was handed and would keep passing while every real send either stored
 * nothing or, worse, threw.
 *
 * Chatwonder itself is stubbed. It is a model behind an HTTP call: asked the same question
 * twice it answers differently, so a test that asserted on its real output would be
 * asserting on the weather. What is worth pinning down is what this repository does with
 * each shape of answer, and those shapes are already known from the live probes.
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
 * A conversation in a given language, on the guest path.
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

/** Chatwonder, answering every translation with the same rendering. */
function boxAnswers(rendering: string) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
        String(url).endsWith('/session-id')
            ? new Response(JSON.stringify({ session_id: 's-1' }))
            : new Response(JSON.stringify({ response: rendering })),
    ));
}

afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TRANSLATION_BASE_URL;
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
    it('stores the English rendering beside a customer message', async (ctx) => {
        if (!(await databaseReachable())) return ctx.skip();
        process.env.TRANSLATION_BASE_URL = 'https://translate.test';
        boxAnswers('When will the refund be processed?');

        const { appendMessage } = await import('./messages');
        const conversationId = await makeConversation('ko');

        const message = await appendMessage({
            conversationId,
            senderType: 'guest',
            body: '환불 언제 되나요?',
        });

        expect(message.translatedBody).toBe('When will the refund be processed?');

        // Read back rather than trust the returned object: the column is the point.
        const db = await sql();
        const [row] = await db<{ translated_body: string | null }[]>`
            SELECT translated_body FROM support_messages WHERE id = ${message.id}::uuid
        `;
        expect(row.translated_body).toBe('When will the refund be processed?');
    });

    it('still sends the message when the box is unreachable', async (ctx) => {
        if (!(await databaseReachable())) return ctx.skip();
        process.env.TRANSLATION_BASE_URL = 'https://translate.test';
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));

        const { appendMessage } = await import('./messages');
        const conversationId = await makeConversation('ko');

        // The guarantee: a third party being down is not a customer's failed send.
        const message = await appendMessage({
            conversationId,
            senderType: 'guest',
            body: '환불 언제 되나요?',
        });

        expect(message.id).toBeTruthy();
        expect(message.body).toBe('환불 언제 되나요?');
        expect(message.translatedBody).toBeNull();
    });

    it('stores nothing for a conversation already in English', async (ctx) => {
        if (!(await databaseReachable())) return ctx.skip();
        process.env.TRANSLATION_BASE_URL = 'https://translate.test';
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { appendMessage } = await import('./messages');
        const conversationId = await makeConversation('en');

        const message = await appendMessage({
            conversationId,
            senderType: 'guest',
            body: 'When will the refund be processed?',
        });

        expect(message.translatedBody).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('stores nothing on a system notice, which each reader renders for itself', async (ctx) => {
        if (!(await databaseReachable())) return ctx.skip();
        process.env.TRANSLATION_BASE_URL = 'https://translate.test';
        boxAnswers('지원 시간이 아닙니다.');

        const { appendMessage } = await import('./messages');
        const conversationId = await makeConversation('ko');

        const message = await appendMessage({
            conversationId,
            senderType: 'system',
            body: 'Support is closed.',
            noticeCode: 'asked_for_person',
        });

        // The table refuses a translation on a system row outright; this proves the code
        // never tries, rather than relying on the constraint to catch it.
        expect(message.translatedBody).toBeNull();
    });
});
