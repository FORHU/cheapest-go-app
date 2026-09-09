import { describe, it, expect } from 'vitest';
import { sliceTimeline } from '@/lib/flights/itinerary-timeline';
import { offerSlices } from '@/lib/flights/offer-slices';
import type { FlightOffer, FlightSegmentDetail } from '@/types/flights';

/**
 * The timeline draws a slice as the traveller walks it: depart, fly, arrive, wait,
 * depart again. Each leg therefore needs the connection that FOLLOWS it, and the last
 * leg of a slice needs none — a layover after the final arrival is a journey that never
 * ends. Resolving that pairing here keeps it out of JSX, where an off-by-one shows up as
 * a phantom layover rather than a failing test.
 */

function seg(
    sliceIndex: number,
    from: string,
    to: string,
    departure: string,
    arrival: string,
    overrides: Partial<FlightSegmentDetail> = {},
): FlightSegmentDetail {
    return {
        segmentIndex: sliceIndex,
        airline: { code: 'QR', name: 'Qatar Airways' },
        origin: from,
        destination: to,
        flightNumber: `QR0${from}`,
        departure: { airport: from, time: departure },
        arrival: { airport: to, time: arrival },
        duration: 0,
        stops: 0,
        cabinClass: 'economy',
        ...overrides,
    };
}

function offer(segments: FlightSegmentDetail[], overrides: Partial<FlightOffer> = {}): FlightOffer {
    return {
        offerId: 'off_1',
        provider: 'duffel',
        price: { total: 1038.7, base: 900, taxes: 138.7, currency: 'USD', pricePerAdult: 1038.7 },
        segments,
        totalDuration: 1535,
        totalStops: 1,
        refundable: false,
        ...overrides,
    } as FlightOffer;
}

// CRK → DOH → LHR, the reference itinerary.
const oneStop = offer([
    seg(0, 'CRK', 'DOH', '2026-09-23T18:40:00', '2026-09-23T22:30:00', {
        duration: 530,
        flightNumber: 'QR0927',
        aircraft: 'Boeing 787-8',
        baggage: { carryOnBags: 1, checkedBags: 1 },
    }),
    seg(0, 'DOH', 'LHR', '2026-09-24T08:00:00', '2026-09-24T13:15:00', {
        duration: 435,
        flightNumber: 'QR0003',
        aircraft: 'Airbus A380-800',
        baggage: { carryOnBags: 1, checkedBags: 1 },
    }),
], { sliceDurations: [1535] });

describe('sliceTimeline', () => {
    it('gives one leg per flight the traveller boards', () => {
        const legs = sliceTimeline(offerSlices(oneStop)[0]);

        expect(legs).toHaveLength(2);
        expect(legs[0].segment.flightNumber).toBe('QR0927');
        expect(legs[1].segment.flightNumber).toBe('QR0003');
    });

    it('hangs each connection off the leg it follows', () => {
        const [first, second] = sliceTimeline(offerSlices(oneStop)[0]);

        expect(first.layover).toEqual({ airportCode: 'DOH', airportName: 'Hamad International Airport', minutes: 570 });
        // Nothing follows the last leg — the journey is over.
        expect(second.layover).toBeUndefined();
    });

    it('names the airport in full, and falls back to the code when it is unknown', () => {
        const legs = sliceTimeline(offerSlices(oneStop)[0]);

        expect(legs[0].departure.airportName).toBe('Clark International Airport');
        expect(legs[0].departure.airportCode).toBe('CRK');
        expect(legs[1].arrival.airportName).toBe('Heathrow Airport');

        const unknown = offer([seg(0, 'ZZZ', 'CRK', '2026-09-23T08:00:00', '2026-09-23T10:00:00', { duration: 120 })]);
        expect(sliceTimeline(offerSlices(unknown)[0])[0].departure.airportName).toBe('ZZZ');
    });

    it("takes each leg's duration from the provider's own figure", () => {
        const legs = sliceTimeline(offerSlices(oneStop)[0]);

        expect(legs[0].durationMinutes).toBe(530);
        expect(legs[1].durationMinutes).toBe(435);
    });

    it('leaves a leg duration absent when no provider quoted one', () => {
        const noDuration = offer([seg(0, 'CRK', 'DOH', '2026-09-23T18:40:00', '2026-09-23T22:30:00', { duration: 0 })]);

        expect(sliceTimeline(offerSlices(noDuration)[0])[0].durationMinutes).toBeUndefined();
    });

    it('carries the terminal when the airline named one', () => {
        const withTerminal = offer([
            seg(0, 'CRK', 'DOH', '2026-09-23T18:40:00', '2026-09-23T22:30:00', {
                duration: 530,
                arrival: { airport: 'DOH', terminal: '1', time: '2026-09-23T22:30:00' },
            }),
        ]);

        expect(sliceTimeline(offerSlices(withTerminal)[0])[0].arrival.terminal).toBe('1');
    });

    it('draws a nonstop slice as a single leg with no connection', () => {
        const nonstop = offer([seg(0, 'CRK', 'LHR', '2026-09-23T18:40:00', '2026-09-24T13:15:00', { duration: 900 })]);

        const legs = sliceTimeline(offerSlices(nonstop)[0]);

        expect(legs).toHaveLength(1);
        expect(legs[0].layover).toBeUndefined();
    });
});
