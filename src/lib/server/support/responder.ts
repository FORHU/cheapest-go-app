import type { ModelClient, ModelMessage } from './model';
import type { SupportSender } from './messages';

/**
 * One turn of a Support Chat: the model is asked, and what it says is written down.
 *
 * The store is a port rather than a direct call into `messages.ts` so a turn's decisions
 * can be tested without a database. The real one is a thin adapter over `appendMessage`.
 */

export interface AppendedMessage {
    conversationId: string;
    senderType: SupportSender;
    body: string;
}

export interface TurnMessage {
    senderType: SupportSender;
    body: string;
}

export interface SupportTurnStore {
    listMessages(conversationId: string): Promise<TurnMessage[]>;
    appendMessage(message: AppendedMessage): Promise<void>;
    markWaitingHuman(conversationId: string): Promise<void>;
}

/**
 * The conversation as the model should see it.
 *
 * Only the customer and the model are in it. An Agent's messages are left out because
 * they cannot arise: Escalation is one-way, so no turn ever runs on a conversation an
 * Agent has spoken in. `system` rows are internal notes written for whoever opens the
 * inbox, and reading them back to the model would let a note about the customer become
 * something the model repeats to them.
 */
function toTranscript(messages: TurnMessage[]): ModelMessage[] {
    const transcript: ModelMessage[] = [];
    for (const message of messages) {
        if (message.senderType === 'guest') {
            transcript.push({ role: 'user', content: message.body });
        } else if (message.senderType === 'ai') {
            transcript.push({ role: 'assistant', content: message.body });
        }
    }
    return transcript;
}

export interface SupportTurnDeps {
    model: ModelClient;
    store: SupportTurnStore;
}

export async function runSupportTurn(
    conversationId: string,
    deps: SupportTurnDeps,
): Promise<void> {
    const history = await deps.store.listMessages(conversationId);
    const reply = await deps.model.complete({ messages: toTranscript(history) });

    if (reply.kind === 'escalate') {
        // Nothing is written on the model's behalf. Escalation is one-way, so a parting
        // answer here is one an Agent then has to contradict — on precisely the topics
        // the model just declined to handle.
        await deps.store.markWaitingHuman(conversationId);
        return;
    }

    await deps.store.appendMessage({
        conversationId,
        senderType: 'ai',
        body: reply.text,
    });
}
