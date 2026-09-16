import { describe, it, expect } from 'vitest';
import type { FlightOffer } from '@/types/flights';
import {
    DEFAULT_FLIGHT_FILTERS,
    activeFilterCount,
    applyFlightFilters,
    filterBounds,
    minutesOfDay,
    offerArrivalAirport,
    type FlightFilterState,
} from '@/lib/flights/filter-offers';

/**
 * What the filter panel asks of a set of offers.
 *
 * The panel's own state is a detail; these are the rules that decide which flights a
 * traveller is left looking at, so they are asserted here rather than through a rendered
 * sidebar.
 */

function offer(over: Partial<FlightOffer> & { id?: string } = {}): FlightOffer {
    const {
        id = 'o1',
        ...rest
    } = over;
    return {
        offerId: id,
        provider: 'duffel',
        price: { total: 400, base: 300, taxes: 100, currency: 'USD', pricePerAdult: 400 },
        segments: [
            {
                segmentIndex: 0,
                airline: { code: 'QR', name: 'Qatar Airways' },
                origin: 'CRK',
                destination: 'LHR',
                flightNumber: 'QR0927',
                departure: { airport: 'CRK', time: '2026-09-23T08:00:00' },
                arrival: { airport: 'LHR', time: '2026-09-23T18:00:00' },
                duration: 600,
                stops: 0,
            },
        ],
        totalDuration: 600,
        sliceDurations: [600],
        totalStops: 0,
        refundable: false,
        tripType: 'one-way',
        normalizedPriceUsd: 400,
        bestScore: 0,
        physicalFlightId: id,
        ...rest,
    } as FlightOffer;
}

const anyFilters = (over: Partial<FlightFilterState> = {}): FlightFilterState => ({
    ...DEFAULT_FLIGHT_FILTERS,
    ...over,
});

/**
 * An offer that really does change plane that many times, per direction.
 *
 * Stops are counted off the segments rather than read from `totalStops`, so a fixture
 * that sets the field without the flights to match would assert nothing — which is how
 * the round-trip bug survived its first set of tests here.
 */
function withStops(id: string, ...stopsPerDirection: number[]): FlightOffer {
    const base = offer().segments[0];
    const segments = stopsPerDirection.flatMap((stops, sliceIndex) =>
        Array.from({ length: stops + 1 }, () => ({ ...base, segmentIndex: sliceIndex })),
    );
    return offer({
        id,
        segments,
        totalStops: stopsPerDirection.reduce((sum, s) => sum + s, 0),
    } as Partial<FlightOffer>);
}

describe('minutesOfDay', () => {
    it('reads the clock out of the string rather than through a Date', () => {
        // An offer's time is Local Airport Time with no offset — building a Date would
        // shift these digits by whatever zone the reader happens to be in.
        expect(minutesOfDay('2026-09-23T08:30:00')).toBe(8 * 60 + 30);
        expect(minutesOfDay('2026-09-23T00:00:00')).toBe(0);
        expect(minutesOfDay('2026-09-23T23:59:00')).toBe(23 * 60 + 59);
    });

    it('returns null for a timestamp it cannot read, rather than a wrong number', () => {
        expect(minutesOfDay(undefined)).toBeNull();
        expect(minutesOfDay('nonsense')).toBeNull();
        expect(minutesOfDay('2026-09-23T99:00:00')).toBeNull();
    });
});

describe('filterBounds', () => {
    it('spans the cheapest and dearest per-person price on offer', () => {
        const bounds = filterBounds([
            offer({ id: 'a', price: { total: 200, base: 0, taxes: 0, currency: 'USD', pricePerAdult: 200 } }),
            offer({ id: 'b', price: { total: 900, base: 0, taxes: 0, currency: 'USD', pricePerAdult: 900 } }),
        ]);

        expect(bounds.price).toEqual([200, 900]);
    });

    it('lists each airline and arrival airport once, in order', () => {
        const bounds = filterBounds([
            offer({ id: 'a', validatingAirline: 'Qatar Airways' }),
            offer({ id: 'b', validatingAirline: 'Emirates' }),
            offer({ id: 'c', validatingAirline: 'Qatar Airways' }),
        ]);

        expect(bounds.airlines).toEqual(['Emirates', 'Qatar Airways']);
        expect(bounds.arrivalAirports).toEqual(['LHR']);
    });

    it('has no range to offer when there are no results', () => {
        expect(filterBounds([])).toEqual({ price: [0, 0], duration: [0, 0], airlines: [], arrivalAirports: [] });
    });
});

