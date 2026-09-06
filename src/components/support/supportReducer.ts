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
}

export const initialSupportState: SupportState = {
    conversation: null,
    confirmed: [],
    pending: [],
    isTyping: false,
    needsDetails: false,
    cursor: null,
};

export type SupportAction =
    | { type: 'opened'; conversation: SupportConversationView; messages: SupportMessageView[] }
    | { type: 'sent'; clientId: string; body: string; at: string }
    | { type: 'confirmed'; clientId: string; message: SupportMessageView }
    | { type: 'send_failed'; clientId: string }
    | { type: 'received'; message: SupportMessageView }
    | { type: 'details_required' }
    | { type: 'escalated'; conversation: SupportConversationView };

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
                isTyping: true,
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
            };
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
