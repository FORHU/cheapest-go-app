import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LinkedBookings } from './LinkedBookings';
import type { LinkedBookingView } from '@/app/admin/(dashboard)/support/types';

/**
 * The trips a Support Chat is about, and — the part worth testing — what happens when one
 * of them is not a trip at all.
 */

const linked = (over: Partial<LinkedBookingView> = {}): LinkedBookingView => ({
    bookingReference: 'FORHU-1786605295145-S8FWP',
    linkedBy: null,
    linkedAt: '2026-09-09T10:00:00.000Z',
    known: true,
    ...over,
});

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ bookings: [] }) }));
});
afterEach(() => vi.unstubAllGlobals());

describe('LinkedBookings', () => {
    it('marks a reference that matches no booking', () => {
        // Such a link carries no dates, so it contributes nothing to Urgency. Unmarked, a
        // chat about an imminent flight would sit in the queue looking ordinary and the
        // typo would surface only when someone asked why it was never raised.
        render(
            <LinkedBookings
                conversationId="conv-1"
                bookings={[linked({ bookingReference: 'CG-NOTREAL', known: false })]}
                onChanged={() => {}}
            />,
        );
        expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });

    it('says nothing extra about a reference that resolves', () => {
        render(
            <LinkedBookings conversationId="conv-1" bookings={[linked()]} onChanged={() => {}} />,
        );
        expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
        expect(screen.getByText('FORHU-1786605295145-S8FWP')).toBeInTheDocument();
    });

    it('accepts the legacy reference format, which is what every live booking uses', () => {
        // Every booking on this system today is FORHU-; new sales mint CG-/GG-. Both are
        // live at once, so nothing here may assume a shape.
        render(
            <LinkedBookings
                conversationId="conv-1"
                bookings={[linked({ bookingReference: 'FORHU-1786593033727-QNLCS' })]}
                onChanged={() => {}}
            />,
        );
        expect(screen.getByText('FORHU-1786593033727-QNLCS')).toBeInTheDocument();
        expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
    });

    it('marks a trip an Agent attached, and leaves the customer’s own unmarked', () => {
        // The question a refund dispute asks: was this trip named by the person claiming
        // it, or by us?
        const { rerender } = render(
            <LinkedBookings
                conversationId="conv-1"
                bookings={[linked({ linkedBy: 'admin-1' })]}
                onChanged={() => {}}
            />,
        );
        expect(screen.getByText('agent')).toBeInTheDocument();

        rerender(
            <LinkedBookings conversationId="conv-1" bookings={[linked({ linkedBy: null })]} onChanged={() => {}} />,
        );
        expect(screen.queryByText('agent')).not.toBeInTheDocument();
    });

    it('says no trip is linked rather than implying one is missing', () => {
        // Zero is a normal state: "how do refunds work" is about no trip in particular.
        render(<LinkedBookings conversationId="conv-1" bookings={[]} onChanged={() => {}} />);
        expect(screen.getByText(/no trip linked/i)).toBeInTheDocument();
    });

    it('renders when the field is absent rather than blanking the panel', () => {
        render(
            // @ts-expect-error — the missing-field case a rolling deploy produces.
            <LinkedBookings conversationId="conv-1" bookings={undefined} onChanged={() => {}} />,
        );
        expect(screen.getByText(/no trip linked/i)).toBeInTheDocument();
    });

    it('does not suggest a reference format in the input hint', () => {
        // A hint reading "CG-7K2M9Q" would look like a required shape that no booking on
        // this system currently matches — every one of them is FORHU-.
        render(<LinkedBookings conversationId="conv-1" bookings={[]} onChanged={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /link a trip/i }));

        const input = screen.getByPlaceholderText(/booking reference/i);
        expect(input).toBeInTheDocument();
        expect(input.getAttribute('placeholder')).not.toMatch(/^(CG|GG)-/);
    });
});
