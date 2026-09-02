import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookingDetailsDialog } from './BookingDetailsDialog';
import type { Booking } from '@/types/admin';

/**
 * The itinerary panel named the flight but not much a traveller needs on the day. An
 * agent taking a call could read "7C 7C2108" and not know it was Jeju Air, how long the
 * traveller would be in the air, or how long they were waiting at the connecting airport.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;

const booking = (segments: any[]): Booking => ({
    id: 'b-1', bookingRef: 'CG2MTN', type: 'flight', supplier: 'duffel',
    customerName: 'JungKwan Shin', email: '', totalAmount: 354, supplierCost: 341,
    markupAmount: 14, profit: 3, currency: 'USD', status: 'ticketed',
    paymentStatus: 'paid', createdAt: '2026-08-23T00:00:00Z', ticketIds: [],
    ticketStatus: 'Issued', pnr: 'CG2MTN', paymentIntentId: '', isRefundable: false,
    itinerary: { segments, summary: 'Flight' },
} as Booking);

const leg = (over: Partial<any> = {}) => ({
    airline: '7C', flightNumber: '7C2108', origin: 'CRK', destination: 'ICN',
    departure: '2026-08-26T09:40:00Z', arrival: '2026-08-26T13:30:00Z',
    cabinClass: 'economy', ...over,
});

describe('admin itinerary detail', () => {
    it('names the airline rather than only its code', () => {
        render(<BookingDetailsDialog booking={booking([leg()])} onClose={() => {}} />);
        expect(screen.getByText('Jeju Air')).toBeTruthy();
        expect(screen.getByText('7C 7C2108')).toBeTruthy(); // code kept for cross-checking
    });

    it('shows how long the traveller is in the air', () => {
        render(<BookingDetailsDialog booking={booking([leg()])} onClose={() => {}} />);
        expect(screen.getByText(/3h 50m/)).toBeTruthy();
    });

    it('shows the wait at a connecting airport, named by that airport', () => {
        render(<BookingDetailsDialog booking={booking([
            leg(),
            leg({ flightNumber: '7C2110', origin: 'ICN', destination: 'NRT',
                  departure: '2026-08-26T16:00:00Z', arrival: '2026-08-26T18:30:00Z' }),
        ])} onClose={() => {}} />);
        expect(screen.getByText(/2h 30m connection in ICN/)).toBeTruthy();
    });

    it('does not call a return flight a connection', () => {
        // Outbound on the 26th, return on the 29th. A three-day gap is a separate
        // journey; labelling it "70h connection" would be nonsense.
        render(<BookingDetailsDialog booking={booking([
            leg(),
            leg({ flightNumber: '7C2107', origin: 'ICN', destination: 'CRK',
                  departure: '2026-08-29T05:35:00Z', arrival: '2026-08-29T08:40:00Z' }),
        ])} onClose={() => {}} />);
        expect(screen.queryByText(/connection/)).toBeNull();
    });

    it('shows terminals when the supplier gave them', () => {
        render(<BookingDetailsDialog booking={booking([
            leg({ originTerminal: '2', destinationTerminal: '1' }),
        ])} onClose={() => {}} />);
        expect(screen.getByText(/Terminal 2\s*→\s*Terminal 1/)).toBeTruthy();
    });

    it('omits the terminal line entirely when the supplier gave none', () => {
        // Every existing segment is in this state — the columns reached production on
        // 2026-09-01 with no booking since. A dash on every leg would read as a fault.
        render(<BookingDetailsDialog booking={booking([leg()])} onClose={() => {}} />);
        expect(screen.queryByText(/Terminal/)).toBeNull();
    });
});
