import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/server/rate-limit';
import {
    findConversation,
    getSupportCaller,
    needsGuestIdentity,
    rateLimitIdentity,
    requestHuman,
    setGuestIdentity,
    SupportValidationError,
    toPublicConversation,
} from '@/lib/server/support/conversations';
import { getSupportAvailability } from '@/lib/server/support/availability';
import { nextOpening } from '@/lib/server/support/hours';
import { appendMessage } from '@/lib/server/support/messages';
import { noticeMessage } from '@/lib/server/support/responder';

export const dynamic = 'force-dynamic';

/**
 * Ask for a person.
 *
 * Support Hours do not gate this. They decide what the customer is promised, not whether
 * the queue accepts the conversation — a question asked at 3am is queued at 3am and waits
 * for the morning, rather than being refused and lost. What is required at every hour is
 * a way to answer: a session, or a guest's name and email.
 */
export async function POST(req: NextRequest) {
    const caller = await getSupportCaller();

    const rl = await rateLimit(req, {
        limit: 10,
        windowMs: 60_000,
        prefix: 'support-escalate',
        userId: rateLimitIdentity(caller),
    });
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    let conversation = await findConversation(caller);
    if (!conversation) return NextResponse.json({ error: 'No conversation' }, { status: 404 });

    const { humanAvailable, hours } = await getSupportAvailability();
    const opening = nextOpening(hours, new Date());

    if (conversation.status === 'waiting_human' || conversation.status === 'human_active') {
        // Already queued or already being answered. Pressing twice should show the same
        // state, not an error.
        return NextResponse.json({
            conversation: toPublicConversation(conversation),
            humanAvailable,
            nextOpening: opening,
        });
    }

    let body: Record<string, unknown> = {};
    try {
        const raw = await req.text();
        if (raw.trim()) body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (needsGuestIdentity(conversation)) {
        if (body.name === undefined && body.email === undefined) {
            // Not a failure — the widget is expected to see this once and show the form.
            // `code` is what it branches on; `error` is for anything that only logs.
            return NextResponse.json(
                {
                    error: 'We need a name and email so someone can reply.',
                    code: 'identity_required',
                    humanAvailable,
                    hours,
                    nextOpening: opening,
                    conversation: toPublicConversation(conversation),
                },
                { status: 400 },
            );
        }

        try {
            const updated = await setGuestIdentity(conversation.id, body.name, body.email);
            if (!updated) {
                return NextResponse.json({ error: 'No conversation' }, { status: 404 });
            }
            conversation = updated;
        } catch (err) {
            if (err instanceof SupportValidationError) {
                return NextResponse.json(
                    { error: err.message, code: 'identity_required' },
                    { status: 400 },
                );
            }
            throw err;
        }
    }

    const updated = await requestHuman(conversation.id);
    if (!updated) {
        // Something else moved it between the read and the write.
        const current = await findConversation(caller);
        return NextResponse.json({
            conversation: current ? toPublicConversation(current) : null,
            humanAvailable,
            nextOpening: opening,
        });
    }

    // A row in the transcript, so the Agent who picks this up sees where the handover
    // happened rather than guessing which half of the conversation the model wrote — and
    // so the customer sees an acknowledgement rather than the panel going quiet. Written
    // to the customer, because they read it too.
    await appendMessage(
        noticeMessage(
            updated.id,
            humanAvailable ? 'asked_for_person' : 'asked_for_person_out_of_hours',
        ),
    );

    return NextResponse.json({
        conversation: toPublicConversation(updated),
        humanAvailable,
        nextOpening: opening,
    });
}
