import { NextRequest, NextResponse } from 'next/server';
import { requireAgent } from '@/lib/server/support/admin-auth';
import { assignConversation, SupportPermissionError } from '@/lib/server/support/assignment';
import { SupportValidationError } from '@/lib/server/support/conversations';

export const dynamic = 'force-dynamic';

/**
 * Give a chat to someone — admins only. This is the one way a chat becomes someone's
 * (ADR-0041): not a reply, not a button a Support Agent can press.
 *
 * Body: { toAdminId: string }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (agent.role !== 'admin') {
        return NextResponse.json({ error: 'Only an admin can assign a chat.' }, { status: 403 });
    }

    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as { toAdminId?: unknown } | null;
    if (typeof body?.toAdminId !== 'string' || !body.toAdminId) {
        return NextResponse.json({ error: 'toAdminId is required.' }, { status: 400 });
    }

    try {
        await assignConversation({ conversationId: id, toAdminId: body.toAdminId, actor: agent });
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
