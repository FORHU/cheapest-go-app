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
    private listeners = new Map<string, ((event: { data: string }) => void)[]>();
    constructor(public url: string) {
        FakeEventSource.instances.push(this);
    }
    addEventListener(type: string, listener: (event: { data: string }) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    /** What the server would send down this stream. */
    emit(type: string, data: unknown) {
        for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) });
    }
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

/**
 * A resolved chat is never reopened — a returning customer starts a new one — so an earlier
 * answer is read back through "Previous conversation", separately from the new topic.
 */
describe('SupportWidget — previous conversations', () => {
    const withHistory = {
        support: {
            ...messages.support,
            history: {
                previous: 'Previous conversation {reference}',
                back: 'Back to your current chat',
                closed: 'This conversation is closed.',
                unavailable: 'Could not load it.',
            },
        },
    };

    function HistoryWrapper({ children }: { children: React.ReactNode }) {
        return <NextIntlClientProvider locale="en" messages={withHistory}>{children}</NextIntlClientProvider>;
    }

    beforeEach(() => {
        fetchMock = vi.fn(async (url: string) => {
            if (url === '/api/support/conversation/history') {
                return {
                    ok: true,
                    json: async () => ({
                        conversations: [{ reference: 'CS-OLD111', createdAt: '2026-09-01T10:00:00.000Z', lastMessageAt: '2026-09-02T10:00:00.000Z' }],
                    }),
                };
            }
            if (url === '/api/support/conversation/history/CS-OLD111') {
                return {
                    ok: true,
                    json: async () => ({
                        messages: [{ id: 'old-1', senderType: 'agent', body: 'Your refund was sent.', noticeCode: null, createdAt: '2026-09-02T10:00:00.000Z', attachments: [] }],
                    }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    conversation: {
                        id: 'conv-new', status: 'waiting_human', locale: 'en', guestName: null,
                        createdAt: '2026-09-14T10:00:00.000Z', lastMessageAt: '2026-09-14T10:00:00.000Z',
                        reference: 'CS-NEW222', escalationNeedsDetails: false,
                    },
                    messages: [],
                }),
            };
        });
        vi.stubGlobal('fetch', fetchMock);
    });

    it('opens on the new chat, with the finished one a tap away and read-only', async () => {
        render(<SupportWidget />, { wrapper: HistoryWrapper });
        openSupport();

        const link = await screen.findByRole('button', { name: 'Previous conversation CS-OLD111' });
        // The new topic starts clean: none of the old transcript is in it.
        expect(screen.queryByText('Your refund was sent.')).not.toBeInTheDocument();

        fireEvent.click(link);
        expect(await screen.findByText('Your refund was sent.')).toBeInTheDocument();
        expect(screen.getByText('This conversation is closed.')).toBeInTheDocument();
        // Read-only: no box to type into while reading it back.
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Back to your current chat' }));
        expect(screen.queryByText('Your refund was sent.')).not.toBeInTheDocument();
        expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
});

describe('when the team resolves the chat (QA BG-17)', () => {
    const conversationPosts = () => fetchMock.mock.calls.filter(([url, init]) => url === '/api/support/conversation' && init?.method === 'POST').length;
    const historyReads = () => fetchMock.mock.calls.filter(([url]) => url === '/api/support/conversation/history').length;

    it('refreshes by itself: the finished chat goes to history and a new one opens', async () => {
        render(<SupportWidget />, { wrapper: Wrapper });
        openSupport();
        await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
        expect(conversationPosts()).toBe(1);
        const historyBefore = historyReads();

        act(() => FakeEventSource.instances[0].emit('status', { conversationId: 'conv-1', status: 'resolved' }));

        // A second open: the server starts the next chat because the last one is resolved.
        await waitFor(() => expect(conversationPosts()).toBe(2));
        // And the previous-conversations list is read again, so the resolved chat shows there.
        await waitFor(() => expect(historyReads()).toBeGreaterThan(historyBefore));
    });

    it('does not create a chat for nobody while the panel is shut — it opens on the next look', async () => {
        render(<SupportWidget />, { wrapper: Wrapper });
        openSupport();
        await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
        fireEvent.click(screen.getByRole('button', { name: 'Close support' }));

        act(() => FakeEventSource.instances[0].emit('status', { conversationId: 'conv-1', status: 'resolved' }));
        await new Promise(r => setTimeout(r, 50));
        expect(conversationPosts()).toBe(1);

        openSupport();
        await waitFor(() => expect(conversationPosts()).toBe(2));
    });

    it('also refreshes when the stream opens on an already-resolved chat — resolved while connecting', async () => {
        render(<SupportWidget />, { wrapper: Wrapper });
        openSupport();
        await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

        act(() => FakeEventSource.instances[0].emit('ready', { conversationId: 'conv-1', status: 'resolved' }));
        await waitFor(() => expect(conversationPosts()).toBe(2));
    });

    it('ignores other status frames', async () => {
        render(<SupportWidget />, { wrapper: Wrapper });
        openSupport();
        await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

        act(() => FakeEventSource.instances[0].emit('status', { conversationId: 'conv-1', status: 'human_active' }));
        await new Promise(r => setTimeout(r, 50));
        expect(conversationPosts()).toBe(1);
    });
});

describe('attachment failures always say why (QA BG-16)', () => {
    const attachMessages = {
        ...messages,
        support: {
            ...messages.support,
            attachments: {
                attach: 'Attach a file', uploading: 'Uploading…', remove: 'Remove {name}', download: 'Download {name}',
                errors: {
                    empty: 'That file is empty.',
                    tooLarge: 'Files must be 10 MB or smaller.',
                    unsupported: 'That file type is not supported. Send an image or a PDF.',
                    tooMany: 'Too many uploads. Please wait a moment and try again.',
                    unavailable: 'Attachments are not available right now.',
                    failed: 'Could not upload that file. Please try again.',
                },
            },
        },
    };
    const AttachWrapper = ({ children }: { children: React.ReactNode }) => (
        <NextIntlClientProvider locale="en" messages={attachMessages}>{children}</NextIntlClientProvider>
    );

    /** A conversation with attachments on, and whatever the upload route should answer. */
    function serve(upload: () => Promise<unknown>) {
        fetchMock.mockImplementation(async (url: string) => {
            if (url === '/api/support/conversation/attachments') return upload();
            return {
                ok: true,
                json: async () => ({
                    conversation: {
                        id: 'conv-1', status: 'waiting_human', locale: 'en', guestName: null,
                        createdAt: '2026-09-06T10:00:00.000Z', lastMessageAt: '2026-09-06T10:00:00.000Z',
                        reference: 'CS-9QM2K7', escalationNeedsDetails: false, attachmentsEnabled: true,
                    },
                    messages: [],
                }),
            };
        });
    }

    async function pick(file: File) {
        render(<SupportWidget />, { wrapper: AttachWrapper });
        openSupport();
        const input = await waitFor(() => {
            const el = document.querySelector('input[type="file"]');
            if (!el) throw new Error('no picker yet');
            return el as HTMLInputElement;
        });
        await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    }

    it('explains a proxy\'s HTML 413 instead of showing nothing', async () => {
        // What production actually answers for anything over 1 MB: an nginx page, not JSON.
        serve(async () => ({ ok: false, status: 413, json: async () => { throw new SyntaxError('Unexpected token <'); } }));
        await pick(new File([new Uint8Array(2 * 1024 * 1024)], 'passport.jpg', { type: 'image/jpeg' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Files must be 10 MB or smaller.');
    });

    it('refuses a Word document before uploading it, and says so', async () => {
        const uploads = vi.fn();
        serve(async () => { uploads(); return { ok: true, status: 201, json: async () => ({}) }; });
        await pick(new File(['PK'], 'itinerary.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('That file type is not supported. Send an image or a PDF.');
        expect(uploads).not.toHaveBeenCalled();
    });

    it('passes on the server\'s own reason when it gives one', async () => {
        serve(async () => ({ ok: false, status: 400, json: async () => ({ error: 'A message can carry at most 5 files.' }) }));
        await pick(new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('A message can carry at most 5 files.');
    });
});
