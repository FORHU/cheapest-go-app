import { NextRequest, NextResponse } from 'next/server';
import { requireAgent } from '@/lib/server/support/admin-auth';
import { addNote, deleteNote, listNotes, MAX_NOTE_LENGTH } from '@/lib/server/support/notes';

export const dynamic = 'force-dynamic';

/**
 * Internal Notes on one Support Chat.
 *
 * Agent-only at every verb, and the only route that touches the notes table. The customer's
 * routes read `listMessages`, which cannot reach it — a Note is kept out of the transcript
 * rather than filtered out of it, so there is no flag here to get wrong.
 */

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params;
    return NextResponse.json({ notes: await listNotes(id) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as { body?: unknown } | null;
    const text = typeof body?.body === 'string' ? body.body.trim() : '';

    if (!text) {
        return NextResponse.json({ error: 'A note cannot be empty' }, { status: 400 });
    }
    if (text.length > MAX_NOTE_LENGTH) {
        return NextResponse.json(
            { error: `A note cannot exceed ${MAX_NOTE_LENGTH} characters` },
            { status: 400 },
        );
    }

    // The author is the signed-in Agent, never anything the client sent. A note nobody can
    // be asked about is worse than no note.
    const note = await addNote({ conversationId: id, authorAdminId: agent.id, body: text });
    return NextResponse.json({ note }, { status: 201 });
}

/**
 * Remove one of your own notes.
 *
 * Scoped to the author inside `deleteNote`, so an Agent cannot tidy away a colleague's
 * account of what they thought at the time. A note that was never yours reads as 404 rather
 * than 403: the distinction would tell you a note exists, which is the thing you are not
 * entitled to act on.
 */
export async function DELETE(req: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
    const agent = await requireAgent();
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const noteId = req.nextUrl.searchParams.get('noteId');
    if (!noteId) return NextResponse.json({ error: 'noteId is required' }, { status: 400 });

    const removed = await deleteNote(noteId, agent.id);
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
}
