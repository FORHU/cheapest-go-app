import { NextRequest, NextResponse } from 'next/server';
import { requireAgent } from '@/lib/server/support/admin-auth';
import { SupportValidationError } from '@/lib/server/support/conversations';
import {
    countUnboundAttachments,
    MAX_ATTACHMENT_BYTES,
    MAX_ATTACHMENTS_PER_MESSAGE,
    storeAttachment,
    toAttachmentView,
} from '@/lib/server/support/attachments';
import { attachmentsConfigured } from '@/lib/server/storage/s3';

export const dynamic = 'force-dynamic';

/**
 * An Agent uploading a file to a conversation.
 *
 * Agents send documents too - a reissued ticket, a voucher, a supplier's written refusal -
 * and a reply that says "see the attached" with nothing attached is worse than no reply.
 *
 * Same validation as the customer's route, because the risk it manages is not about who is
 * uploading: an Agent forwarding a file a customer emailed them is passing along something
 * neither of them wrote.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!attachmentsConfigured()) {
        return NextResponse.json({ error: 'Attachments are not available.' }, { status: 503 });
    }

    const { id } = await ctx.params;

    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > MAX_ATTACHMENT_BYTES * 1.1) {
        return NextResponse.json({ error: 'That file is too large.' }, { status: 413 });
    }

    let form: FormData;
    try {
        form = await req.formData();
    } catch {
        return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
        return NextResponse.json({ error: 'A file is required.' }, { status: 400 });
    }

    if ((await countUnboundAttachments(id)) >= MAX_ATTACHMENTS_PER_MESSAGE) {
        return NextResponse.json(
            { error: `A message can carry at most ${MAX_ATTACHMENTS_PER_MESSAGE} files.` },
            { status: 400 },
        );
    }

    try {
        const attachment = await storeAttachment({
            conversationId: id,
            fileName: file.name,
            bytes: Buffer.from(await file.arrayBuffer()),
            uploadedByType: 'agent',
            // The signed-in Agent, never anything the client sent - the same rule the notes
            // route follows, for the same reason.
            uploadedByAdminId: agent.id,
        });

        return NextResponse.json({ attachment: toAttachmentView(attachment) }, { status: 201 });
    } catch (err) {
        if (err instanceof SupportValidationError) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        console.error('[admin/support] attachment upload failed:', err);
        return NextResponse.json({ error: 'Could not upload that file.' }, { status: 500 });
    }
}
