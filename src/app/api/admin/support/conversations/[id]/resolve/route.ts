import { NextResponse } from 'next/server';
import { requireAgent } from '@/lib/server/support/admin-auth';
import { resolveConversation, SupportPermissionError } from '@/lib/server/support/assignment';
import { SupportValidationError } from '@/lib/server/support/conversations';

export const dynamic = 'force-dynamic';

/**
 * Mark a conversation finished — your own, or any if you are an admin — and record who
 * handled it: whoever it is assigned to at this moment (CONTEXT.md, "Handled").
 *
 * Not an ending — a customer who writes again reopens it, with the same transcript, and it
 * returns to Unassigned for an admin to hand out.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    try {
        await resolveConversation({ conversationId: id, actor: agent });
    } catch (err) {
        if (err instanceof SupportPermissionError) {
            return NextResponse.json({ error: err.message }, { status: 403 });
        }
        if (err instanceof SupportValidationError) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        throw err;
    }

    return NextResponse.json({ ok: true });
}
