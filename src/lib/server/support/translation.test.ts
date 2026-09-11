import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    targetLocaleFor,
    readTranslation,
    translate,
    translationFor,
    translationConfigFromEnv,
} from './translation';

/**
 * Which language a message has to be rendered into, per ADR-0033: one rendering per
 * direction. A customer's words go into English because English is the staff working
 * language; an Agent's reply goes into whatever the customer opened the chat in.
 *
 * Returning null is the decision "this message needs no translation at all" — it is the
 * difference between storing nothing and calling a third-party box for a sentence that is
 * already in the reader's language.
 */

describe('targetLocaleFor', () => {
    it('renders a customer message into English for the Agent', () => {
        expect(targetLocaleFor('guest', 'ko')).toBe('en');
    });

    it("renders an Agent reply into the customer's locale", () => {
        expect(targetLocaleFor('agent', 'ko')).toBe('ko');
    });

    it('asks for nothing when the conversation is already in English', () => {
        // Both directions collapse to the same language, so there is nothing to render.
        // Left in, this would spend a network call on a third-party box per message to be
        // told that "When will the refund be processed?" means what it says.
        expect(targetLocaleFor('guest', 'en')).toBeNull();
        expect(targetLocaleFor('agent', 'en')).toBeNull();
    });
});

/**
 * Turning what Chatwonder said into either a translation or nothing.
 *
 * This is the whole of the risk in ADR-0034. That endpoint is a relay to a model wearing
 * another product's persona, and it answers 200 whatever it does: it will translate, but it
 * will just as readily refuse, explain the grammar, or answer the customer's question as if
 * it were the support agent. None of those are translations and all of them arrive looking
 * exactly like one.
 *
 * Every string below is real output captured from the live box, not an invented shape.
 */
describe('readTranslation', () => {
    const KO = '환불 언제 되나요?';

    it('takes a bare translation as the translation', () => {
        expect(readTranslation('When will the refund be processed?', KO))
            .toBe('When will the refund be processed?');
    });

    it('refuses an explanation wrapped around the translation', () => {
        // Captured verbatim. The translation is in there, but so is a paragraph of invented
        // refund policy — and stored, this is shown to the customer as CheapestGo's words.
        const essay = '환불 언제 되나요? translates to "When will the refund be '
            + 'processed?" in English. \n\nThis question typically arises in contexts such as customer '
            + 'service interactions, where a customer is inquiring about the status of their refund for a '
            + 'product or service they have returned or canceled. The phrase indicates a concern regarding '
            + 'the timeline for receiving their money back, which can vary based on the company’s refund '
            + 'policy, the payment method used, and the time it takes to process the refund after approval.';

        expect(readTranslation(essay, KO)).toBeNull();
    });

    it('refuses a refusal', () => {
        const refusal = "I'm sorry, but I cannot assist with your request as it appears to contain "
            + 'unclear or unrecognized text. Could you please clarify your question or provide more '
            + 'details? Thank you!';

        expect(readTranslation(refusal, KO)).toBeNull();
    });

    it('refuses an answer to the question instead of a rendering of it', () => {
        // The un-prefixed probe got this: the model answered as though it were the Agent.
        // Stored, an Agent reads a five-step refund procedure nobody at CheapestGo wrote.
        const answered = '환불 진행 과정은 여러 요인에 '
            + '따라 달라질 수 있습니다:\n\n'
            + '1. **환불 요청 접수**\n\n2. **요청 검토**\n\n'
            + '3. **환불 승인**\n\n4. **환불 처리**';

        expect(readTranslation(answered, KO)).toBeNull();
    });

    it('has nothing to store when the box returned nothing', () => {
        expect(readTranslation('', KO)).toBeNull();
        expect(readTranslation('   ', KO)).toBeNull();
    });
});

/**
 * The call itself.
 *
 * Chatwonder is a box this repository does not own, does not deploy and cannot fix: its
 * OpenAI key has been rejected before, it restarts, and it is reachable only over the
 * public internet. So the only behaviour that matters here is what happens when it is
 * having a bad day, and the answer has to be "the message still sends" — per ADR-0034 and
 * CONTEXT.md, a malfunction never changes a conversation's state. A throw from this
 * function would be a customer's message refused because a third party is down.
 */
