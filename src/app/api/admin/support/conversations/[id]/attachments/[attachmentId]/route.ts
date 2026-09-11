import { NextRequest, NextResponse } from 'next/server';
import { requireAgent } from '@/lib/server/support/admin-auth';
import { findAttachment } from '@/lib/server/support/attachments';
import { presignDownloadUrl } from '@/lib/server/storage/s3';

export const dynamic = 'force-dynamic';

/**
 * An Agent opening a file on a conversation they are working.
 *
 * Agent-gated rather than owner-gated: an Agent who is not the assignee still legitimately
 * reads a conversation - to pick it up, to cover a colleague, to answer a question about
 * it - and the transcript is already readable to them. A download that were narrower than
 * the transcript would only mean the evidence is missing from a record they can otherwise
 * read in full.
 *
 * The conversation id in the path is checked against the attachment rather than trusted, so
 * a guessed id under a conversation the Agent happened to open cannot fetch a file from
 * another chat.
 */
export async function GET(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string; attachmentId: string }> },
) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, attachmentId } = await ctx.params;
    const attachment = await findAttachment(attachmentId);
    if (!attachment || attachment.conversationId !== id) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Expired under the retention rule. An Agent needs the distinction more than the
    // customer does: "the customer never sent it" and "we deleted it 90 days after this was
    // resolved" are different answers to give someone asking about a refund.
    if (attachment.bytesDeletedAt) {
        return NextResponse.json(
            { error: 'That file is no longer stored.', expired: true },
            { status: 410 },
        );
    }

    try {
        const url = await presignDownloadUrl({
            key: attachment.storageKey,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
        });
        return NextResponse.redirect(url, 302);
    } catch (err) {
        console.error('[admin/support] attachment download failed:', err);
        return NextResponse.json({ error: 'Could not fetch that file.' }, { status: 500 });
    }
}
