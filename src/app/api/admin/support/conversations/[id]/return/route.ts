import { NextResponse } from 'next/server';
import { requireAgent } from '@/lib/server/support/admin-auth';
import { returnToQueue, SupportPermissionError } from '@/lib/server/support/assignment';

export const dynamic = 'force-dynamic';

/**
 * Give your own chat back to Unassigned, for an admin to hand out again — at the end of a
 * shift, or when it needs someone else. Only back, never to a named colleague (ADR-0041).
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params;
    try {
        await returnToQueue({ conversationId: id, actor: agent });
    } catch (err) {
        if (err instanceof SupportPermissionError) {
            return NextResponse.json({ error: err.message }, { status: 403 });
        }
        throw err;
    }

    return NextResponse.json({ ok: true });
}
