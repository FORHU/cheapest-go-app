import type { ModelClient, ModelMessage, ModelReply } from './model';
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
 * How many tools one turn may run before giving up on the model and fetching a person.
 *
 * A model that keeps asking for tools is not converging on an answer, and the customer is
 * watching a typing indicator the whole time. Four is enough to look something up, check a
 * date and answer; it is not enough to loop.
 *
 * Note this makes a "turn" up to five model calls, while the site-wide allowance is
 * claimed once per turn — the ceiling counts turns, not calls, which is what it is named
 * for but worth knowing when reading spend.
 */
export const MAX_TOOL_CALLS_PER_TURN = 4;

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
 * The English here is not the notice — the *code* is. A stored sentence can only ever be
 * right for one of the two people who read a Support Chat: write it in Korean for a
 * GeomeeGo customer and the English-speaking Agent opening the inbox reads Korean. So the
 * row carries which notice it is, each reader renders it from their own locale files
 * (`support.notice.*`), and these strings are the English rendering plus the fallback for
 * a client that meets a code it does not know.
 */
export type SupportNoticeCode =
    | 'budget_spent'
    | 'model_declined'
    | 'asked_for_person'
    | 'asked_for_person_out_of_hours'
    | 'assistant_unavailable'
    | 'model_failed'
    | 'details_needed';

export const SUPPORT_NOTICE: Record<SupportNoticeCode, string> = {
    budget_spent:
        "I've reached the limit of what I can help with in one conversation. I'm passing you to someone from the team.",
    model_declined:
        "I'm not able to help with this one. I'm passing you to someone from the team.",
    asked_for_person:
        'You asked to speak to a person. Someone from the team will join shortly.',
    asked_for_person_out_of_hours:
        'You asked to speak to a person. The team is offline right now, so this is queued for when support hours resume.',
    assistant_unavailable:
        'The assistant is unavailable at the moment. You can still ask to speak to a person and someone from the team will pick this up.',
    model_failed:
        'Something went wrong on my end. You can ask to speak to a person and someone from the team will pick this up.',
    details_needed:
        "I'd like to pass you to someone from the team. Leave your name and email and they'll pick this up.",
};

/** A notice as a message row: the code drives rendering, the body is the fallback. */
export function noticeMessage(
    conversationId: string,
    code: SupportNoticeCode,
): AppendedMessage {
    return {
        conversationId,
        senderType: 'system',
        noticeCode: code,
        body: SUPPORT_NOTICE[code],
    };
}

export interface AppendedMessage {
    conversationId: string;
    senderType: SupportSender;
    body: string;
    /**
     * Set on `system` rows only. What each reader renders in their own language; `body`
     * is the English it falls back to.
     */
    noticeCode?: SupportNoticeCode;
}

export interface TurnMessage {
    senderType: SupportSender;
    body: string;
    /** Set on system rows — what lets a turn see whether it has just said this. */
    noticeCode?: SupportNoticeCode | null;
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
 * Agent has spoken in. `system` rows are left out because they are the app narrating the
 * conversation, not part of it — feeding "I'm passing you to someone from the team" back
 * as the assistant's own words is how a model starts repeating a handover it never made.
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

/**
 * The site-wide ceiling on model turns, asked before a turn spends one.
 *
 * A port rather than a direct call to the rate limiter so a tripped breaker is a one-line
 * fake in a test instead of a clock to wind forward. The real one counts against a fixed
 * key in the Postgres-backed limiter, which is already shared across instances.
 */
export interface TurnAllowance {
    /** True if this turn may spend a model call. */
    claim(): Promise<boolean>;
}

/**
 * Something the model may do on the customer's behalf. Read-only, all of them.
 *
 * `requiresSession` is the enforcement point for ADR-0029: a tool that reads a specific
 * person's data is offered only when a Lucia session says who that person is. The name
 * and email a guest types at Escalation never satisfy it — anyone can type anyone's.
 */
export interface SupportTool {
    name: string;
    /** What the model is told this does. */
    description: string;
    /** JSON Schema for the arguments the model may pass. */
    parameters: Record<string, unknown>;
    requiresSession: boolean;
    run(args: unknown, context: { userId: string | null }): Promise<unknown>;
}

/**
 * Who the conversation belongs to.
 *
 * Read from the conversation row rather than from the request that started the turn, so
 * the answer is the owner of the chat and not whoever happened to send the last message.
 */
export interface TurnOwner {
    userId: string | null;
    /**
     * Whether an Escalation could actually be answered — a signed-in customer, or a guest
     * who has already left a name and email.
     *
     * A guest is not asked for details until they ask for a person, so the model can decide
     * to hand over a conversation nobody can reply to. The database refuses that row
     * (`support_conversations_queued_is_answerable_check`); this is how the responder finds
     * out before promising a customer that help is coming.
     */
    canBeQueued: boolean;
}

export interface SupportTurnDeps {
    model: ModelClient;
    store: SupportTurnStore;
    allowance: TurnAllowance;
    tools: SupportTool[];
    owner: TurnOwner;
}

/**
 * Hand the conversation to a person, saying why.
 *
 * Every handover goes through here so the one case that cannot be queued — a guest who
 * has left no way to reach them — is handled once rather than at each of the four places
 * the responder decides to give up.
 */
async function handOver(
    conversationId: string,
    code: SupportNoticeCode,
    history: TurnMessage[],
    deps: SupportTurnDeps,
): Promise<void> {
    if (!deps.owner.canBeQueued) {
        // Ask, rather than promise. The widget shows its escalation form on this notice,
        // and the customer's own request is what queues the conversation.
        await writeNotice(conversationId, 'details_needed', history, deps);
        return;
    }

    await writeNotice(conversationId, code, history, deps);
    await deps.store.markWaitingHuman(conversationId);
}

/**
 * Write a notice, unless it is the one we just wrote.
 *
 * Three identical bubbles in a row read as a broken loop rather than an explanation, and
 * the Agent who opens the transcript has to scroll past all of them. Only the immediately
 * preceding message is checked: if the assistant recovered and failed again later, saying
 * so a second time is right.
 */
async function writeNotice(
    conversationId: string,
    code: SupportNoticeCode,
    history: TurnMessage[],
    deps: SupportTurnDeps,
): Promise<void> {
    // The last thing *we* said, not the last thing in the conversation — the customer's
    // new message is always last, so comparing against that would never match.
    const lastFromUs = [...history].reverse().find(message => message.senderType !== 'guest');
    if (lastFromUs?.senderType === 'system' && lastFromUs.noticeCode === code) return;

    await deps.store.appendMessage(noticeMessage(conversationId, code));
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
        await handOver(conversationId, 'budget_spent', history, deps);
        return;
    }

