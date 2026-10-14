import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
    user: { id: 'u1' } as { id: string } | null,
    hotels: [] as unknown[],
}));

vi.mock('@/lib/server/auth', () => ({
    getAuthenticatedUser: vi.fn(async () => ({ user: state.user, error: state.user ? null : 'Not authenticated' })),
}));
vi.mock('@/utils/postgres/admin', () => ({
    createAdminClient: () => ({
        from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: state.hotels, error: null }) }) }) }),
    }),
}));
// Flights, segments and passengers: nothing for this customer.
vi.mock('@/lib/db/postgres', () => ({ getSqlAdmin: () => (async () => []) }));
vi.mock('@/lib/server/golf/tripBookings', () => ({ listGolfBookingsForUser: vi.fn() }));

import { fetchTripsData } from './fetchTripsData';
import { listGolfBookingsForUser } from '@/lib/server/golf/tripBookings';
import type { TripGolfBooking } from './golfBookings';

const FUTURE = new Date(Date.now() + 10 * 86_400_000).toISOString();
const PAST = new Date(Date.now() - 10 * 86_400_000).toISOString();

const golf = (over: Partial<TripGolfBooking> = {}): TripGolfBooking => ({
    kind: 'golf', id: 'g1', reference: 'CG-ABC234', status: 'confirmed', courseName: 'Wack Wack', courseSlug: 'wack-wack', city: 'Mandaluyong',
    startsAt: FUTURE, timezone: 'Asia/Manila', players: 2, total: 5000, currency: 'PHP', created_at: PAST, ...over,
});

beforeEach(() => {
    vi.clearAllMocks();
    state.user = { id: 'u1' };
    state.hotels = [];
});

describe('fetchTripsData with golf', () => {
    it('includes the customer\'s golf bookings, grouped like the rest', async () => {
        vi.mocked(listGolfBookingsForUser).mockResolvedValueOnce([
            golf({ id: 'ahead' }),
            golf({ id: 'played', startsAt: PAST }),
            golf({ id: 'gone', status: 'cancelled' }),
        ]);
        const data = await fetchTripsData();
        expect(listGolfBookingsForUser).toHaveBeenCalledWith('u1');
        expect(data.golfBookings.map(b => b.id)).toEqual(['ahead', 'played', 'gone']);
        expect(data.upcomingGolfBookings.map(b => b.id)).toEqual(['ahead']);
        expect(data.pastGolfBookings.map(b => b.id)).toEqual(['played']);
        expect(data.cancelledGolfBookings.map(b => b.id)).toEqual(['gone']);
    });

    it('still returns hotels when golf cannot be read', async () => {
        state.hotels = [{
            id: 'h1', user_id: 'u1', status: 'confirmed', check_in: FUTURE, check_out: FUTURE, created_at: PAST,
        }];
        vi.mocked(listGolfBookingsForUser).mockRejectedValueOnce(new Error('relation does not exist'));
        const data = await fetchTripsData();
        expect(data.bookings).toHaveLength(1);
        expect(data.upcomingBookings).toHaveLength(1);
        expect(data.golfBookings).toEqual([]);
        expect(data.upcomingGolfBookings).toEqual([]);
    });

    it('returns nothing, golf included, for a signed-out visitor', async () => {
        state.user = null;
        const data = await fetchTripsData();
        expect(data.golfBookings).toEqual([]);
        expect(listGolfBookingsForUser).not.toHaveBeenCalled();
    });
});