describe('translate', () => {
    afterEach(() => vi.unstubAllGlobals());

    const config = { baseUrl: 'https://translate.test' };

    it('returns the rendering when the box answers', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) =>
            url.endsWith('/session-id')
                ? new Response(JSON.stringify({ session_id: 's-1' }))
                : new Response(JSON.stringify({ response: 'When will the refund be processed?' })),
        ));

        expect(await translate('\uD658\uBD88 \uC5B8\uC81C \uB418\uB098\uC694?', 'en', config))
            .toBe('When will the refund be processed?');
    });

    it('mints a session per message and never reuses one', async () => {
        // ADR-0034: /chat answers "based on prior session context", so a reused session
        // leaks one customer's message into the next one's translation.
        const fetchMock = vi.fn(async (url: string) =>
            url.endsWith('/session-id')
                ? new Response(JSON.stringify({ session_id: `s-${fetchMock.mock.calls.length}` }))
                : new Response(JSON.stringify({ response: 'ok' })),
        );
        vi.stubGlobal('fetch', fetchMock);

        await translate('hello', 'ko', config);
        await translate('hello', 'ko', config);

        const minted = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/session-id'));
        expect(minted).toHaveLength(2);
    });

    it('delivers untranslated when the box refuses the session', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
        expect(await translate('hello', 'ko', config)).toBeNull();
    });

    it('delivers untranslated when the box is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
        expect(await translate('hello', 'ko', config)).toBeNull();
    });

    it('delivers untranslated when the box answers with an essay', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) =>
            url.endsWith('/session-id')
                ? new Response(JSON.stringify({ session_id: 's-1' }))
                : new Response(JSON.stringify({
                    response: "I'm sorry, but I cannot assist with your request as it appears to "
                        + 'contain unclear or unrecognized text. Could you please clarify your '
                        + 'question or provide more details? Thank you!',
                })),
        ));

        expect(await translate('\uD658\uBD88 \uC5B8\uC81C \uB418\uB098\uC694?', 'en', config)).toBeNull();
    });

    it('is not attempted at all without a configured box', async () => {
        // No TRANSLATION_BASE_URL in an environment is a deployment that does not translate,
        // not an error to raise on every message.
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        expect(await translate('hello', 'ko', { baseUrl: '' })).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

/**
 * What a message being written asks for: the rendering to store next to it, or null.
 *
 * This is the seam appendMessage calls, and it exists so the two guarantees that matter can
 * be proved without a database — that the right direction is asked for, and that an English
 * conversation never touches the network at all.
 */
describe('translationFor', () => {
    afterEach(() => vi.unstubAllGlobals());

    const config = { baseUrl: 'https://translate.test' };

    /** Captures what was asked of the box, and answers everything successfully. */
    function spyFetch() {
        const asked: string[] = [];
        const mock = vi.fn(async (url: string, init?: RequestInit) => {
            if (String(url).endsWith('/session-id')) {
                return new Response(JSON.stringify({ session_id: 's-1' }));
            }
            asked.push(String(init?.body ?? ''));
            return new Response(JSON.stringify({ response: 'rendered' }));
        });
        vi.stubGlobal('fetch', mock);
        return { asked, mock };
    }

    it("asks for English when a customer writes in their own language", async () => {
        const { asked } = spyFetch();

        await translationFor('guest', 'ko', 'hello', config);

        expect(asked).toHaveLength(1);
        expect(asked[0]).toContain('English');
    });

    it("asks for the customer's language when the Agent replies", async () => {
        const { asked } = spyFetch();

        await translationFor('agent', 'ko', 'hello', config);

        expect(asked).toHaveLength(1);
        expect(asked[0]).toContain('Korean');
    });

    it('never touches the network for an English conversation', async () => {
        // The guarantee worth a test of its own: this is every message of the common case,
        // and a call here would put a third-party box on the path of chats that need it least.
        const { mock } = spyFetch();

        expect(await translationFor('guest', 'en', 'hello', config)).toBeNull();
        expect(await translationFor('agent', 'en', 'hello', config)).toBeNull();
        expect(mock).not.toHaveBeenCalled();
    });

    it('never touches the network for a system notice', async () => {
        // Notices are stored as a code and rendered from each reader's own locale files,
        // so translating the English fallback would be paying to duplicate the i18n bundle.
        const { mock } = spyFetch();

        expect(await translationFor('system', 'ko', 'Support is closed.', config)).toBeNull();
        expect(mock).not.toHaveBeenCalled();
    });
});

describe('translationConfigFromEnv', () => {
    it('waits no longer than a customer will for a send', () => {
        // Translation is inline, before the insert, so this timeout is time the customer
        // spends watching their own message not appear.
        const { timeoutMs } = translationConfigFromEnv();
        expect(timeoutMs).toBeLessThanOrEqual(5_000);
    });
});