    // Claimed after the per-conversation budget, so a conversation that was going to hand
    // over anyway does not spend one of the site's remaining turns to find that out.
    if (!(await deps.allowance.claim())) {
        // Deliberately not an Escalation. The breaker trips site-wide, so queueing every
        // conversation would flood the Agent inbox during exactly the incident that
        // tripped it — and the model may well be answering again within the hour.
        await writeNotice(conversationId, 'assistant_unavailable', history, deps);
        return;
    }

    // Built once from who owns the conversation. A tool the owner is not entitled to is
    // never named to the model, so there is nothing for it to ask for by accident.
    const offered = deps.tools.filter(tool => !tool.requiresSession || deps.owner.userId);
    const offeredDefinitions = offered.map(({ name, description, parameters }) => ({
        name,
        description,
        parameters,
    }));

    const messages = toTranscript(history);
    let reply: ModelReply;
    let toolCallsMade = 0;

    try {
        for (;;) {
            const turn = await deps.model.complete({ messages, tools: offeredDefinitions });
            if (turn.kind !== 'tool') {
                reply = turn;
                break;
            }

            const tool = offered.find(candidate => candidate.name === turn.name);
            if (!tool) {
                // Either a hallucinated name or one deliberately withheld from this
                // caller. Both mean the model is asking for something it was not given,
                // and neither is a thing to negotiate about — a person takes it from here.
                console.warn('[support/responder] model asked for an unoffered tool:', turn.name);
                await handOver(conversationId, 'model_declined', history, deps);
                return;
            }

            if (toolCallsMade >= MAX_TOOL_CALLS_PER_TURN) {
                await handOver(conversationId, 'model_declined', history, deps);
                return;
            }

            toolCallsMade++;
            const result = await tool.run(turn.args, { userId: deps.owner.userId });
            messages.push({
                role: 'system',
                content: `${tool.name} returned: ${JSON.stringify(result)}`,
            });
        }
    } catch (err) {
        // A fault, unlike the breaker above, so this one does reach a person: the breaker
        // is a spend ceiling we chose and it clears itself, while this is something
        // broken. If the provider is down site-wide the queue will fill, which is a
        // signal the team needs rather than one to suppress.
        // Not an Escalation. A fault is rarely local — the first one here was a missing API
        // key, which is broken for every conversation on the site at once, so handing over
        // on failure quietly means queueing every customer we have. The chat stays where it
        // is and the customer keeps the ability to ask for a person themselves.
        console.error('[support/responder] model turn failed:', err);
        await writeNotice(conversationId, 'model_failed', history, deps);
        return;
    }

    if (reply.kind === 'escalate') {
        // The notice is written by us, not by the model. Escalation is one-way, so a
        // parting answer from the model is one an Agent then has to contradict — on
        // precisely the topics it just declined to handle. `reason` is for the Agent's
        // eyes later, never repeated to the customer.
        await handOver(conversationId, 'model_declined', history, deps);
        return;
    }

    await deps.store.appendMessage({
        conversationId,
        senderType: 'ai',
        body: reply.text,
    });
}
