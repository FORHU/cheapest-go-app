import { describe, expect, it } from 'vitest';
import { buildItinerarySlices, formatDurationShort, tripSummaryFromSlices } from './itinerary-view';

/**
 * The receipt draws one card per slice (Depart / Return) and a one-line trip summary
 * above them. Both must be derived the same way for the web page and the PDF, so this
 * covers the grouping and arithmetic once rather than twice — see ADR-0042 on why the
 * two renderers drifting apart is a real, previously-shipped bug.
 */

const seg = (over: Partial<Parameters<typeof buildItinerarySlices>[0][number]> = {}) => ({
    airline: 'ZZ',
    flight_number: '3678',
    origin: 'CRK',
    destination: 'LHR',
    departure: '2026-09-23T09:01:00Z',
    arrival: '2026-09-23T16:50:00Z',
    cabin_class: 'economy',
    itinerary_index: 0,
    ...over,
});

describe('buildItinerarySlices', () => {
    it('collapses a connecting slice into one card spanning its first departure and last arrival', () => {
        const [slice] = buildItinerarySlices([
            seg({ flight_number: '100', origin: 'CRK', destination: 'HKG', departure: '2026-09-23T09:00:00Z', arrival: '2026-09-23T11:00:00Z' }),
            seg({ flight_number: '200', origin: 'HKG', destination: 'LHR', departure: '2026-09-23T13:00:00Z', arrival: '2026-09-23T20:00:00Z' }),
        ]);

        // The layover between the two segments counts toward the slice's duration —
        // a traveller waiting at HKG is still travelling, and a stop is a stop.
        expect(slice.origin).toBe('CRK');
        expect(slice.destination).toBe('LHR');
        expect(slice.stops).toBe(1);
        expect(slice.durationMinutes).toBe(11 * 60);
    });

    it('labels the first two slices Depart and Return, in departure order regardless of input order', () => {
        const slices = buildItinerarySlices([
            seg({ itinerary_index: 1, departure: '2026-09-27T09:00:00Z', arrival: '2026-09-27T12:00:00Z' }),
            seg({ itinerary_index: 0, departure: '2026-09-23T09:00:00Z', arrival: '2026-09-23T12:00:00Z' }),
        ]);

        expect(slices.map((s) => s.label)).toEqual(['depart', 'return']);
    });

    it('marks a next-day arrival with a day offset, computed on the stored instants rather than assumed', () => {
        const [slice] = buildItinerarySlices([
            seg({ departure: '2026-09-23T17:01:00Z', arrival: '2026-09-24T00:50:00Z' }),
        ]);

        expect(slice.arrivalDayOffset).toBe(1);
    });

    it('reports zero stops and no day offset for a plain same-day direct segment', () => {
        const [slice] = buildItinerarySlices([seg()]);

        expect(slice.stops).toBe(0);
        expect(slice.arrivalDayOffset).toBe(0);
    });
});

describe('formatDurationShort', () => {
    it('renders hours and minutes', () => {
        expect(formatDurationShort(889)).toBe('14h 49m');
    });

    it('drops the minutes when the duration lands on the hour', () => {
        expect(formatDurationShort(120)).toBe('2h');
    });

    it('renders under an hour as minutes alone', () => {
        expect(formatDurationShort(45)).toBe('45m');
    });

    it('renders nothing for a duration that cannot be real', () => {
        expect(formatDurationShort(0)).toBe('');
        expect(formatDurationShort(-5)).toBe('');
        expect(formatDurationShort(NaN)).toBe('');
    });
});

describe('tripSummaryFromSlices', () => {
    it('takes the route and trip type from the outbound slice, and the return date from the second', () => {
        const slices = buildItinerarySlices([
            seg({ itinerary_index: 0, origin: 'CRK', destination: 'LHR', departure: '2026-09-23T09:00:00Z' }),
            seg({ itinerary_index: 1, origin: 'LHR', destination: 'CRK', departure: '2026-09-26T19:21:00Z' }),
        ]);

        const summary = tripSummaryFromSlices(slices, 'round-trip');

        expect(summary).toMatchObject({ origin: 'CRK', destination: 'LHR', tripType: 'round-trip' });
        expect(summary?.endDate?.toISOString()).toBe('2026-09-26T19:21:00.000Z');
    });

    it('has no return date for a one-way trip', () => {
        const slices = buildItinerarySlices([seg({ itinerary_index: 0 })]);
        const summary = tripSummaryFromSlices(slices, 'one-way');

        expect(summary?.endDate).toBeNull();
    });

    it('is null when there is no itinerary to summarise', () => {
        expect(tripSummaryFromSlices([], 'one-way')).toBeNull();
    });
});
