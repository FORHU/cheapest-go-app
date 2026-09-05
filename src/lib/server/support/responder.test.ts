import { describe, it, expect } from 'vitest';
import { runSupportTurn } from './responder';
import type { ModelClient, ModelReply, ModelRequest } from './model';
import type { SupportTurnStore, AppendedMessage } from './responder';

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
type Existing = { senderType: AppendedMessage['senderType']; body: string };

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

        await runSupportTurn('conv-1', { model, store });

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

        await runSupportTurn('conv-1', { model, store });

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

        await runSupportTurn('conv-1', { model, store });

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

        await runSupportTurn('conv-1', { model, store });

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

        await runSupportTurn('conv-1', { model: fakeModel(), store });

        expect(store.appended).toEqual([
            {
                conversationId: 'conv-1',
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

        await runSupportTurn('conv-1', { model, store });

        expect(store.escalated).toBe(false);
        expect(store.appended.map(m => m.body)).toEqual(['Of course.']);
    });

    it('tells the customer what happened when the model hands over', async () => {
        const store = fakeStore([{ senderType: 'guest', body: 'I want a refund.' }]);
        const model = fakeModel({ kind: 'escalate', reason: 'refund request' });

        await runSupportTurn('conv-1', { model, store });

        expect(store.appended).toEqual([
            {
                conversationId: 'conv-1',
                senderType: 'system',
                body: "I'm not able to help with this one. I'm passing you to someone from the team.",
            },
        ]);
    });

    it('says nothing of its own when it hands over', async () => {
        // Escalation is one-way. A parting answer from the model is the thing an Agent
        // then has to contradict, on exactly the topics the model refused to handle.
        const store = fakeStore([{ senderType: 'guest', body: 'I want a refund.' }]);
        const model = fakeModel({ kind: 'escalate' });

        await runSupportTurn('conv-1', { model, store });

        expect(store.appended.filter(m => m.senderType === 'ai')).toEqual([]);
    });
});
