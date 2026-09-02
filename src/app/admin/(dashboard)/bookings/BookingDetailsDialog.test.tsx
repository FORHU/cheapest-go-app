import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookingDetailsDialog } from './BookingDetailsDialog';
import type { Booking } from '@/types/admin';

/**
 * The admin detail dialog described the money and the recovery options but never the
 * trip. These render it with a real-shaped booking and assert the itinerary is on the
 * screen, because "it type-checks" is not the same as "an agent can read it".
 */

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// The dialog fetches raw provider data on open; nothing here depends on it.
global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
}) as unknown as typeof fetch;

const base: Booking = {
    id: 'b-1',
    bookingRef: 'CG-123',
    type: 'flight',
    supplier: 'mystifly',
    customerName: 'Maria Reyes',
    email: 'maria@example.com',
    totalAmount: 22502.4,
    supplierCost: 20000,
    markupAmount: 2502.4,
    profit: 2000,
    currency: 'PHP',
    status: 'ticketed',
    paymentStatus: 'paid',
    createdAt: '2026-08-01T00:00:00Z',
    ticketIds: ['0794567890'],
    ticketStatus: 'Issued',
    pnr: 'ABC123',
    paymentIntentId: 'pi_1',
    isRefundable: true,
};

describe('BookingDetailsDialog itinerary', () => {
    it('shows the airline, route and passenger for a flight', () => {
        render(
            <BookingDetailsDialog
                onClose={() => {}}
                booking={{
                    ...base,
                    itinerary: {
                        summary: 'PR 431 · MNL→NRT · 9 Sept',
                        segments: [{
                            airline: 'PR', flightNumber: '431',
                            origin: 'MNL', destination: 'NRT',
                            departure: '2026-09-09T14:20:00Z',
                            cabinClass: 'economy',
                        }],
                        passengers: [{ name: 'Maria Reyes', type: 'ADT', ticketNumber: '0794567890', seatNumber: '12A' }],
                    },
                }}
            />
        );

        expect(screen.getByText('Itinerary')).toBeTruthy();
        // The operating airline — the thing `supplier` (the ticketing partner) does
        // not tell you, and which was absent from this dialog entirely.
        expect(screen.getByText('PR 431')).toBeTruthy();
        expect(screen.getByText('MNL → NRT')).toBeTruthy();
        expect(screen.getByText('economy')).toBeTruthy();
        expect(screen.getByText('Passengers')).toBeTruthy();
        // Appears twice by design: once in the flat "Issued Tickets" list that was
        // already here, and once against the passenger it belongs to. The second is
        // what an agent needs when a booking has more than one traveller.
        expect(screen.getAllByText(/0794567890/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/12A/)).toBeTruthy();
    });

    it('shows the property, room and dates for a hotel', () => {
        render(
            <BookingDetailsDialog
                onClose={() => {}}
                booking={{
                    ...base,
                    type: 'hotel',
                    itinerary: {
                        summary: 'Hilton Cebu · 9 Sept – 11 Sept',
                        propertyName: 'Hilton Cebu',
                        roomName: 'Deluxe Twin',
                        checkIn: '2026-09-09',
                        checkOut: '2026-09-11',
                        adults: 2,
                        children: 1,
                    },
                }}
            />
        );

        expect(screen.getByText('Hilton Cebu')).toBeTruthy();
        expect(screen.getByText('Deluxe Twin')).toBeTruthy();
        // Rendered through formatDate rather than raw: a stored timestamp is unreadable,
        // and passing the value straight to JSX is what threw "Objects are not valid as a
        // React child" once the driver started handing back Date objects. Matched loosely
        // because the exact day depends on the runner's timezone.
        expect(screen.getAllByText(/Sep \d+, 2026/)).toHaveLength(2); // check-in and check-out
        expect(screen.getByText('2 adults, 1 child')).toBeTruthy();
    });

    it('omits the section entirely when there is no itinerary', () => {
        // Older rows carry no itinerary. An empty "Itinerary" heading would read as
        // data loss rather than as a record predating the field.
        render(<BookingDetailsDialog onClose={() => {}} booking={base} />);
        expect(screen.queryByText('Itinerary')).toBeNull();
    });
});
