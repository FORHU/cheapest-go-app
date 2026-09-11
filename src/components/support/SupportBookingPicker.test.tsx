import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SupportBookingPicker } from './SupportBookingPicker';

/**
 * Asking the customer which trip they are writing about.
 *
 * The case worth pinning is the failure. This fetch runs on every panel open, and the
 * condition it has to survive is a bad connection — the moment a customer is most likely to
 * be writing to support in the first place. Unguarded it rejected out of the effect
 * entirely: an unhandled rejection in the browser, and in CI a fetch that outlived the test
 * that started it, which turned a suite where every test passed into a run that exited 1.
 */

const messages = {
    support: {
        trips: {
            question: 'Which trip is this about?',
            skip: 'Not about a trip',
            about: 'About',
            change: 'Change',
        },
    },
};

const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <NextIntlClientProvider locale="en" messages={messages}>
        {children}
    </NextIntlClientProvider>
);

afterEach(() => vi.unstubAllGlobals());

describe('SupportBookingPicker', () => {
    it('renders nothing, and rejects nothing, when the lookup fails', async () => {
        const rejections: unknown[] = [];
        const onRejection = (e: PromiseRejectionEvent) => { rejections.push(e.reason); e.preventDefault(); };
        window.addEventListener('unhandledrejection', onRejection);

        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('NetworkError')));

        const { container } = render(<SupportBookingPicker conversationId="conv-1" />, { wrapper: Wrapper });

        // Give the effect a turn to settle, then assert it settled quietly.
        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(container).toBeEmptyDOMElement();
        expect(rejections).toHaveLength(0);

        window.removeEventListener('unhandledrejection', onRejection);
    });

    it('renders nothing when the caller is signed out and has no trips', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ trips: [], linked: [] }),
        }));

        const { container } = render(<SupportBookingPicker conversationId="conv-1" />, { wrapper: Wrapper });
        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });

    it('does not ask before there is a conversation to ask about', () => {
        vi.stubGlobal('fetch', vi.fn());
        render(<SupportBookingPicker conversationId={null} />, { wrapper: Wrapper });
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('offers the trips it was given', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                trips: [
                    { bookingReference: 'FORHU-1786605295145-S8FWP', kind: 'stay', label: 'Jeju F1', startsAt: '2026-10-10T00:00:00.000Z' },
                ],
                linked: [],
            }),
        }));

        render(<SupportBookingPicker conversationId="conv-1" />, { wrapper: Wrapper });

        expect(await screen.findByText('Which trip is this about?')).toBeInTheDocument();
        expect(screen.getByText('Jeju F1')).toBeInTheDocument();
        // Skippable, always: a question with no trip attached is not incomplete.
        expect(screen.getByText('Not about a trip')).toBeInTheDocument();
    });
});
