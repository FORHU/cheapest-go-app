import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SupportInboxClient } from './SupportInboxClient';
import type { InboxConversation } from './types';

/**
 * The Agent's screen.
 *
 * What is worth testing here is not the layout but the things that would quietly go wrong:
 * that a waiting conversation is visible whichever brand it came from, that the composer
 * is available on a conversation the assistant is still handling (a Takeover), and that
 * the model's private reason for giving up is shown to the Agent — it is the one piece of
 * text on this screen that must never reach the customer.
 */

const conversation = (over: Partial<InboxConversation> = {}): InboxConversation => ({
    id: 'conv-1',
    status: 'waiting_human',
    sourceBrand: 'CheapestGo',
    locale: 'en',
    guestName: 'Ana Reyes',
    guestEmail: 'ana@example.com',
    userId: null,
    assignedAdminId: null,
    escalationReason: null,
    lastMessageAt: '2026-09-06T10:00:00.000Z',
    createdAt: '2026-09-06T09:00:00.000Z',
    ...over,
});

class FakeEventSource {
    static instances: FakeEventSource[] = [];
    onerror: (() => void) | null = null;
    constructor(public url: string) { FakeEventSource.instances.push(this); }
    addEventListener() {}
    close() {}
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Routes the client's calls; each test overrides what the detail endpoint returns. */
function mockApi(detail: unknown = null) {
    fetchMock = vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/messages')) {
            return { ok: true, status: 201, json: async () => ({ message: { id: 'm9' } }) };
        }
        if (typeof url === 'string' && url.includes('/resolve')) {
            return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        if (typeof url === 'string' && /conversations\/[^/?]+$/.test(url)) {
            return { ok: true, status: 200, json: async () => detail };
        }
        return {
            ok: true,
            status: 200,
            json: async () => ({ filter: 'waiting', conversations: [], counts: { waiting: 0, mine: 0 } }),
        };
    });
    vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const waiting = [
    conversation({ id: 'a', guestName: 'Ana Reyes', sourceBrand: 'CheapestGo' }),
    conversation({ id: 'b', guestName: '김민준', sourceBrand: 'GeomeeGo' }),
];

describe('SupportInboxClient', () => {
    it('lists the queue', () => {
        mockApi();
        render(
            <SupportInboxClient
                initialFilter="waiting"
                initialConversations={waiting}
                initialCounts={{ waiting: 2, mine: 0 }}
            />,
        );

        expect(screen.getByText('Ana Reyes')).toBeInTheDocument();
        expect(screen.getByText('김민준')).toBeInTheDocument();
    });

    it('shows both brands, because filtering one away hides a waiting customer', () => {
        // ADR-0030. The brand is on the row so an Agent knows who they are talking to.
        mockApi();
        render(
            <SupportInboxClient
                initialFilter="waiting"
                initialConversations={waiting}
                initialCounts={{ waiting: 2, mine: 0 }}
            />,
        );

        expect(screen.getByText('GeomeeGo')).toBeInTheDocument();
        expect(screen.getByText('CheapestGo')).toBeInTheDocument();
    });

    it('says when nothing is waiting, rather than showing an empty box', () => {
        mockApi();
        render(
            <SupportInboxClient
                initialFilter="waiting"
                initialConversations={[]}
                initialCounts={{ waiting: 0, mine: 0 }}
            />,
        );

        expect(screen.getByText(/nothing waiting/i)).toBeInTheDocument();
    });

    it('opens a conversation and shows the transcript beside the queue', async () => {
        mockApi({
            conversation: conversation({ id: 'a' }),
            messages: [
                { id: 'm1', senderType: 'guest', body: 'I want a refund.', noticeCode: null, createdAt: '2026-09-06T10:00:00.000Z' },
            ],
            bookings: null,
        });

        render(
            <SupportInboxClient
                initialFilter="waiting"
                initialConversations={waiting}
                initialCounts={{ waiting: 2, mine: 0 }}
            />,
        );

        fireEvent.click(screen.getByText('Ana Reyes'));

        await waitFor(() => expect(screen.getByText('I want a refund.')).toBeInTheDocument());
        // The queue stays visible — that is the reason for two panes.
        expect(screen.getByText('김민준')).toBeInTheDocument();
    });

    it("shows the model's reason for handing over", async () => {
        // Agent-only. This is the model's private note about the customer, and the whole
        // reason it lives on the conversation rather than in a system message.
        mockApi({
            conversation: conversation({ id: 'a', escalationReason: 'refund request' }),
            messages: [],
            bookings: null,
        });

        render(
            <SupportInboxClient
                initialFilter="waiting"
                initialConversations={waiting}
                initialCounts={{ waiting: 2, mine: 0 }}
            />,
        );

        fireEvent.click(screen.getByText('Ana Reyes'));

        await waitFor(() => expect(screen.getByText(/refund request/)).toBeInTheDocument());
    });

    it('sends a reply', async () => {
        mockApi({ conversation: conversation({ id: 'a' }), messages: [], bookings: null });

        render(
            <SupportInboxClient
                initialFilter="waiting"
                initialConversations={waiting}
                initialCounts={{ waiting: 2, mine: 0 }}
            />,
        );

        fireEvent.click(screen.getByText('Ana Reyes'));
        await waitFor(() => expect(screen.getByRole('textbox')).toBeInTheDocument());

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Looking into it.' } });
        fireEvent.click(screen.getByRole('button', { name: /send/i }));

        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/admin/support/conversations/a/messages',
                expect.objectContaining({ method: 'POST' }),
            ),
        );
    });

    it('lets an Agent reply to a conversation the assistant is handling', async () => {
        // A Takeover. Seeing a wrong answer and correcting it is the point of being able
        // to read that tab at all, so the composer must not be disabled here.
        mockApi({
            conversation: conversation({ id: 'a', status: 'ai_active' }),
            messages: [],
            bookings: null,
        });

        render(
            <SupportInboxClient
                initialFilter="assistant"
                initialConversations={[conversation({ id: 'a', status: 'ai_active' })]}
                initialCounts={{ waiting: 0, mine: 0 }}
            />,
        );

        fireEvent.click(screen.getByText('Ana Reyes'));

        await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
    });

    it('resolves a conversation', async () => {
        mockApi({ conversation: conversation({ id: 'a' }), messages: [], bookings: null });

        render(
            <SupportInboxClient
                initialFilter="waiting"
                initialConversations={waiting}
                initialCounts={{ waiting: 2, mine: 0 }}
            />,
        );

        fireEvent.click(screen.getByText('Ana Reyes'));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Mark conversation resolved' })).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: 'Mark conversation resolved' }));

        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/admin/support/conversations/a/resolve',
                expect.objectContaining({ method: 'POST' }),
            ),
        );
    });

    it('holds one live feed for the whole inbox', () => {
        mockApi();
        render(
            <SupportInboxClient
                initialFilter="waiting"
                initialConversations={waiting}
                initialCounts={{ waiting: 2, mine: 0 }}
            />,
        );

        expect(FakeEventSource.instances).toHaveLength(1);
        expect(FakeEventSource.instances[0].url).toBe('/api/admin/support/stream');
    });
});
