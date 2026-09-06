import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { rateLimit } from '@/lib/server/rate-limit';
import {
    findConversation,
    getSupportCaller,
    openConversation,
    rateLimitIdentity,
    SupportValidationError,
    toPublicConversation,
} from '@/lib/server/support/conversations';
import { listMessages } from '@/lib/server/support/messages';
import { SUPPORT_COOKIE, supportCookieOptions } from '@/lib/server/support/tokens';

export const dynamic = 'force-dynamic';

/**
 * The caller's own conversation. There is no id in the path: the conversation is whatever
 * the session or the `cg-support` cookie resolves to (ADR-0027).
 */
export async function GET(req: NextRequest) {
    const caller = await getSupportCaller();

    const rl = await rateLimit(req, {
        limit: 60,
        windowMs: 60_000,
        prefix: 'support-conversation-get',
        userId: rateLimitIdentity(caller),
    });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const conversation = await findConversation(caller);
    if (!conversation) return NextResponse.json({ conversation: null, messages: [] });

    const messages = await listMessages(conversation.id);
    return NextResponse.json({ conversation: toPublicConversation(conversation), messages });
}

/**
 * Open a conversation, or resume the one this caller already has.
 *
 * This is the one route an entirely unidentified request can reach, so it is also the only
 * abuse surface on the guest side. Identity is read before the limiter runs, per ADR-0028:
 * a signed-in user is keyed on their user id and a returning guest on their token, so the
 * narrow anonymous limit applies only to genuine first contact.
 */
export async function POST(req: NextRequest) {
    const caller = await getSupportCaller();

    const rl = await rateLimit(req, {
        limit: 5,
        windowMs: 60_000,
        prefix: 'support-conversation-open',
        userId: rateLimitIdentity(caller),
    });
    if (!rl.success) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    let body: Record<string, unknown> = {};
    try {
        const raw = await req.text();
        if (raw.trim()) body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Nobody is asked for anything here. A guest gets a token and can start typing; the
    // name and email are collected at Escalation, which is the only moment they matter.
    let result;
    try {
        result = await openConversation({ caller, locale: body.locale });
    } catch (err) {
        if (err instanceof SupportValidationError) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        console.error('[support/conversation] open failed:', err);
        return NextResponse.json({ error: 'Could not start a conversation.' }, { status: 500 });
    }

    if (result.issuedGuestToken) {
        const cookieStore = await cookies();
        cookieStore.set(SUPPORT_COOKIE, result.issuedGuestToken, supportCookieOptions());
    }

    const messages = await listMessages(result.conversation.id);
    return NextResponse.json({
        conversation: toPublicConversation(result.conversation),
        messages,
        created: result.created,
    });
}

