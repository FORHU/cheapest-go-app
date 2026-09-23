import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * These exist because the failure they cover is silent. Both receipts asked for
 * `flight_segments(*), passengers(*)` with Supabase embed syntax; the query builder
 * drops any selector containing a bracket, returns the base row, and reports success.
 * Nothing threw, so every flight receipt shipped with an empty itinerary and an empty
 * passenger list until someone looked at one.
 */

const eq = vi.fn();
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock('@/utils/postgres/admin', () => ({
    createAdminClient: () => ({ from }),
}));

const { loadFlightBookingRelations } = await import('./flight-booking-relations');

const segment = (index: number, departure: string, flightNumber: string) => ({
    airline: 'PR',
    flight_number: flightNumber,
    origin: 'CRK',
    destination: 'PUS',
    departure,
    arrival: departure,
    itinerary_index: index,
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('loadFlightBookingRelations', () => {
    it('reads both relations without embed syntax', async () => {
        eq.mockResolvedValue({ data: [] });

        await loadFlightBookingRelations('booking-1');

        expect(from).toHaveBeenCalledWith('flight_segments');
        expect(from).toHaveBeenCalledWith('passengers');
        // A selector containing a bracket is silently discarded by the query builder,
        // which is the whole reason this module exists.
        for (const call of select.mock.calls) {
            expect(String(call[0])).not.toContain('(');
        }
    });

    it('orders segments by slice, then by departure within a slice', async () => {
        eq.mockImplementation((_col: string, _val: string) => {
            if (from.mock.calls[from.mock.calls.length - 1][0] === 'passengers') {
                return Promise.resolve({ data: [] });
            }
            return Promise.resolve({
                data: [
                    segment(1, '2026-10-09T09:00:00Z', 'RETURN'),
                    segment(0, '2026-10-02T14:00:00Z', 'OUT-2'),
                    segment(0, '2026-10-02T06:00:00Z', 'OUT-1'),
                ],
            });
        });

        const { segments } = await loadFlightBookingRelations('booking-1');

        expect(segments.map((s) => s.flight_number)).toEqual(['OUT-1', 'OUT-2', 'RETURN']);
    });

    it('returns empty lists rather than undefined when a booking has no rows', async () => {
        eq.mockResolvedValue({ data: null });

        const relations = await loadFlightBookingRelations('booking-1');

        expect(relations.segments).toEqual([]);
        expect(relations.passengers).toEqual([]);
    });
});
