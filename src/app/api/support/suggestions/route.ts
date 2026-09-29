import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { findConversation, getSupportCaller, rateLimitIdentity } from '@/lib/server/support/conversations';
import { recordSuggestionEvent } from '@/lib/server/support/suggestions';
import { isSuggestionId, isSuggestionOutcome } from '@/lib/support/suggestions';
import { routing } from '@/i18n/routing';

export const dynamic = 'force-dynamic';

/**
 * What the widget offered this customer, and what they did with it (ADR-0043).
 *
 * A counter, not a conversation: nothing here changes what anyone sees, and a failure is
 * answered with 204 like a success. A customer who cannot record that a card was shown must
 * still be able to ask their question, and a widget that surfaced "could not save" for a
 * counter would be telling them about our bookkeeping.
 */
export async function POST(req: NextRequest) {
    const caller = await getSupportCaller();

    // Generous: four outcomes per card, two cards, and a customer who types, deletes and types
    // again is not doing anything wrong. Low enough that the table cannot be filled by a script.
    const rl = await rateLimit(req, {
        limit: 60,
        windowMs: 60_000,
        prefix: 'support-suggestions',
        userId: rateLimitIdentity(caller),
    });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    let body: { articleId?: unknown; outcome?: unknown; locale?: unknown };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    if (!isSuggestionId(body.articleId) || !isSuggestionOutcome(body.outcome)) {
        return NextResponse.json({ error: 'Unknown suggestion' }, { status: 400 });
    }

    // The locale is read back in reports, so it is checked against the ones that exist rather
    // than stored as whatever arrived.
    const locale = typeof body.locale === 'string'
        && (routing.locales as readonly string[]).includes(body.locale)
        ? body.locale
        : 'en';

    const conversation = await findConversation(caller);

    try {
        await recordSuggestionEvent({
            conversationId: conversation?.id ?? null,
            articleId: body.articleId,
            locale,
            outcome: body.outcome,
        });
    } catch (err) {
        // Deliberately swallowed. See the note above the handler.
        console.error('[support/suggestions] could not record:', err);
    }

    return new NextResponse(null, { status: 204 });
}
