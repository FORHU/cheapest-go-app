import { describe, it, expect } from 'vitest';
import { runSupportTurn } from './responder';
import type { ModelClient, ModelReply, ModelRequest } from './model';
import type {
    SupportTurnStore,
    AppendedMessage,
    TurnAllowance,
    SupportTool,
    SupportTurnDeps,
} from './responder';

/**
 * The support responder decides what happens when a customer sends a message: answer,
 * hand over to a person, or give up safely. Those decisions are the whole of the value
 * here, and none of them need a real model or a real database to exercise.
 *
 * The model is faked because it is a paid external service whose answers are not
 * deterministic. The store is faked because these tests are about what the responder
 * *decides to write*, not about whether Postgres accepts it — the schema already has its
 * own tests, and a later integration test wires the real one.
 */

/** A model that returns the given replies in order, and records what it was asked. */
function fakeModel(...replies: ModelReply[]): ModelClient & { calls: unknown[] } {
    const calls: unknown[] = [];
    let next = 0;
    return {
        calls,
        async complete(request) {
            calls.push(request);
            const reply = replies[next++];
            if (!reply) throw new Error('fakeModel: asked for more replies than it was given');
            return reply;
        },
    };
}

/** One message already in the conversation when the turn starts. */
type Existing = {
    senderType: AppendedMessage['senderType'];
    body: string;
    noticeCode?: AppendedMessage['noticeCode'];
};

/** An in-memory stand-in for the conversation's messages. */
function fakeStore(
    history: Existing[] = [],
): SupportTurnStore & { appended: AppendedMessage[]; escalated: boolean } {
    const appended: AppendedMessage[] = [];
    const store = {
        appended,
        escalated: false,
        async listMessages() {
            return history;
        },
        async appendMessage(message: AppendedMessage) {
            appended.push(message);
        },
        async markWaitingHuman() {
            store.escalated = true;
        },
    };
    return store;
}

/**
 * The site-wide allowance a turn has to claim before it may spend a model call.
 * `allowAll` is the ordinary case; the breaker is the one that refuses.
 */
function allowAll(): TurnAllowance {
    return { async claim() { return true; } };
}

function breakerTripped(): TurnAllowance {
    return { async claim() { return false; } };
}

/**
 * A tool the model may be offered, recording the arguments it was called with.
 * `requiresSession` is what ADR-0029 turns on.
 */
function fakeTool(
    name: string,
    requiresSession: boolean,
    result: unknown = 'ok',
): SupportTool & { calls: unknown[] } {
    const calls: unknown[] = [];
    return {
        name,
        description: `the ${name} tool`,
        parameters: { type: 'object', properties: {} },
        requiresSession,
        calls,
        async run(args) {
            calls.push(args);
            return result;
        },
    };
}

/** Ordinary dependencies, with only what a case cares about spelled out. */
function turnDeps(
    over: Partial<SupportTurnDeps> & { model: ModelClient; store: SupportTurnStore },
): SupportTurnDeps {
    return {
        allowance: allowAll(),
        tools: [],
        owner: { userId: null, canBeQueued: true },
        ...over,
    };
}

/** A conversation in which the model has already answered `count` times. */
function answeredTimes(count: number): Existing[] {
    const messages: Existing[] = [];
    for (let i = 0; i < count; i++) {
        messages.push({ senderType: 'guest', body: `question ${i}` });
        messages.push({ senderType: 'ai', body: `answer ${i}` });
    }
    return messages;
}

