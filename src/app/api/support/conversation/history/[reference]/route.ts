import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import {
    findPastConversation,
    getSupportCaller,
    rateLimitIdentity,
    toPublicConversation,
} from '@/lib/server/support/conversations';
import { listMessages } from '@/lib/server/support/messages';

export const dynamic = 'force-dynamic';

/**
 * One of the caller's own finished chats, read-only.
 *
 * Named by its Chat Reference, which grants nothing (ADR-0038): the read is allowed because
 * the chat belongs to the signed-in caller, and anything else — someone else's reference, an
 * open chat — is a 404 indistinguishable from a reference that does not exist.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ reference: string }> }) {
    const caller = await getSupportCaller();

    const rl = await rateLimit(req, {
        limit: 60,
        windowMs: 60_000,
        prefix: 'support-history-read',
        userId: rateLimitIdentity(caller),
    });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { reference } = await ctx.params;
    const conversation = await findPastConversation(caller, reference);
    if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({
        conversation: toPublicConversation(conversation),
        messages: await listMessages(conversation.id),
    });
}
