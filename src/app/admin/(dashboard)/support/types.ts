/**
 * What the inbox screen knows about a Support Chat.
 *
 * Declared here rather than imported from `lib/server/support/inbox` so the client bundle
 * never reaches for a module that opens database connections.
 */

import type { SupportAttachmentView } from '@/components/support/types';

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
    /** The Chat Reference, e.g. CS-9QM2K7 (ADR-0038). Names the conversation; opens nothing. */
    reference: string;
    /** An Agent overruling Urgency. null means the trip dates decide (ADR-0039). */
    priority: UrgencyView | null;
    /** What the queue sorted by: the override, or the tier read from the linked trips. */
    urgency: UrgencyView;
    lastMessageAt: string;
    createdAt: string;
}

/** Ordered least to most urgent, mirroring URGENCY_RANK on the server. */
export type UrgencyView = 'low' | 'normal' | 'high' | 'critical';

export interface LinkedBookingView {
    bookingReference: string;
    /** The Agent who attached it; null when the customer chose it themselves. */
    linkedBy: string | null;
    linkedAt: string;
    /**
     * False when no booking here matches the reference — a typo, or a supplier booking that
     * never reached this database. Either way it carries no dates, so it contributes nothing
     * to Urgency and is marked rather than left looking attached.
     */
    known: boolean;
}

export interface SupportNoteView {
    id: string;
    conversationId: string;
    authorAdminId: string;
    body: string;
    createdAt: string;
}

export interface InboxMessage {
    id: string;
    senderType: 'guest' | 'ai' | 'agent' | 'system';
    body: string;
    noticeCode: string | null;
    createdAt: string;
    /**
     * A machine translation stored beside the author's words (ADR-0033). On a customer's
     * message it is the English the Agent reads first; the customer's own words stay one
     * click away and remain authoritative.
     */
    translatedBody?: string | null;
    translatedLang?: string | null;
    translationStatus?: 'pending' | 'translated' | 'untranslated' | null;
    /**
     * Files on this message. Never a URL - the bytes are behind a route that re-checks the
     * Agent on every fetch and mints a short-lived link (ADR-0040).
     */
    attachments: SupportAttachmentView[];
}

export interface InboxCountsView {
    waiting: number;
    mine: number;
}

export interface ConversationDetail {
    conversation: InboxConversation;
    messages: InboxMessage[];
    bookings: unknown[] | null;
    linkedBookings: LinkedBookingView[];
    /** Agent-only. Never reaches the widget — see the notes table's own comment. */
    notes: SupportNoteView[];
}
