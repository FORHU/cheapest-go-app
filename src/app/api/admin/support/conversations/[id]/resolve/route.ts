import { NextResponse } from 'next/server';
import { requireAgent } from '@/lib/server/support/admin-auth';
import { resolveConversation } from '@/lib/server/support/inbox';

export const dynamic = 'force-dynamic';

/**
 * Mark a conversation finished.
 *
 * Not an ending — a customer who writes again reopens it, with the same transcript, and
 * the assistant gets first look at the new message.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await resolveConversation(id, agent.id);

    return NextResponse.json({ ok: true });
}
