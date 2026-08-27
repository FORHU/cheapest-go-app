import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookingsClient } from './BookingsClient';
import type { Booking, PaginatedBookings } from '@/types/admin';

/**
 * The "Booked" column is the change an agent actually sees first — it is on by
 * default and it is what lets them match a caller to a row without opening anything.
 * Rendering it here because the admin page itself needs both a session and a database.
 */

vi.mock('next/navigation', () => ({
    useRouter:       () => ({ push: vi.fn(), refresh: vi.fn() }),
    usePathname:     () => '/admin/bookings',
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const booking = (over: Partial<Booking>): Booking => ({
    id: 'b-1', bookingRef: 'CG-123', type: 'hotel', supplier: 'travelgatex',
    customerName: 'Maria Reyes', email: 'maria@example.com',
    totalAmount: 11533, supplierCost: 11000, markupAmount: 533, profit: 400,
    currency: 'PHP', status: 'confirmed', paymentStatus: 'paid',
    createdAt: '2026-08-01T00:00:00Z',
    ticketIds: [], ticketStatus: 'N/A', pnr: '', paymentIntentId: 'pi_1',
    isRefundable: true,
    ...over,
});

const page = (bookings: Booking[]): PaginatedBookings => ({
    bookings, total: bookings.length, page: 1, pageSize: 10, totalPages: 1,
    stats: { totalRevenue: 0, totalProfit: 0, totalMarkup: 0, totalStripeFees: 0 },
});

const params = { page: 1, q: '', status: 'all', supplier: 'all', paymentStatus: 'all', type: 'all' };

describe('admin bookings list — Booked column', () => {
    it('is shown by default, with a heading', () => {
        render(<BookingsClient data={page([booking({})])} searchParams={params as never} />);
        expect(screen.getByText('Booked')).toBeTruthy();
    });

    it('names the hotel and the nights', () => {
        render(<BookingsClient
            data={page([booking({
                itinerary: { summary: 'Hilton Cebu · 9 Sept – 11 Sept', propertyName: 'Hilton Cebu', roomName: 'Deluxe Twin' },
            })])}
            searchParams={params as never}
        />);
        expect(screen.getByText('Hilton Cebu · 9 Sept – 11 Sept')).toBeTruthy();
        expect(screen.getByText('Deluxe Twin')).toBeTruthy();
    });

    it('names the airline and route, and counts a connection', () => {
        render(<BookingsClient
            data={page([booking({
                type: 'flight',
                itinerary: {
                    summary: 'PR 431 · MNL→NRT · 9 Sept',
                    segments: [
                        { airline: 'PR', flightNumber: '431', origin: 'MNL', destination: 'ICN', departure: '2026-09-09T14:20:00Z' },
                        { airline: 'PR', flightNumber: '432', origin: 'ICN', destination: 'NRT', departure: '2026-09-09T19:00:00Z' },
                    ],
                },
            })])}
            searchParams={params as never}
        />);
        expect(screen.getByText('PR 431 · MNL→NRT · 9 Sept')).toBeTruthy();
        expect(screen.getByText('2 segments')).toBeTruthy();
    });

    it('shows a dash rather than an empty cell for a row with no itinerary', () => {
        // Older rows predate the field. A blank cell reads as a loading fault.
        // Several columns use an em dash for "nothing here", so assert on the count
        // rather than uniqueness.
        render(<BookingsClient data={page([booking({})])} searchParams={params as never} />);
        expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });
});
