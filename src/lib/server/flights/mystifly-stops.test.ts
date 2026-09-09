import { describe, it, expect } from 'vitest';
import { normalizeMystiflyV2Results } from './mystifly-client';

/**
 * `stops` on a normalized result is trip-wide: Duffel sums every slice
 * (`slices.reduce((acc, s) => acc + s.segments.length - 1)`), and the maxStops filter
 * compares offers from both providers against the same number.
 *
 * Mystifly counted the outbound leg only, so a round trip stopping once each way came
 * back as "1" from Mystifly and "2" from Duffel — the same journey, filtered and
 * displayed differently depending on who sold the ticket.
 */

function segment(ref: string, from: string, to: string, dep: string, arr: string, minutes: number) {
    return {
        SegmentRef: ref,
        DepartureAirportLocationCode: from,
        ArrivalAirportLocationCode: to,
        DepartureDateTime: dep,
        ArrivalDateTime: arr,
        JourneyDuration: minutes,
        MarketingCarriercode: 'UA',
        MarketingFlightNumber: ref,
        CabinClassCode: 'Y',
    };
}

// One stop each way: SFO→DEN→JFK out, JFK→ORD→SFO back.
const roundTrip = {
    Data: {
        PricedItineraries: [{ FareSourceCode: 'fsc_1', FareRef: 'fare_1', OriginDestinations: [
            { SegmentRef: 's1', ItineraryRef: 'out' },
            { SegmentRef: 's2', ItineraryRef: 'out' },
            { SegmentRef: 's3', ItineraryRef: 'ret' },
            { SegmentRef: 's4', ItineraryRef: 'ret' },
        ] }],
        FlightFaresList: [{ FareRef: 'fare_1', Currency: 'USD', PassengerFare: [
            { PaxType: 'ADT', TotalFare: '500', BaseFare: '400', Quantity: 1 },
        ] }],
        FlightSegmentList: [
            segment('s1', 'SFO', 'DEN', '2026-09-12T08:00:00', '2026-09-12T11:30:00', 210),
            segment('s2', 'DEN', 'JFK', '2026-09-12T12:45:00', '2026-09-12T18:40:00', 190),
            segment('s3', 'JFK', 'ORD', '2026-09-16T07:15:00', '2026-09-16T09:05:00', 170),
            segment('s4', 'ORD', 'SFO', '2026-09-16T10:00:00', '2026-09-16T13:20:00', 255),
        ],
    },
};

describe('normalizeMystiflyV2Results stops', () => {
    it('counts stops across the whole trip, the way Duffel does', () => {
        const [result] = normalizeMystiflyV2Results(roundTrip);

        // One stop out plus one stop back. Duffel reports 2 for this journey.
        expect(result.stops).toBe(2);
    });

    it('reports one duration per slice so a row can show the leg it displays', () => {
        const [result] = normalizeMystiflyV2Results(roundTrip);

        expect(result.sliceDurations).toEqual([400, 425]);
    });

    it('still reports a one-way with one connection as a single stop', () => {
        const oneWay = {
            Data: {
                ...roundTrip.Data,
                PricedItineraries: [{ FareSourceCode: 'fsc_2', FareRef: 'fare_1', OriginDestinations: [
                    { SegmentRef: 's1', ItineraryRef: 'out' },
                    { SegmentRef: 's2', ItineraryRef: 'out' },
                ] }],
            },
        };

        const [result] = normalizeMystiflyV2Results(oneWay);

        expect(result.stops).toBe(1);
        expect(result.sliceDurations).toEqual([400]);
    });

    it('reports a nonstop one-way as zero', () => {
        const nonstop = {
            Data: {
                ...roundTrip.Data,
                PricedItineraries: [{ FareSourceCode: 'fsc_3', FareRef: 'fare_1', OriginDestinations: [
                    { SegmentRef: 's1', ItineraryRef: 'out' },
                ] }],
            },
        };

        expect(normalizeMystiflyV2Results(nonstop)[0].stops).toBe(0);
    });
});
