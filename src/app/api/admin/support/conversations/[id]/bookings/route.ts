import { NextRequest, NextResponse } from 'next/server';
import { requireAgent, refuseUnlessCanWrite } from '@/lib/server/support/admin-auth';
import {
    linkBooking,
    unlinkBooking,
    listLinkedBookings,
} from '@/lib/server/support/linked-bookings';

export const dynamic = 'force-dynamic';

/**
 * The trips one Support Chat is about.
 *
 * An Agent linking is not required to prove the booking belongs to the customer, and that
 * is deliberate: an Agent legitimately investigates a trip the customer is asking about but
 * did not buy — a companion's flight, a booking a colleague made — and enforcing ownership
 * here would break the field in the cases that need it most. The customer's own linking
 * path is the one that checks, because there the claim is unverified.
 */

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params;
    return NextResponse.json({ bookings: await listLinkedBookings(id) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params;
    // Linking trips is working the chat — only in your own, unless you are an admin.
    const refused = await refuseUnlessCanWrite(agent, id);
    if (refused) return refused;

    const body = (await req.json().catch(() => null)) as { bookingReference?: unknown } | null;
    const reference =
        typeof body?.bookingReference === 'string' ? body.bookingReference.trim() : '';

    if (!reference) {
        return NextResponse.json({ error: 'A booking reference is required' }, { status: 400 });
    }

    try {
        await linkBooking({ conversationId: id, bookingReference: reference, linkedBy: agent.id });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Could not link that booking' },
            { status: 400 },
        );
    }

    return NextResponse.json({ bookings: await listLinkedBookings(id) }, { status: 201 });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params;
    const refused = await refuseUnlessCanWrite(agent, id);
    if (refused) return refused;

    const reference = req.nextUrl.searchParams.get('bookingReference');
    if (!reference) {
        return NextResponse.json({ error: 'bookingReference is required' }, { status: 400 });
    }

    await unlinkBooking(id, reference);
    return NextResponse.json({ bookings: await listLinkedBookings(id) });
}
