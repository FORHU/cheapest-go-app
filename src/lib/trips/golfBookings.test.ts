import { describe, it, expect } from 'vitest';
import { groupGolfBookings, type TripGolfBooking } from './golfBookings';

const NOW = new Date('2030-01-10T00:00:00Z');

const booking = (over: Partial<TripGolfBooking> = {}): TripGolfBooking => ({
    kind: 'golf', id: 'b1', reference: 'CG-ABC234', status: 'confirmed', courseName: 'Wack Wack', courseSlug: 'wack-wack',
    startsAt: '2030-01-20T00:00:00.000Z', timezone: 'Asia/Manila', players: 2, total: 5000, currency: 'PHP',
    created_at: '2030-01-01T00:00:00.000Z', ...over,
});

const ids = (list: TripGolfBooking[]) => list.map(b => b.id);

describe('groupGolfBookings', () => {
    it('puts a requested or confirmed tee time that is still ahead under upcoming', () => {
        const list = [
            booking({ id: 'requested', status: 'requested' }),
            booking({ id: 'confirmed', status: 'confirmed' }),
        ];
        expect(ids(groupGolfBookings(list, NOW).upcomingGolfBookings)).toEqual(['requested', 'confirmed']);
    });

    it('puts a confirmed tee time that has been played under past', () => {
        const played = booking({ id: 'played', startsAt: '2030-01-05T00:00:00.000Z' });
        const grouped = groupGolfBookings([played], NOW);
        expect(ids(grouped.pastGolfBookings)).toEqual(['played']);
        expect(grouped.upcomingGolfBookings).toEqual([]);
    });

    it('puts declined and cancelled bookings under cancelled, whenever the tee time was', () => {
        const list = [
            booking({ id: 'declined', status: 'declined' }),
            booking({ id: 'cancelled', status: 'cancelled', startsAt: '2030-01-02T00:00:00.000Z' }),
        ];
        const grouped = groupGolfBookings(list, NOW);
        expect(ids(grouped.cancelledGolfBookings)).toEqual(['declined', 'cancelled']);
        expect(grouped.upcomingGolfBookings).toEqual([]);
        expect(grouped.pastGolfBookings).toEqual([]);
    });

    it('keeps every booking in the full list, in the order given', () => {
        const list = [booking({ id: 'a' }), booking({ id: 'b', status: 'cancelled' }), booking({ id: 'c', startsAt: '2030-01-01T00:00:00.000Z' })];
        expect(ids(groupGolfBookings(list, NOW).golfBookings)).toEqual(['a', 'b', 'c']);
    });

    it('treats a tee time starting exactly now as upcoming, as hotels treat check-in today', () => {
        const edge = booking({ id: 'edge', startsAt: NOW.toISOString() });
        expect(ids(groupGolfBookings([edge], NOW).upcomingGolfBookings)).toEqual(['edge']);
    });
});
