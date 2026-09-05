import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import {
    findConversation,
    getSupportCaller,
    rateLimitIdentity,
    SupportValidationError,
} from '@/lib/server/support/conversations';
import { appendMessage, listMessages } from '@/lib/server/support/messages';

export const dynamic = 'force-dynamic';

/**
 * The conversation's messages, or those after `?since=<messageId>`.
 *
 * The widget uses this twice: once to render history when it opens, and again after an
 * SSE reconnect to collect whatever arrived while the stream was down. Without the second
 * use a dropped connection loses messages silently.
 */
export async function GET(req: NextRequest) {
    const caller = await getSupportCaller();

    const rl = await rateLimit(req, {
        limit: 120,
        windowMs: 60_000,
        prefix: 'support-messages-get',
        userId: rateLimitIdentity(caller),
    });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const conversation = await findConversation(caller);
    if (!conversation) return NextResponse.json({ error: 'No conversation' }, { status: 404 });

    const since = req.nextUrl.searchParams.get('since');
    if (since !== null && !isUuid(since)) {
        return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
    }

    const messages = await listMessages(conversation.id, since);
    return NextResponse.json({ messages });
}

/** Send a message as the customer. */
export async function POST(req: NextRequest) {
    const caller = await getSupportCaller();

    const rl = await rateLimit(req, {
        limit: 30,
        windowMs: 60_000,
        prefix: 'support-messages-post',
        userId: rateLimitIdentity(caller),
    });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const conversation = await findConversation(caller);
    if (!conversation) return NextResponse.json({ error: 'No conversation' }, { status: 404 });

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (typeof body.body !== 'string') {
        return NextResponse.json({ error: 'A message body is required.' }, { status: 400 });
    }

    try {
        // Always 'guest': this route is the customer side, and letting a caller choose
        // its own sender_type would let anyone post a message attributed to an agent.
        const message = await appendMessage({
            conversationId: conversation.id,
            senderType: 'guest',
            body: body.body,
        });
        return NextResponse.json({ message }, { status: 201 });
    } catch (err) {
        if (err instanceof SupportValidationError) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        console.error('[support/messages] append failed:', err);
        return NextResponse.json({ error: 'Could not send the message.' }, { status: 500 });
    }
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