describe('applyFlightFilters', () => {
    it('keeps everything when nothing has been narrowed', () => {
        const offers = [offer({ id: 'a' }), offer({ id: 'b' })];

        expect(applyFlightFilters(offers, DEFAULT_FLIGHT_FILTERS)).toHaveLength(2);
    });

    it('reads "2 Stops +" as two or more, not as exactly two', () => {
        const offers = [
            withStops('direct', 0),
            withStops('one', 1),
            withStops('two', 2),
            withStops('three', 3),
        ];

        const twoPlus = applyFlightFilters(offers, anyFilters({ stops: 2 }));
        expect(twoPlus.map(o => o.offerId)).toEqual(['two', 'three']);
    });

    /**
     * A round trip that changes plane once each way is a one-stop trip, and every card
     * says so. `totalStops` is the sum across both directions, so reading it here put
     * those flights under "2 Stops +" while the card beside them read "1 Stop" — the
     * same disagreement stops-agree-across-pages.test.tsx exists to prevent between the
     * search and book screens.
     */
    it('counts stops per direction, as the cards do — not summed across a round trip', () => {
        const roundTrip = offer({
            id: 'oneEachWay',
            totalStops: 2,
            segments: [
                { ...offer().segments[0], segmentIndex: 0, origin: 'CRK', destination: 'DOH' },
                { ...offer().segments[0], segmentIndex: 0, origin: 'DOH', destination: 'LHR' },
                { ...offer().segments[0], segmentIndex: 1, origin: 'LHR', destination: 'DOH' },
                { ...offer().segments[0], segmentIndex: 1, origin: 'DOH', destination: 'CRK' },
            ],
        } as Partial<FlightOffer>);

        expect(applyFlightFilters([roundTrip], anyFilters({ stops: 1 }))).toHaveLength(1);
        expect(applyFlightFilters([roundTrip], anyFilters({ stops: 2 }))).toHaveLength(0);
    });

    it('calls a trip direct only when neither direction changes plane', () => {
        // Selecting "Direct" to be handed a two-stop return is the failure that makes a
        // stops filter worth distrusting.
        const directOutReturnStops = offer({
            id: 'mixed',
            totalStops: 2,
            segments: [
                { ...offer().segments[0], segmentIndex: 0, origin: 'CRK', destination: 'LHR' },
                { ...offer().segments[0], segmentIndex: 1, origin: 'LHR', destination: 'DOH' },
                { ...offer().segments[0], segmentIndex: 1, origin: 'DOH', destination: 'CRK' },
            ],
        } as Partial<FlightOffer>);

        expect(applyFlightFilters([directOutReturnStops], anyFilters({ stops: 0 }))).toHaveLength(0);
        expect(applyFlightFilters([directOutReturnStops], anyFilters({ stops: 1 }))).toHaveLength(1);
    });

    it('reads a single stop as exactly one — not "up to one"', () => {
        const offers = [withStops('direct', 0), withStops('one', 1)];

        expect(applyFlightFilters(offers, anyFilters({ stops: 1 })).map(o => o.offerId)).toEqual(['one']);
    });

    it('bounds the price by what one traveller pays, not by the party total', () => {
        const offers = [
            offer({ id: 'cheap', price: { total: 900, base: 0, taxes: 0, currency: 'USD', pricePerAdult: 300 } }),
            offer({ id: 'dear', price: { total: 900, base: 0, taxes: 0, currency: 'USD', pricePerAdult: 900 } }),
        ];

        const within = applyFlightFilters(offers, anyFilters({ priceRange: [0, 500] }));
        expect(within.map(o => o.offerId)).toEqual(['cheap']);
    });

    it('narrows to flights leaving inside the chosen window', () => {
        const morning = offer({
            id: 'morning',
            segments: [{ ...offer().segments[0], departure: { airport: 'CRK', time: '2026-09-23T07:00:00' } }],
        } as Partial<FlightOffer>);
        const evening = offer({
            id: 'evening',
            segments: [{ ...offer().segments[0], departure: { airport: 'CRK', time: '2026-09-23T21:00:00' } }],
        } as Partial<FlightOffer>);

        const beforeNoon = applyFlightFilters([morning, evening], anyFilters({ departureWindow: [0, 12 * 60] }));
        expect(beforeNoon.map(o => o.offerId)).toEqual(['morning']);
    });

    it('narrows to flights no longer than the chosen duration', () => {
        const short = offer({ id: 'short', sliceDurations: [300], totalDuration: 300 });
        const long = offer({ id: 'long', sliceDurations: [900], totalDuration: 900 });

        const within = applyFlightFilters([short, long], anyFilters({ maxDurationMinutes: 600 }));
        expect(within.map(o => o.offerId)).toEqual(['short']);
    });

    it('narrows to the chosen arrival airports', () => {
        const heathrow = offer({ id: 'lhr' });
        const gatwick = offer({
            id: 'lgw',
            segments: [{ ...offer().segments[0], arrival: { airport: 'LGW', time: '2026-09-23T18:00:00' } }],
        } as Partial<FlightOffer>);

        expect(offerArrivalAirport(gatwick)).toBe('LGW');
        const only = applyFlightFilters([heathrow, gatwick], anyFilters({ selectedArrivalAirports: ['LGW'] }));
        expect(only.map(o => o.offerId)).toEqual(['lgw']);
    });

    it('keeps a flight whose clock cannot be read rather than dropping it silently', () => {
        // A filter should narrow by what it knows. Dropping an offer because its timestamp
        // was shaped unexpectedly hides a flight the traveller could have booked.
        const unreadable = offer({
            id: 'unreadable',
            segments: [{ ...offer().segments[0], departure: { airport: 'CRK', time: 'not-a-time' } }],
        } as Partial<FlightOffer>);

        const kept = applyFlightFilters([unreadable], anyFilters({ departureWindow: [0, 60] }));
        expect(kept).toHaveLength(1);
    });

    it('sorts by per-offer total for cheapest, and by the outbound for fastest', () => {
        const slowCheap = offer({
            id: 'slowCheap',
            price: { total: 100, base: 0, taxes: 0, currency: 'USD', pricePerAdult: 100 },
            sliceDurations: [900],
        });
        const fastDear = offer({
            id: 'fastDear',
            price: { total: 800, base: 0, taxes: 0, currency: 'USD', pricePerAdult: 800 },
            sliceDurations: [200],
        });

        expect(applyFlightFilters([fastDear, slowCheap], anyFilters({ sortBy: 'price' })).map(o => o.offerId))
            .toEqual(['slowCheap', 'fastDear']);
        expect(applyFlightFilters([slowCheap, fastDear], anyFilters({ sortBy: 'duration' })).map(o => o.offerId))
            .toEqual(['fastDear', 'slowCheap']);
    });

    it('leaves the offers it was given untouched', () => {
        // The screen holds one unfiltered list and re-filters it on every change; sorting
        // it in place would quietly reorder that cache.
        const offers = [
            offer({ id: 'b', price: { total: 800, base: 0, taxes: 0, currency: 'USD', pricePerAdult: 800 } }),
            offer({ id: 'a', price: { total: 100, base: 0, taxes: 0, currency: 'USD', pricePerAdult: 100 } }),
        ];

        applyFlightFilters(offers, anyFilters({ sortBy: 'price' }));

        expect(offers.map(o => o.offerId)).toEqual(['b', 'a']);
    });
});

describe('activeFilterCount', () => {
    it('counts what narrows the results, and not the sort', () => {
        expect(activeFilterCount(DEFAULT_FLIGHT_FILTERS)).toBe(0);
        expect(activeFilterCount(anyFilters({ sortBy: 'duration' }))).toBe(0);
        expect(activeFilterCount(anyFilters({ stops: 0, refundableOnly: true, priceRange: [0, 100] }))).toBe(3);
    });
});
