import { NextResponse } from 'next/server';
import { requireAgent } from '@/lib/server/support/admin-auth';
import { getConversationForAgent } from '@/lib/server/support/inbox';

export const dynamic = 'force-dynamic';

/** One conversation: the transcript, who the customer is, and why it was handed over. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const detail = await getConversationForAgent(id);
    if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(detail);
}
