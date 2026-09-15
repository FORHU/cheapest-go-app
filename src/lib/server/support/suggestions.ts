import { getSqlAdmin } from '@/lib/db/postgres';
import type { SuggestionId, SuggestionOutcome } from '@/lib/support/suggestions';

/**
 * What the widget offered, and what the customer did with it (ADR-0043).
 *
 * Writes here are opinions about a card, not about a conversation, and nothing downstream waits
 * on them: a customer must never be held up, or told anything went wrong, because a counter
 * could not be written.
 */

export interface SuggestionEventInput {
    conversationId: string | null;
    articleId: SuggestionId;
    locale: string;
    outcome: SuggestionOutcome;
}

export async function recordSuggestionEvent(input: SuggestionEventInput): Promise<void> {
    const sql = getSqlAdmin();
    await sql`
        INSERT INTO support_suggestion_events (conversation_id, article_id, locale, outcome)
        VALUES (${input.conversationId}, ${input.articleId}, ${input.locale}, ${input.outcome})
    `;
}

/**
 * The articles this customer was shown before they wrote, newest first.
 *
 * The Agent opening the chat reads this as "they have already been given these answers and wrote
 * anyway" — which is both a shortcut past repeating one, and the signal that an article is
 * matching questions it cannot answer.
 */
export async function suggestionsShownFor(conversationId: string): Promise<string[]> {
    const sql = getSqlAdmin();
    const rows = await sql<{ articleId: string }[]>`
        SELECT DISTINCT article_id AS "articleId"
          FROM support_suggestion_events
         WHERE conversation_id = ${conversationId}
           AND outcome IN ('shown', 'opened')
         LIMIT 10
    `;
    return rows.map(row => row.articleId);
}
