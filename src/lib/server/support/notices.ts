import type { SupportSender } from './messages';

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
    | 'details_needed'
    | 'assistant_retired';

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
    assistant_retired:
        'Support has moved to our team and is no longer answered automatically. Sign in and write again and someone will pick it up.',
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
