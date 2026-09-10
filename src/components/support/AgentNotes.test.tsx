import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentNotes } from './AgentNotes';
import type { SupportNoteView } from '@/app/admin/(dashboard)/support/types';

/**
 * An Internal Note is safe from the customer by construction — it lives in a table their
 * routes never query — so what is left to get wrong is human. These pin the two things that
 * stop an Agent saying to a customer what they meant to say about them, and the one thing
 * that stops a conversation's history being tidied by whoever is looking at it.
 */

const note = (over: Partial<SupportNoteView> = {}): SupportNoteView => ({
    id: 'note-1',
    conversationId: 'conv-1',
    authorAdminId: 'admin-1',
    body: 'Called the supplier, waiting on a reference.',
    createdAt: '2026-09-09T10:00:00.000Z',
    ...over,
});

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});
afterEach(() => vi.unstubAllGlobals());

describe('AgentNotes', () => {
    it('says out loud that the customer never sees these', () => {
        render(
            <AgentNotes conversationId="conv-1" notes={[note()]} currentAdminId="admin-1" onChanged={() => {}} />,
        );
        expect(screen.getByText(/the customer never sees these/i)).toBeInTheDocument();
    });

    it('names the box so it cannot be mistaken for the reply box', () => {
        // The panel holds two text boxes and only one reaches the customer. Visually the
        // amber ground says which; to a screen reader both are "textbox" unless named.
        render(
            <AgentNotes conversationId="conv-1" notes={[]} currentAdminId="admin-1" onChanged={() => {}} />,
        );
        const box = screen.getByRole('textbox', { name: /not sent to the customer/i });
        expect(box).toBeInTheDocument();
    });

    it('offers to delete your own note but not a colleague’s', () => {
        // A Note is one person's account of what they thought at the time. A conversation
        // whose annotations anyone can tidy is one nobody can rely on when it is questioned.
        const { rerender } = render(
            <AgentNotes
                conversationId="conv-1"
                notes={[note({ authorAdminId: 'admin-1' })]}
                currentAdminId="admin-1"
                onChanged={() => {}}
            />,
        );
        expect(screen.getByRole('button', { name: /delete this note/i })).toBeInTheDocument();

        rerender(
            <AgentNotes
                conversationId="conv-1"
                notes={[note({ authorAdminId: 'someone-else' })]}
                currentAdminId="admin-1"
                onChanged={() => {}}
            />,
        );
        expect(screen.queryByRole('button', { name: /delete this note/i })).not.toBeInTheDocument();
    });

    it('renders with no notes at all rather than throwing', () => {
        // The field can be absent — an older server mid-deploy, a shape that changed. This
        // panel sits inside the Agent's conversation view, so throwing here would blank the
        // transcript they were reading.
        render(
            // @ts-expect-error — exercising the missing-field case a rolling deploy produces.
            <AgentNotes conversationId="conv-1" notes={undefined} currentAdminId="admin-1" onChanged={() => {}} />,
        );
        expect(screen.getByText(/internal notes/i)).toBeInTheDocument();
    });

    it('posts the note and asks the caller to reload', async () => {
        const onChanged = vi.fn();
        render(
            <AgentNotes conversationId="conv-1" notes={[]} currentAdminId="admin-1" onChanged={onChanged} />,
        );

        fireEvent.change(screen.getByRole('textbox', { name: /not sent to the customer/i }), {
            target: { value: 'Supplier says refund is queued.' },
        });
        fireEvent.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(url).toBe('/api/admin/support/conversations/conv-1/notes');
        expect(init.method).toBe('POST');
        // The author is never sent: the route takes it from the session, so a client cannot
        // write a note under someone else's name.
        expect(JSON.parse(init.body)).toEqual({ body: 'Supplier says refund is queued.' });
    });

    it('will not post an empty note', () => {
        render(
            <AgentNotes conversationId="conv-1" notes={[]} currentAdminId="admin-1" onChanged={() => {}} />,
        );
        fireEvent.change(screen.getByRole('textbox', { name: /not sent to the customer/i }), {
            target: { value: '   ' },
        });
        expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    });
});
