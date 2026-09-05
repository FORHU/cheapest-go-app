import type { ModelClient, ModelMessage } from './model';
import type { SupportSender } from './messages';

/**
 * One turn of a Support Chat: the model is asked, and what it says is written down.
 *
 * The store is a port rather than a direct call into `messages.ts` so a turn's decisions
 * can be tested without a database. The real one is a thin adapter over `appendMessage`.
 */

/**
 * How many times the model will answer in one Support Chat before handing over.
 *
 * Not primarily a cost control — it reads to a customer as "after a while, you get a
 * person", which is the right outcome for a conversation the model is going round in
 * circles on. It bounds spend as a side effect.
 */
export const MAX_ANSWERS_PER_CONVERSATION = 30;

/**
 * What the customer is told when a handover happens.
 *
 * `system` rows are part of the transcript everyone sees — the customer in the widget and
 * the Agent in the inbox — so they are written to the customer and read as notices about
 * the conversation, not as notes about the person in it.
 *
 * The budget notice is phrased as the assistant reaching its own limit rather than the
 * customer exceeding a quota: the customer did nothing wrong, and a Support Chat that
 * scolds people for asking too many questions is worse than one that says nothing.
 *
 * These are English only. A conversation carries a `locale`, but nothing here translates
 * yet — the same gap the transactional emails have.
 */
export const HANDOVER_NOTICE = {
    budgetSpent:
        "I've reached the limit of what I can help with in one conversation. I'm passing you to someone from the team.",
    modelDeclined:
        "I'm not able to help with this one. I'm passing you to someone from the team.",
    askedForPerson:
        'You asked to speak to a person. Someone from the team will join shortly.',
    askedForPersonOutOfHours:
        'You asked to speak to a person. The team is offline right now, so this is queued for when support hours resume.',
} as const;

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

    // Counted from the transcript rather than a column, so a turn that failed and wrote
    // a system note does not quietly spend one of the customer's answers.
    const answersGiven = history.filter(m => m.senderType === 'ai').length;
    if (answersGiven >= MAX_ANSWERS_PER_CONVERSATION) {
        await deps.store.appendMessage({
            conversationId,
            senderType: 'system',
            body: HANDOVER_NOTICE.budgetSpent,
        });
        await deps.store.markWaitingHuman(conversationId);
        return;
    }

    const reply = await deps.model.complete({ messages: toTranscript(history) });

    if (reply.kind === 'escalate') {
        // The notice is written by us, not by the model. Escalation is one-way, so a
        // parting answer from the model is one an Agent then has to contradict — on
        // precisely the topics it just declined to handle. `reason` is for the Agent's
        // eyes later, never repeated to the customer.
        await deps.store.appendMessage({
            conversationId,
            senderType: 'system',
            body: HANDOVER_NOTICE.modelDeclined,
        });
        await deps.store.markWaitingHuman(conversationId);
        return;
    }

    await deps.store.appendMessage({
        conversationId,
        senderType: 'ai',
        body: reply.text,
    });
}
