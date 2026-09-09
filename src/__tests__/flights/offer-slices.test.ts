import { describe, it, expect } from 'vitest';
import { offerSlices } from '@/lib/flights/offer-slices';
import type { FlightOffer, FlightSegmentDetail } from '@/types/flights';

function seg(
    sliceIndex: number,
    from: string,
    to: string,
    departure: string,
    arrival: string,
): FlightSegmentDetail {
    return {
        segmentIndex: sliceIndex,
        airline: { code: 'UA', name: 'United Airlines' },
        origin: from,
        destination: to,
        flightNumber: `UA${from}${to}`,
        departure: { airport: from, time: departure },
        arrival: { airport: to, time: arrival },
        duration: 0,
        stops: 0,
        cabinClass: 'economy',
    };
}

function offer(segments: FlightSegmentDetail[], overrides: Partial<FlightOffer> = {}): FlightOffer {
    return {
        offerId: 'off_1',
        provider: 'duffel',
        price: { total: 500, base: 400, taxes: 100, currency: 'USD', pricePerAdult: 500 },
        segments,
        totalDuration: 0,
        totalStops: 0,
        refundable: false,
        ...overrides,
    } as FlightOffer;
}

describe('offerSlices', () => {
    it('counts stops within each slice, not across the whole trip', () => {
        // A round trip with one stop each way. The traveller makes one stop on the way
        // out and one on the way back — never "two stops" on any flight they board.
        const roundTrip = offer([
            seg(0, 'SFO', 'DEN', '2026-09-12T08:00:00', '2026-09-12T11:30:00'),
            seg(0, 'DEN', 'JFK', '2026-09-12T12:45:00', '2026-09-12T18:40:00'),
            seg(1, 'JFK', 'ORD', '2026-09-16T07:15:00', '2026-09-16T09:05:00'),
            seg(1, 'ORD', 'SFO', '2026-09-16T10:00:00', '2026-09-16T13:20:00'),
        ]);

        const slices = offerSlices(roundTrip);

        expect(slices).toHaveLength(2);
        expect(slices[0].stops).toBe(1);
        expect(slices[1].stops).toBe(1);
    });

    it("reports each slice's own endpoints, so a return leg never lands at the origin", () => {
        const roundTrip = offer([
            seg(0, 'SFO', 'DEN', '2026-09-12T08:00:00', '2026-09-12T11:30:00'),
            seg(0, 'DEN', 'JFK', '2026-09-12T12:45:00', '2026-09-12T18:40:00'),
            seg(1, 'JFK', 'ORD', '2026-09-16T07:15:00', '2026-09-16T09:05:00'),
            seg(1, 'ORD', 'SFO', '2026-09-16T10:00:00', '2026-09-16T13:20:00'),
        ]);

        const [outbound, inbound] = offerSlices(roundTrip);

        expect(outbound.departure.airport).toBe('SFO');
        expect(outbound.departure.time).toBe('2026-09-12T08:00:00');
        expect(outbound.arrival.airport).toBe('JFK');
        expect(outbound.arrival.time).toBe('2026-09-12T18:40:00');
        expect(inbound.departure.airport).toBe('JFK');
        expect(inbound.arrival.airport).toBe('SFO');
    });

    it("takes each slice's duration from the provider, not from the timestamps", () => {
        // The timestamps carry no UTC offset, so subtracting them is wrong by the
        // timezone gap. sliceDurations is the provider's own quoted elapsed time.
        const roundTrip = offer(
            [
                seg(0, 'SFO', 'DEN', '2026-09-12T08:00:00', '2026-09-12T11:30:00'),
                seg(0, 'DEN', 'JFK', '2026-09-12T12:45:00', '2026-09-12T18:40:00'),
                seg(1, 'JFK', 'SFO', '2026-09-16T07:15:00', '2026-09-16T10:45:00'),
            ],
            { sliceDurations: [400, 425], totalDuration: 825 },
        );

        const [outbound, inbound] = offerSlices(roundTrip);

        expect(outbound.durationMinutes).toBe(400);
        expect(inbound.durationMinutes).toBe(425);
    });

    it('leaves duration absent when the provider quoted none, rather than guessing', () => {
        const oneWay = offer([
            seg(0, 'SFO', 'DEN', '2026-09-12T08:00:00', '2026-09-12T11:30:00'),
            seg(0, 'DEN', 'JFK', '2026-09-12T12:45:00', '2026-09-12T18:40:00'),
        ]);

        expect(offerSlices(oneWay)[0].durationMinutes).toBeUndefined();
    });

    it('treats segments with no segmentIndex as one slice rather than splitting them', () => {
        // Splitting an unlabelled array down the middle invented a return leg out of a
        // one-way's second half: a 1-stop SFO→JFK became "SFO→DEN" plus a "return"
        // that was really DEN→JFK.
        const unlabelled = offer([
            { ...seg(0, 'SFO', 'DEN', '2026-09-12T08:00:00', '2026-09-12T11:30:00'), segmentIndex: undefined },
            { ...seg(0, 'DEN', 'JFK', '2026-09-12T12:45:00', '2026-09-12T18:40:00'), segmentIndex: undefined },
        ] as unknown as FlightSegmentDetail[]);

        const slices = offerSlices(unlabelled);

        expect(slices).toHaveLength(1);
        expect(slices[0].stops).toBe(1);
        expect(slices[0].arrival.airport).toBe('JFK');
    });

    it('measures each layover at the airport it happens in', () => {
        // Both times are at the same airport, so their shared UTC offset cancels and
        // this subtraction is exact — unlike a slice duration across two timezones.
        const oneWay = offer([
            seg(0, 'SFO', 'DEN', '2026-09-12T08:00:00', '2026-09-12T11:30:00'),
            seg(0, 'DEN', 'ORD', '2026-09-12T12:45:00', '2026-09-12T15:05:00'),
            seg(0, 'ORD', 'JFK', '2026-09-12T16:00:00', '2026-09-12T18:40:00'),
        ]);

        expect(offerSlices(oneWay)[0].layovers).toEqual([
            { airport: 'DEN', minutes: 75 },
            { airport: 'ORD', minutes: 55 },
        ]);
    });

    it('has no layovers on a nonstop slice', () => {
        const nonstop = offer([seg(0, 'SFO', 'JFK', '2026-09-12T08:00:00', '2026-09-12T16:40:00')]);

        const [slice] = offerSlices(nonstop);

        expect(slice.stops).toBe(0);
        expect(slice.layovers).toEqual([]);
    });
});
