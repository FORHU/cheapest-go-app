import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import {
    findConversation,
    getSupportCaller,
    rateLimitIdentity,
    SupportValidationError,
} from '@/lib/server/support/conversations';
import { appendMessage, listMessages } from '@/lib/server/support/messages';
import { reopenIfResolved } from '@/lib/server/support/inbox';
import { liveNotifyDeps, notifyWaitingCustomer } from '@/lib/server/support/notify';

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

        // Resolved is not an ending: writing again reopens the conversation into the
        // Agent queue, wherever the panel happens to be. Per ADR-0031 there is nobody to
        // hand it to first — reopening onto `waiting_human` is the whole of it. Without
        // this a message typed into an already-open panel lands nowhere: it is stored,
        // but the conversation stays resolved and no queue shows it.
        if (conversation.status === 'resolved') {
            await reopenIfResolved(conversation.id);
        }

        // The doorbell. Per ADR-0031 there is nobody but an Agent to answer this, and
        // nothing else on the site would say so: creation is too early, because the widget
        // opens a conversation the moment the panel does, so this — a customer's message
        // into a Waiting conversation nobody owns — is the first moment there is anything
        // to tell the team. It rings once per waiting spell, decided by a conditional
        // UPDATE inside `notifyWaitingCustomer`, so a question typed in three parts is one
        // email and a customer returning months later is a new one.
        //
        // After the reopen above, never before: the reopen is what clears the mark the
        // previous spell left, and ringing first would be claiming a spell that is about
        // to be reset — the ring would be lost and the returning customer would queue in
        // silence.
        //
        // Started, not awaited, exactly as the escalate route does it: the message is
        // already stored and the customer is owed their 201 now, not after a mail
        // provider has had its turn. It swallows its own failures for the same reason.
        void notifyWaitingCustomer(conversation.id, liveNotifyDeps());

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