describe('runSupportTurn', () => {
    it("writes the model's answer as a single ai message", async () => {
        const store = fakeStore();
        const model = fakeModel({ kind: 'text', text: 'Flexible fares have no change fee.' });

        await runSupportTurn('conv-1', turnDeps({ model, store }));

        expect(store.appended).toEqual([
            {
                conversationId: 'conv-1',
                senderType: 'ai',
                body: 'Flexible fares have no change fee.',
            },
        ]);
    });

    it('sends the conversation so far to the model, in order and correctly attributed', async () => {
        const store = fakeStore([
            { senderType: 'guest', body: 'Do you charge a change fee?' },
            { senderType: 'ai', body: 'Which booking is it for?' },
            { senderType: 'guest', body: 'CG-481002.' },
        ]);
        const model = fakeModel({ kind: 'text', text: 'Let me check that for you.' });

        await runSupportTurn('conv-1', turnDeps({ model, store }));

        // Filtered so this stays about the transcript: whatever framing the request also
        // carries, the customer must appear as the user and the assistant as itself, or
        // the model answers the wrong half of its own conversation.
        const transcript = (model.calls[0] as ModelRequest).messages.filter(m => m.role !== 'system');
        expect(transcript).toEqual([
            { role: 'user', content: 'Do you charge a change fee?' },
            { role: 'assistant', content: 'Which booking is it for?' },
            { role: 'user', content: 'CG-481002.' },
        ]);
    });

    it('queues the conversation for a person when the model asks to hand over', async () => {
        const store = fakeStore([{ senderType: 'guest', body: 'I want a refund.' }]);
        const model = fakeModel({ kind: 'escalate', reason: 'refund request' });

        await runSupportTurn('conv-1', turnDeps({ model, store }));

        expect(store.escalated).toBe(true);
    });

    it('offers a person instead of answering once the turn budget is spent', async () => {
        // 30 answers already given. A fake with no replies queued throws if asked, so
        // this fails loudly rather than quietly if the model is consulted anyway.
        const store = fakeStore([
            ...answeredTimes(30),
            { senderType: 'guest', body: 'and one more thing' },
        ]);
        const model = fakeModel();

        await runSupportTurn('conv-1', turnDeps({ model, store }));

        expect(model.calls).toEqual([]);
        expect(store.escalated).toBe(true);
    });

    it('tells the customer what happened when the budget runs out', async () => {
        // Without this the customer sends a message and gets silence while the status
        // changes behind them, which reads as the chat having broken.
        const store = fakeStore([
            ...answeredTimes(30),
            { senderType: 'guest', body: 'and one more thing' },
        ]);

        await runSupportTurn('conv-1', turnDeps({ model: fakeModel(), store }));

        expect(store.appended).toEqual([
            {
                conversationId: 'conv-1',
                noticeCode: 'budget_spent',
                senderType: 'system',
                body: "I've reached the limit of what I can help with in one conversation. I'm passing you to someone from the team.",
            },
        ]);
    });

    it('still answers on the last turn of the budget', async () => {
        // 29 answers given: the boundary is exclusive, or the budget is really 29.
        const store = fakeStore([
            ...answeredTimes(29),
            { senderType: 'guest', body: 'and one more thing' },
        ]);
        const model = fakeModel({ kind: 'text', text: 'Of course.' });

        await runSupportTurn('conv-1', turnDeps({ model, store }));

        expect(store.escalated).toBe(false);
        expect(store.appended.map(m => m.body)).toEqual(['Of course.']);
    });

    it('tells the customer what happened when the model hands over', async () => {
        const store = fakeStore([{ senderType: 'guest', body: 'I want a refund.' }]);
        const model = fakeModel({ kind: 'escalate', reason: 'refund request' });

        await runSupportTurn('conv-1', turnDeps({ model, store }));

        expect(store.appended).toEqual([
            {
                conversationId: 'conv-1',
                noticeCode: 'model_declined',
                senderType: 'system',
                body: "I'm not able to help with this one. I'm passing you to someone from the team.",
            },
        ]);
    });

    it('does not consult the model while the site-wide breaker is tripped', async () => {
        const store = fakeStore([{ senderType: 'guest', body: 'hello' }]);
        const model = fakeModel();

        await runSupportTurn('conv-1', { model, store, allowance: breakerTripped() });

        expect(model.calls).toEqual([]);
    });

    it('tells the customer the assistant is unavailable when the breaker is tripped', async () => {
        const store = fakeStore([{ senderType: 'guest', body: 'hello' }]);

        await runSupportTurn('conv-1', { model: fakeModel(), store, allowance: breakerTripped() });

        expect(store.appended).toEqual([
            {
                conversationId: 'conv-1',
                noticeCode: 'assistant_unavailable',
                senderType: 'system',
                body: 'The assistant is unavailable at the moment. You can still ask to speak to a person and someone from the team will pick this up.',
            },
        ]);
    });

    it('does not queue everyone for a person when the breaker trips', async () => {
        // The breaker trips site-wide, so auto-escalating would flood the Agent queue
        // during exactly the incident that tripped it. Asking for a person stays the
        // customer's decision.
        const store = fakeStore([{ senderType: 'guest', body: 'hello' }]);

        await runSupportTurn('conv-1', { model: fakeModel(), store, allowance: breakerTripped() });

        expect(store.escalated).toBe(false);
    });

    it('does not throw when the model fails, so an unawaited turn cannot crash the process', async () => {
        // POST /messages starts the turn without awaiting it. An escaping rejection is an
        // unhandled promise rejection in the Node process serving every other request.
        const store = fakeStore([{ senderType: 'guest', body: 'hello' }]);
        const model: ModelClient = {
            async complete() { throw new Error('upstream 503'); },
        };

        await expect(
            runSupportTurn('conv-1', turnDeps({ model, store })),
        ).resolves.toBeUndefined();
    });

    it('does not queue anyone when the model fails', async () => {
        // A fault is rarely local: the first one was a missing API key, broken for every
        // conversation at once. "Hand over when something breaks" then means "queue every
        // customer on the site". Escalation happens by intent, never by malfunction.
        const store = fakeStore([{ senderType: 'guest', body: 'hello' }]);
        const model: ModelClient = {
            async complete() { throw new Error('upstream 503'); },
        };

        await runSupportTurn('conv-1', turnDeps({ model, store }));

        expect(store.escalated).toBe(false);
    });

    it('tells the customer when the model fails, rather than leaving them typing at nothing', async () => {
        const store = fakeStore([{ senderType: 'guest', body: 'hello' }]);
        const model: ModelClient = {
            async complete() { throw new Error('upstream 503'); },
        };

        await runSupportTurn('conv-1', turnDeps({ model, store }));

        expect(store.appended).toEqual([
            {
                conversationId: 'conv-1',
                senderType: 'system',
                noticeCode: 'model_failed',
                body: 'Something went wrong on my end. You can ask to speak to a person and someone from the team will pick this up.',
            },
        ]);
    });

    it('offers a guest only the tools that need no session', async () => {
        // ADR-0029: the email a guest types is a reply-to address, not a credential, so
        // nothing that reads one person's data is even put on the menu.
        const model = fakeModel({ kind: 'text', text: 'ok' });
        const tools = [fakeTool('get_weather', false), fakeTool('get_bookings', true)];

        await runSupportTurn('conv-1', turnDeps({
            model,
            store: fakeStore([{ senderType: 'guest', body: 'where is my booking?' }]),
            tools,
            owner: { userId: null },
        }));

        expect((model.calls[0] as ModelRequest).tools.map(t => t.name)).toEqual(['get_weather']);
    });

    it('offers a signed-in customer the tools that need a session', async () => {
        const model = fakeModel({ kind: 'text', text: 'ok' });
        const tools = [fakeTool('get_weather', false), fakeTool('get_bookings', true)];

        await runSupportTurn('conv-1', turnDeps({
            model,
            store: fakeStore([{ senderType: 'guest', body: 'where is my booking?' }]),
            tools,
            owner: { userId: 'user-1' },
        }));

        expect((model.calls[0] as ModelRequest).tools.map(t => t.name)).toEqual(['get_weather', 'get_bookings']);
    });

    it('runs the tool the model asks for, with the arguments it gave', async () => {
        const weather = fakeTool('get_weather', false, { tempC: 31 });
        const model = fakeModel(
            { kind: 'tool', name: 'get_weather', args: { city: 'Cebu' } },
            { kind: 'text', text: "It's 31°C in Cebu." },
        );

        await runSupportTurn('conv-1', turnDeps({
            model,
            store: fakeStore([{ senderType: 'guest', body: 'weather in Cebu?' }]),
            tools: [weather],
        }));

        expect(weather.calls).toEqual([{ city: 'Cebu' }]);
    });

    it("gives the tool's result back to the model and writes the answer that follows", async () => {
        const weather = fakeTool('get_weather', false, { tempC: 31 });
        const model = fakeModel(
            { kind: 'tool', name: 'get_weather', args: { city: 'Cebu' } },
            { kind: 'text', text: "It's 31°C in Cebu." },
        );
        const store = fakeStore([{ senderType: 'guest', body: 'weather in Cebu?' }]);

        await runSupportTurn('conv-1', turnDeps({ model, store, tools: [weather] }));

        const second = (model.calls[1] as ModelRequest).messages;
        expect(second.at(-1)).toEqual({
            role: 'system',
            content: 'get_weather returned: {"tempC":31}',
        });
        expect(store.appended).toEqual([
            { conversationId: 'conv-1', senderType: 'ai', body: "It's 31°C in Cebu." },
        ]);
    });

    it('refuses to run a tool it never offered', async () => {
        // The last line of defence. A model can name a function nobody gave it, and the
        // one that matters is a write: cancelling a booking must be unreachable even if
        // the model asks for it by name.
        const cancel = fakeTool('cancel_booking', false);
        const model = fakeModel({ kind: 'tool', name: 'cancel_booking', args: { id: 'CG-1' } });
        const store = fakeStore([{ senderType: 'guest', body: 'cancel my trip' }]);

        await runSupportTurn('conv-1', turnDeps({ model, store, tools: [] }));

        expect(cancel.calls).toEqual([]);
        expect(store.escalated).toBe(true);
    });

    it('gives up and hands over when the model will not stop calling tools', async () => {
        const weather = fakeTool('get_weather', false);
        const model = fakeModel(
            ...Array.from({ length: 5 }, () => ({
                kind: 'tool' as const, name: 'get_weather', args: {},
            })),
        );
        const store = fakeStore([{ senderType: 'guest', body: 'weather?' }]);

        await runSupportTurn('conv-1', turnDeps({ model, store, tools: [weather] }));

        expect(weather.calls).toHaveLength(4);
        expect(store.escalated).toBe(true);
    });

    it('asks a guest for details instead of queueing a chat nobody could reply to', async () => {
        // A guest gives no name or email until they ask for a person, so a model-initiated
        // handover can reach a conversation with no way to answer it. The database refuses
        // that row; without this the customer is told someone is coming and nobody is.
        const store = fakeStore([{ senderType: 'guest', body: 'I want a refund.' }]);
        const model = fakeModel({ kind: 'escalate' });

        await runSupportTurn('conv-1', turnDeps({
            model,
            store,
            owner: { userId: null, canBeQueued: false },
        }));

        expect(store.escalated).toBe(false);
        expect(store.appended).toEqual([
            {
                conversationId: 'conv-1',
                senderType: 'system',
                noticeCode: 'details_needed',
                body: "I'd like to pass you to someone from the team. Leave your name and email and they'll pick this up.",
            },
        ]);
    });

    it('asks for details rather than queueing when the budget runs out on a guest', async () => {
        const store = fakeStore([
            ...answeredTimes(30),
            { senderType: 'guest', body: 'and one more thing' },
        ]);

        await runSupportTurn('conv-1', turnDeps({
            model: fakeModel(),
            store,
            owner: { userId: null, canBeQueued: false },
        }));

        expect(store.escalated).toBe(false);
        expect(store.appended.map(m => m.noticeCode)).toEqual(['details_needed']);
    });

    it('does not repeat a notice it has just written', async () => {
        // Three identical bubbles in a row read as a broken loop rather than an
        // explanation, and the Agent who opens the transcript scrolls past all of them.
        const store = fakeStore([
            { senderType: 'guest', body: 'first question' },
            { senderType: 'system', body: 'assistant is unavailable', noticeCode: 'model_failed' },
            { senderType: 'guest', body: 'second question' },
        ]);
        const model: ModelClient = {
            async complete() { throw new Error('upstream 503'); },
        };

        await runSupportTurn('conv-1', turnDeps({ model, store }));

        expect(store.appended).toEqual([]);
    });

    it('says it again if the assistant recovered in between', async () => {
        // Only the message immediately before is checked. A second outage after a working
        // answer is news, not repetition.
        const store = fakeStore([
            { senderType: 'system', body: 'unavailable', noticeCode: 'model_failed' },
            { senderType: 'guest', body: 'second question' },
            { senderType: 'ai', body: 'Here you go.' },
            { senderType: 'guest', body: 'third question' },
        ]);
        const model: ModelClient = {
            async complete() { throw new Error('upstream 503'); },
        };

        await runSupportTurn('conv-1', turnDeps({ model, store }));

        expect(store.appended.map(m => m.noticeCode)).toEqual(['model_failed']);
    });

    it('says nothing of its own when it hands over', async () => {
        // Escalation is one-way. A parting answer from the model is the thing an Agent
        // then has to contradict, on exactly the topics the model refused to handle.
        const store = fakeStore([{ senderType: 'guest', body: 'I want a refund.' }]);
        const model = fakeModel({ kind: 'escalate' });

        await runSupportTurn('conv-1', turnDeps({ model, store }));

        expect(store.appended.filter(m => m.senderType === 'ai')).toEqual([]);
    });
});
