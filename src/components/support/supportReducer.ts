import type { SupportConversationView, SupportMessageView } from './types';

/**
 * The widget's state, as a reducer.
 *
 * Kept apart from fetch and EventSource because the interesting behaviour is not either of
 * them: it is that the customer's own message comes back twice — once as the response to
 * the POST that sent it, once over the stream, which carries every row written to the
 * conversation and cannot know which of them this tab caused.
 */

/** A message shown before the server has confirmed it. */
interface PendingMessage {
    clientId: string;
    body: string;
    createdAt: string;
}

export interface SupportState {
    conversation: SupportConversationView | null;
    confirmed: SupportMessageView[];
    pending: PendingMessage[];
    isTyping: boolean;
    needsDetails: boolean;
    /** Newest confirmed message id — where a reconnecting stream resumes from. */
    cursor: string | null;
    /**
     * The assistant has said it cannot answer, and has not answered since.
     *
     * Drives a standing banner. The notice itself is written once, but the customer keeps
     * typing and needs to keep seeing why nothing is coming back.
     */
    assistantOffline: boolean;
    /**
     * Replies that landed while the panel was shut.
     *
     * Shown on the launcher bubble. Without it a customer who closes the panel and gets
     * an answer has no way of knowing except by reopening it.
     */
    unread: number;
    /** Whether the panel is being read right now, which is what makes a reply unread. */
    panelOpen: boolean;
}

export const initialSupportState: SupportState = {
    conversation: null,
    confirmed: [],
    pending: [],
    isTyping: false,
    needsDetails: false,
    cursor: null,
    assistantOffline: false,
    unread: 0,
    panelOpen: true,
};

export type SupportAction =
    | { type: 'opened'; conversation: SupportConversationView; messages: SupportMessageView[] }
    | { type: 'sent'; clientId: string; body: string; at: string }
    | { type: 'confirmed'; clientId: string; message: SupportMessageView }
    | { type: 'send_failed'; clientId: string }
    | { type: 'received'; message: SupportMessageView }
    | { type: 'details_required' }
    | { type: 'escalated'; conversation: SupportConversationView }
    | { type: 'closed' }
    | { type: 'opened_panel' };

/**
 * Whether a message means the assistant has finished with this turn.
 *
 * The customer's own echo does not: treating it as a reply would stop the indicator the
 * instant it started. A `system` notice does, because a handover writes one of those and
 * no answer at all — and that is exactly the conversation where an indicator left running
 * forever is most misleading.
 */
function endsTheWait(message: SupportMessageView): boolean {
    return message.senderType !== 'guest';
}

/**
 * The two notices that mean the assistant could not run at all.
 *
 * A hand-over notice is deliberately not among them: declining a refund question is the
 * assistant working, and a banner saying it is offline would contradict the message
 * immediately above it.
 */
const OUTAGE_NOTICES = new Set(['model_failed', 'assistant_unavailable']);

function readsAsOutage(message: SupportMessageView): boolean {
    return message.senderType === 'system'
        && message.noticeCode !== null
        && OUTAGE_NOTICES.has(message.noticeCode);
}

function withMessage(
    confirmed: SupportMessageView[],
    message: SupportMessageView,
): SupportMessageView[] {
    if (confirmed.some(existing => existing.id === message.id)) return confirmed;
    return [...confirmed, message];
}

function newestId(confirmed: SupportMessageView[]): string | null {
    if (confirmed.length === 0) return null;
    return [...confirmed].sort(byCreatedAt).at(-1)?.id ?? null;
}

function byCreatedAt(a: { createdAt: string }, b: { createdAt: string }): number {
    return a.createdAt.localeCompare(b.createdAt);
}

export function supportReducer(state: SupportState, action: SupportAction): SupportState {
    switch (action.type) {
        case 'opened': {
            return {
                ...state,
                conversation: action.conversation,
                confirmed: action.messages,
                cursor: newestId(action.messages),
                needsDetails: false,
            };
        }

        case 'sent': {
            return {
                ...state,
                pending: [
                    ...state.pending,
                    { clientId: action.clientId, body: action.body, createdAt: action.at },
                ],
                // Only while the assistant is the one expected to answer. The indicator
                // names it, and it does not run on a conversation an Agent owns — showing
                // it there means claiming someone is typing for however many minutes the
                // Agent takes. The panel header carries that state instead, accurately.
                isTyping: state.conversation?.status === 'ai_active',
            };
        }

        case 'confirmed': {
            const confirmed = withMessage(state.confirmed, action.message);
            return {
                ...state,
                confirmed,
                pending: state.pending.filter(p => p.clientId !== action.clientId),
                cursor: newestId(confirmed),
            };
        }

        case 'send_failed': {
            const pending = state.pending.filter(p => p.clientId !== action.clientId);
            return {
                ...state,
                pending,
                // Nothing is coming: the message never reached the server.
                isTyping: pending.length > 0 ? state.isTyping : false,
            };
        }

        case 'received': {
            const confirmed = withMessage(state.confirmed, action.message);

            // The stream beat the POST response to the customer's own message. Matching on
            // the text is imprecise, but the alternative is showing someone their own words
            // twice until the response lands.
            const pending =
                action.message.senderType === 'guest'
                    ? state.pending.filter(p => p.body !== action.message.body)
                    : state.pending;

            return {
                ...state,
                confirmed,
                pending,
                cursor: newestId(confirmed),
                isTyping: endsTheWait(action.message) ? false : state.isTyping,
                // An answer is proof it recovered; anything else leaves the banner alone.
                assistantOffline: readsAsOutage(action.message)
                    ? true
                    : action.message.senderType === 'ai'
                        ? false
                        : state.assistantOffline,
                // Only what arrived while nobody was reading, and only from the other
                // side — the customer's own message coming back is not news to them.
                unread: !state.panelOpen && action.message.senderType !== 'guest'
                    ? state.unread + 1
                    : state.unread,
            };
        }

        case 'closed': {
            return { ...state, panelOpen: false };
        }

        case 'opened_panel': {
            // Opening it is reading it.
            return { ...state, panelOpen: true, unread: 0 };
        }

        case 'details_required': {
            return { ...state, needsDetails: true, isTyping: false };
        }

        case 'escalated': {
            return {
                ...state,
                conversation: action.conversation,
                needsDetails: false,
                isTyping: false,
            };
        }

        default:
            return state;
    }
}

/**
 * What the transcript renders: confirmed rows and anything still in flight, in the order
 * they were created rather than the order they arrived.
 */
export function visibleMessages(state: SupportState): SupportMessageView[] {
    const optimistic: SupportMessageView[] = state.pending.map(p => ({
        id: `pending-${p.clientId}`,
        senderType: 'guest',
        body: p.body,
        noticeCode: null,
        createdAt: p.createdAt,
    }));

    return [...state.confirmed, ...optimistic].sort(byCreatedAt);
}
