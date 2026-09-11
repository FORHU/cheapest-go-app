import { NextResponse } from 'next/server';
import { requireAgent } from '@/lib/server/support/admin-auth';
import { agentReply } from '@/lib/server/support/inbox';
import { SupportValidationError } from '@/lib/server/support/conversations';
import { SupportPermissionError } from '@/lib/server/support/assignment';

export const dynamic = 'force-dynamic';

/**
 * Reply as an Agent — in a chat assigned to you, or any chat if you are an admin. Replying
 * never assigns (ADR-0041).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (typeof body.body !== 'string') {
        return NextResponse.json({ error: 'A message body is required.' }, { status: 400 });
    }

    const attachmentIds = Array.isArray(body.attachmentIds)
        ? body.attachmentIds.filter((value): value is string => typeof value === 'string' && isUuid(value))
        : [];

    try {
        // senderType is fixed here, as it is on the customer route: letting a caller name
        // its own sender is how a message ends up attributed to the wrong side.
        const message = await agentReply({
            conversationId: id,
            actor: agent,
            body: body.body,
            attachmentIds,
        });
        return NextResponse.json({ message }, { status: 201 });
    } catch (err) {
        if (err instanceof SupportPermissionError) {
            return NextResponse.json({ error: err.message }, { status: 403 });
        }
        if (err instanceof SupportValidationError) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        console.error('[admin/support] reply failed:', err);
        return NextResponse.json({ error: 'Could not send the reply.' }, { status: 500 });
    }
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
