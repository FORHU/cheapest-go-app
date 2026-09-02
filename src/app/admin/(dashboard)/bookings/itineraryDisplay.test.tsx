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
        expect(screen.getByText(/2h 30m layover at ICN/)).toBeTruthy();
    });

    it('does not call a return flight a layover', () => {
        // Outbound on the 26th, return on the 29th. A three-day gap is a separate
        // journey; labelling it a "70h layover" would be nonsense.
        render(<BookingDetailsDialog booking={booking([
            leg(),
            leg({ flightNumber: '7C2107', origin: 'ICN', destination: 'CRK',
                  departure: '2026-08-29T05:35:00Z', arrival: '2026-08-29T08:40:00Z' }),
        ])} onClose={() => {}} />);
        expect(screen.queryByText(/layover/)).toBeNull();
    });

    it('does not call a same-day return a layover', () => {
        // The case the elapsed-time rule cannot see: out at 09:40, back at 19:00 the same
        // day. Under 24 hours, so the gap alone reads as a layover; only the slice says
        // otherwise. sliceIndex comes from flight_segments.segment_index, which stores the
        // slice — 0 outbound, 1 return — not a running count of segments.
        render(<BookingDetailsDialog booking={booking([
            leg({ sliceIndex: 0 }),
            leg({ flightNumber: '7C2107', origin: 'ICN', destination: 'CRK', sliceIndex: 1,
                  departure: '2026-08-26T19:00:00Z', arrival: '2026-08-26T22:05:00Z' }),
        ])} onClose={() => {}} />);
        expect(screen.queryByText(/layover/)).toBeNull();
    });

    it('still labels a genuine layover when both legs share a slice', () => {
        render(<BookingDetailsDialog booking={booking([
            leg({ sliceIndex: 0 }),
            leg({ flightNumber: '7C2110', origin: 'ICN', destination: 'NRT', sliceIndex: 0,
                  departure: '2026-08-26T16:00:00Z', arrival: '2026-08-26T18:30:00Z' }),
        ])} onClose={() => {}} />);
        expect(screen.getByText(/2h 30m layover at ICN/)).toBeTruthy();
    });

    it('shows terminals when the supplier gave them', () => {
        render(<BookingDetailsDialog booking={booking([
            leg({ originTerminal: '2', destinationTerminal: '1' }),
        ])} onClose={() => {}} />);
        expect(screen.getByText(/Terminal 2\s*→\s*Terminal 1/)).toBeTruthy();
    });

    it('shows the terminal it knows when the supplier gave only one side', () => {
        // Not an edge case. Measured on live Duffel 2026-09-02, LHR→JFK returned 31/31
        // segments with a terminal but in shapes 2/null, null/1 and null/2 as well as
        // 2/1 — one-sided is ordinary. Hiding the known half would discard real
        // information; a dash on the unknown half says which one we do not have.
        render(<BookingDetailsDialog booking={booking([leg({ originTerminal: '2' })])} onClose={() => {}} />);
        expect(document.body.textContent).toContain('Terminal 2');
        expect(document.body.textContent).toContain('Terminal —');
    });

    it('shows an arrival-only terminal too', () => {
        render(<BookingDetailsDialog booking={booking([leg({ destinationTerminal: '1' })])} onClose={() => {}} />);
        expect(document.body.textContent).toContain('Terminal 1');
        expect(document.body.textContent).toContain('Terminal —');
    });

    it('omits the terminal line entirely when the supplier gave none', () => {
        // Every existing segment is in this state — the columns reached production on
        // 2026-09-01 with no booking since. A dash on every leg would read as a fault.
        render(<BookingDetailsDialog booking={booking([leg()])} onClose={() => {}} />);
        expect(screen.queryByText(/Terminal/)).toBeNull();
    });
});
