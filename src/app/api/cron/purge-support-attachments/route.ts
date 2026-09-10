/**
 * GET /api/cron/purge-support-attachments
 *
 * Removes the bytes of support attachments whose conversations were resolved more than
 * ATTACHMENT_RETENTION_DAYS ago. The rows stay, marked, so the transcript still shows that
 * a file was sent and has since expired.
 *
 * This is the retention rule ADR-0040 left open. It is a job rather than a bucket lifecycle
 * policy because the clock does not start when the object is written — it starts when the
 * conversation is resolved, which S3 cannot know, and which moves if the customer writes
 * again. A lifecycle rule keyed on object age would delete evidence from a conversation
 * still being argued about.
 *
 * Auth: Bearer <CRON_SECRET>
 * Optional query param:
 *   limit – attachments to purge per run (default 500, max 5000)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    ATTACHMENT_RETENTION_DAYS,
    purgeExpiredAttachments,
} from '@/lib/server/support/attachments';
import { attachmentsConfigured } from '@/lib/server/storage/s3';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Nothing to purge from a bucket that was never configured, and saying so is better
    // than reporting a successful run that did nothing.
    if (!attachmentsConfigured()) {
        return NextResponse.json(
            { ok: false, error: 'Attachment storage is not configured.' },
            { status: 503 },
        );
    }

    const requested = Number(new URL(req.url).searchParams.get('limit') ?? '500');
    const limit = Math.min(Number.isFinite(requested) && requested > 0 ? requested : 500, 5000);

    const t0 = Date.now();
    const result = await purgeExpiredAttachments(limit);
    const elapsedMs = Date.now() - t0;

    console.log(
        `[purge-support-attachments] ${result.deleted} deleted, ${result.failed} failed, ` +
        `of ${result.considered} due in ${elapsedMs}ms`,
    );

    return NextResponse.json({
        ok: true,
        retentionDays: ATTACHMENT_RETENTION_DAYS,
        ...result,
        // The sweep is capped, so a full working set means there is more to do and the next
        // run should follow sooner rather than at the next scheduled hour.
        more: result.considered === limit,
        elapsedMs,
    });
}
