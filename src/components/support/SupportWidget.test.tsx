import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SupportWidget } from './SupportWidget';

/**
 * The widget assembled: launcher, panel, and the conversation opening behind them.
 *
 * The pieces are covered on their own; what this adds is that they are wired together —
 * that the button opens the panel, that opening it is what creates the conversation
 * rather than page load, and that the panel can be dismissed by keyboard.
 */

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
    it('shows the launcher and nothing else at first', () => {
        render(<SupportWidget />, { wrapper: Wrapper });

        expect(screen.getByRole('button', { name: 'Get help' })).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not open a conversation until someone asks for help', () => {
        // Opening one on page load would mint a guest token and a row for every visitor
        // who never had a question.
        render(<SupportWidget />, { wrapper: Wrapper });

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('opens the panel and starts a conversation when pressed', async () => {
        render(<SupportWidget />, { wrapper: Wrapper });

        fireEvent.click(screen.getByRole('button', { name: 'Get help' }));

        expect(screen.getByRole('dialog', { name: 'Support' })).toBeInTheDocument();
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/support/conversation',
                expect.objectContaining({ method: 'POST' }),
            ),
        );
    });

    it('closes again when the launcher is pressed a second time', async () => {
        render(<SupportWidget />, { wrapper: Wrapper });

        fireEvent.click(screen.getByRole('button', { name: 'Get help' }));
        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: 'Close support' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes on Escape, as the app\'s other overlays do', async () => {
        render(<SupportWidget />, { wrapper: Wrapper });

        fireEvent.click(screen.getByRole('button', { name: 'Get help' }));
        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('holds no stream until support has actually been used', async () => {
        // A visitor who never clicks the bubble costs nothing. Once a conversation
        // exists the stream is kept even with the panel shut, because that is the only
        // way a reply can announce itself on the launcher.
        render(<SupportWidget />, { wrapper: Wrapper });
        expect(FakeEventSource.instances).toHaveLength(0);

        fireEvent.click(screen.getByRole('button', { name: 'Get help' }));
        await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    });

    it('keeps the stream after the panel is closed, so a reply can be announced', async () => {
        render(<SupportWidget />, { wrapper: Wrapper });

        fireEvent.click(screen.getByRole('button', { name: 'Get help' }));
        await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

        fireEvent.click(screen.getByRole('button', { name: 'Close support' }));

        // Still exactly one: not torn down, and not a second one either.
        expect(FakeEventSource.instances).toHaveLength(1);
        expect(FakeEventSource.closed).toBe(0);
    });
});
