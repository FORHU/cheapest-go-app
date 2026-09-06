/**
 * What the inbox screen knows about a Support Chat.
 *
 * Declared here rather than imported from `lib/server/support/inbox` so the client bundle
 * never reaches for a module that opens database connections.
 */

export type InboxFilterView = 'waiting' | 'mine' | 'assistant' | 'resolved';

export interface InboxConversation {
    id: string;
    status: string;
    sourceBrand: string | null;
    locale: string;
    guestName: string | null;
    guestEmail: string | null;
    userId: string | null;
    assignedAdminId: string | null;
    /**
     * The model's own account of why it gave up. Agent-only — it is a private note about
     * the customer, and it is never sent to the widget.
     */
    escalationReason: string | null;
    lastMessageAt: string;
    createdAt: string;
}

export interface InboxMessage {
    id: string;
    senderType: 'guest' | 'ai' | 'agent' | 'system';
    body: string;
    noticeCode: string | null;
    createdAt: string;
}

export interface InboxCountsView {
    waiting: number;
    mine: number;
}

export interface ConversationDetail {
    conversation: InboxConversation;
    messages: InboxMessage[];
    bookings: unknown[] | null;
}
