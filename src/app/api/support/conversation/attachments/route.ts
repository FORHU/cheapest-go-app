import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import {
    findConversation,
    getSupportCaller,
    rateLimitIdentity,
    SupportValidationError,
} from '@/lib/server/support/conversations';
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
 * Take one file from the customer, before the message that will carry it exists.
 *
 * Uploading and sending are separate because they are separate in the customer's head: a
 * file is picked, it appears in the composer, and only then is a message sent. Doing both
 * in the send would mean the customer waits for the upload with nothing on screen to say
 * why, and could not remove a file they picked by mistake.
 *
 * Takes no conversation id, like every other guest route: the caller's credential resolves
 * to their conversation and there is no id to trust (ADR-0027).
 */
export async function POST(req: NextRequest) {
    if (!attachmentsConfigured()) {
        return NextResponse.json({ error: 'Attachments are not available.' }, { status: 503 });
    }

    const caller = await getSupportCaller();

    // Tighter than the message limit. An upload costs a round trip, a multipart parse and
    // an object in a bucket, so the ceiling is on what it costs rather than on what a
    // person could plausibly type.
    const rl = await rateLimit(req, {
        limit: 20,
        windowMs: 60_000,
        prefix: 'support-attachments-post',
        userId: rateLimitIdentity(caller),
    });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    // Uploading is a write, and writes require an account (ADR-0032).
    //
    // Without this, a holder of a legacy `cg-support` cookie could still put objects in the
    // bucket: `findConversation` resolves a guest token to the conversation they had before
    // the account rule, and every other write path refuses them but this one did not. That
    // is worse than an ordinary gap, because what lands in the bucket is the class of file
    // this feature exists for — identity documents — attached to a conversation nobody can
    // answer, and subject to a retention rule that does not exist yet (ADR-0040).
    if (!caller.userId) {
        return NextResponse.json(
            { error: 'Sign in to send a file to support.', authRequired: true },
            { status: 401 },
        );
    }

    const conversation = await findConversation(caller);
    if (!conversation) return NextResponse.json({ error: 'No conversation' }, { status: 404 });

    // Refused on the declared length before the body is read, so an oversized upload is
    // rejected at the first opportunity instead of after it has been buffered. The real
    // check is on the bytes below; a Content-Length can lie, and a lie in this direction
    // only costs the liar their own upload.
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

    // Counted before storing, so the ceiling is on files held rather than on files sent.
    // Without this a client could upload without ever sending and pay nothing for it.
    if ((await countUnboundAttachments(conversation.id)) >= MAX_ATTACHMENTS_PER_MESSAGE) {
        return NextResponse.json(
            { error: `A message can carry at most ${MAX_ATTACHMENTS_PER_MESSAGE} files.` },
            { status: 400 },
        );
    }

    try {
        const attachment = await storeAttachment({
            conversationId: conversation.id,
            fileName: file.name,
            bytes: Buffer.from(await file.arrayBuffer()),
            // Always 'guest' here, as senderType is on the message route: a caller that
            // could name its own uploader could file evidence as a member of staff.
            uploadedByType: 'guest',
        });

        return NextResponse.json({ attachment: toAttachmentView(attachment) }, { status: 201 });
    } catch (err) {
        if (err instanceof SupportValidationError) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        console.error('[support/attachments] upload failed:', err);
        return NextResponse.json({ error: 'Could not upload that file.' }, { status: 500 });
    }
}
