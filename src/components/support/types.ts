/**
 * What the widget knows about a Support Chat.
 *
 * Declared here rather than imported from `lib/server/support` so a client bundle never
 * reaches for a module that opens database connections.
 */

export type SupportSenderView = 'guest' | 'ai' | 'agent' | 'system';

export type SupportStatusView = 'ai_active' | 'waiting_human' | 'human_active' | 'resolved';

export type SupportNoticeCodeView =
    | 'budget_spent'
    | 'model_declined'
    | 'asked_for_person'
    | 'asked_for_person_out_of_hours'
    | 'assistant_unavailable'
    | 'model_failed'
    | 'details_needed';

export interface SupportMessageView {
    id: string;
    senderType: SupportSenderView;
    body: string;
    /** Set on system rows. Rendered from locale files; `body` is the fallback. */
    noticeCode: SupportNoticeCodeView | null;
    createdAt: string;
}

export interface SupportConversationView {
    id: string;
    status: SupportStatusView;
    locale: string;
    guestName: string | null;
    createdAt: string;
    lastMessageAt: string;
    /** True when asking for a person will need a name and email first. */
    escalationNeedsDetails: boolean;
}
