import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SupportWidget } from './SupportWidget';
import { useSupportWidgetStore } from '@/stores/supportWidgetStore';

/**
 * The widget assembled: the panel, and the conversation opening behind it.
 *
 * There is no launcher any more — support is entered from the account menu, which lives
 * outside this portal and asks through the store. So every test here opens the same way
 * the real entry point does. What this file adds over the piece-by-piece tests is that
 * opening is what creates the conversation rather than page load, that the panel can be
 * dismissed by keyboard, and that the stream outlives the panel being shut.
 */

/** The only way in now: the account menu sets this, the portal reacts. */
const openSupport = () => act(() => useSupportWidgetStore.getState().open());

const messages = {
    support: {
        title: 'Support',
        subtitle: 'Ask about a booking or anything else.',
        launcherOpen: 'Get help',
        launcherClose: 'Close support',
        typing: 'CheapestGo is typing…',
        empty: 'Ask us anything about your trip.',
        sender: { guest: 'You', ai: 'CheapestGo', agent: 'Support', system: 'Support' },
        composer: { placeholder: 'Type your message', connecting: 'Connecting…', send: 'Send' },
        escalate: {
            ask: 'Talk to a person', title: 'Talk to a person', intro: 'Leave your details.',
            name: 'Name', email: 'Email', submit: 'Request a person', cancel: 'Not now',
        },
        status: { waiting: 'Waiting for someone from the team.', human: 'You are talking to the team.' },
        notice: {},
    },
};

function Wrapper({ children }: { children: React.ReactNode }) {
    return (
        <NextIntlClientProvider locale="en" messages={messages}>
            {children}
        </NextIntlClientProvider>
    );
}

/** A stand-in for the browser's EventSource, which happy-dom does not provide. */
class FakeEventSource {
    static instances: FakeEventSource[] = [];
    static closed = 0;
    onerror: (() => void) | null = null;
    constructor(public url: string) {
        FakeEventSource.instances.push(this);
    }
    addEventListener() {}
    close() { FakeEventSource.closed++; }
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    // Open/closed is a module-level store now, so it outlives a test unless reset.
    useSupportWidgetStore.setState({ isOpen: false });

    FakeEventSource.instances = [];
    FakeEventSource.closed = 0;
    vi.stubGlobal('EventSource', FakeEventSource);

    fetchMock = vi.fn(async () => ({
        ok: true,
        json: async () => ({
            conversation: {
                id: 'conv-1',
                status: 'ai_active',
                locale: 'en',
                guestName: null,
                createdAt: '2026-09-06T10:00:00.000Z',
                lastMessageAt: '2026-09-06T10:00:00.000Z',
                reference: 'CS-9QM2K7',
                escalationNeedsDetails: true,
            },
            messages: [],
        }),
    }));
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('SupportWidget', () => {
    it('renders nothing at all until support is asked for', () => {
        // The floating launcher is gone: the widget draws no chrome of its own, so a page
        // that mounts it looks exactly as it did before support existed.
        render(<SupportWidget />, { wrapper: Wrapper });

        expect(screen.queryByRole('button', { name: 'Get help' })).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not open a conversation until someone asks for help', () => {
        // Opening one on page load would mint a guest token and a row for every visitor
        // who never had a question.
        render(<SupportWidget />, { wrapper: Wrapper });

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('opens the panel and starts a conversation when asked', async () => {
        render(<SupportWidget />, { wrapper: Wrapper });

        openSupport();

        expect(screen.getByRole('dialog', { name: 'Support' })).toBeInTheDocument();
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/support/conversation',
                expect.objectContaining({ method: 'POST' }),
            ),
        );
    });

    it('closes from its own close button', async () => {
        render(<SupportWidget />, { wrapper: Wrapper });

        openSupport();
        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: 'Close support' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes on Escape, as the app\'s other overlays do', async () => {
        render(<SupportWidget />, { wrapper: Wrapper });

        openSupport();
        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('holds no stream until support has actually been used', async () => {
        // A visitor who never opens support costs nothing. Once a conversation exists the
        // stream is kept even with the panel shut, so a reply that arrives meanwhile is
        // still counted.
        render(<SupportWidget />, { wrapper: Wrapper });
        expect(FakeEventSource.instances).toHaveLength(0);

        openSupport();
        await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    });

    it('keeps the stream after the panel is closed, so a reply can be announced', async () => {
        render(<SupportWidget />, { wrapper: Wrapper });

        openSupport();
        await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

        fireEvent.click(screen.getByRole('button', { name: 'Close support' }));

        // Still exactly one: not torn down, and not a second one either.
        expect(FakeEventSource.instances).toHaveLength(1);
        expect(FakeEventSource.closed).toBe(0);
    });
    it('opens when another part of the app asks for support', async () => {
        // Account -> Help offers "Live Chat" from outside this portal, so it cannot
        // reach the launcher's handler; it opens the panel through the store instead.
        render(<SupportWidget />, { wrapper: Wrapper });

        act(() => useSupportWidgetStore.getState().open());

        expect(screen.getByRole('dialog', { name: 'Support' })).toBeInTheDocument();

        // Opening this way starts the conversation exactly as the launcher does; await it
        // so the state it settles belongs to this test.
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/support/conversation',
                expect.objectContaining({ method: 'POST' }),
            ),
        );
    });
});
