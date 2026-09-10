import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import {
    findConversation,
    getSupportCaller,
    rateLimitIdentity,
} from '@/lib/server/support/conversations';
import { deleteUnboundAttachment, findAttachment } from '@/lib/server/support/attachments';
import { presignDownloadUrl } from '@/lib/server/storage/s3';

export const dynamic = 'force-dynamic';

/**
 * Fetch one of the customer's own attachments.
 *
 * The redirect target is a signed URL that lives for five minutes, minted per request. The
 * authorisation is here, not in the URL: the bucket is private, so a link that escapes
 * grants only what is left of those five minutes, and a customer coming back to an old
 * transcript gets a fresh one rather than a dead link.
 *
 * An attachment on somebody else's conversation reads as 404, not 403. Telling the caller
 * an id exists is telling them something about a conversation they have no part in.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const caller = await getSupportCaller();

    const rl = await rateLimit(req, {
        limit: 60,
        windowMs: 60_000,
        prefix: 'support-attachments-get',
        userId: rateLimitIdentity(caller),
    });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const conversation = await findConversation(caller);
    if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { id } = await ctx.params;
    const attachment = await findAttachment(id);
    if (!attachment || attachment.conversationId !== conversation.id) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Expired under the retention rule. 410 rather than 404 because the difference is real
    // and worth telling the customer: this file existed, they sent it, and it is not coming
    // back — which is a different conversation from "no such file".
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
        // 302 rather than 301: the target expires, and a permanently cached redirect to a
        // URL that stops working is a link that breaks and cannot be repaired by reloading.
        return NextResponse.redirect(url, 302);
    } catch (err) {
        console.error('[support/attachments] download failed:', err);
        return NextResponse.json({ error: 'Could not fetch that file.' }, { status: 500 });
    }
}

/**
 * Remove a file the customer picked and then thought better of.
 *
 * Only while it is unsent - `deleteUnboundAttachment` enforces that, not this route. Once
 * a file is on a message it is part of the record, and a composer control is not the place
 * to be able to edit one.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const caller = await getSupportCaller();

    const rl = await rateLimit(req, {
        limit: 60,
        windowMs: 60_000,
        prefix: 'support-attachments-delete',
        userId: rateLimitIdentity(caller),
    });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    // A write, so it needs an account (ADR-0032) — the same rule as the upload it undoes.
    // Reading an attachment above stays open to a legacy guest, deliberately, for the same
    // reason the transcript does: they may still look at what is theirs, not change it.
    if (!caller.userId) {
        return NextResponse.json(
            { error: 'Sign in to manage files.', authRequired: true },
            { status: 401 },
        );
    }

    const conversation = await findConversation(caller);
    if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { id } = await ctx.params;
    const removed = await deleteUnboundAttachment(conversation.id, id);
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ ok: true });
}
