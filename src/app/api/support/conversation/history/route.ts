import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import {
    getSupportCaller,
    listPastConversations,
    rateLimitIdentity,
} from '@/lib/server/support/conversations';

export const dynamic = 'force-dynamic';

/**
 * The caller's finished Support Chats, newest first — what the widget offers as "Previous
 * conversation". A resolved chat is never reopened (CONTEXT.md, "Support Chat"), so this is
 * how a customer reads back an earlier answer without it mixing into the new topic.
 */
export async function GET(req: NextRequest) {
    const caller = await getSupportCaller();

    const rl = await rateLimit(req, {
        limit: 60,
        windowMs: 60_000,
        prefix: 'support-history-list',
        userId: rateLimitIdentity(caller),
    });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    return NextResponse.json({ conversations: await listPastConversations(caller) });
}
