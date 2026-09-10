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
    | 'details_needed'
    | 'assistant_retired';

/**
 * A file on a message, as the widget sees it.
 *
 * No URL. The bytes are behind a route that checks who is asking and hands back a link
 * good for a few minutes, so what the client holds is an id it can ask with - not a
 * pointer it could keep, share, or find still working next week.
 */
export interface SupportAttachmentView {
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    uploadedByType: 'guest' | 'agent';
    /**
     * True once the bytes have expired under the retention rule, while the row remains.
     *
     * The name and size are still shown; only the file is gone. Without this the transcript
     * would misrepresent itself — a message that plainly refers to a document, with nothing
     * on it, and no way to tell "never sent" from "sent and since expired".
     */
    bytesDeleted: boolean;
}

export interface SupportMessageView {
    id: string;
    senderType: SupportSenderView;
    body: string;
    /** Set on system rows. Rendered from locale files; `body` is the fallback. */
    noticeCode: SupportNoticeCodeView | null;
    createdAt: string;
    /** Files sent with this message. Empty on almost every row. */
    attachments: SupportAttachmentView[];
}

export interface SupportConversationView {
    id: string;
    status: SupportStatusView;
    locale: string;
    guestName: string | null;
    /**
     * The Chat Reference, e.g. CS-9QM2K7.
     *
     * Shown so the customer can name this conversation elsewhere. It is not a credential —
     * quoting it proves nothing and opens nothing, and the chat is reached by signing in
     * (ADR-0038).
     */
    reference: string;
    createdAt: string;
    lastMessageAt: string;
    /** True when asking for a person will need a name and email first. */
    escalationNeedsDetails: boolean;
    /** False where no attachment bucket is configured; the composer hides the paperclip. */
    attachmentsEnabled: boolean;
}
