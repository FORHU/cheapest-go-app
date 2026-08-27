import { describe, expect, it } from 'vitest';
import { dateRange, hotelItinerary, flightItinerary } from './itinerary';
import type { FlightSegmentSummary, PassengerSummary } from '@/types/admin';

/**
 * The admin list needs one line that identifies a booking well enough for an agent to
 * match it to a caller. Before this, the columns were reference, customer, ticket,
 * status and money — nothing naming the hotel or the flight.
 */

const seg = (over: Partial<FlightSegmentSummary> = {}): FlightSegmentSummary => ({
    airline: 'PR',
    flightNumber: '431',
    origin: 'MNL',
    destination: 'NRT',
    departure: '2026-09-09T14:20:00Z',
    ...over,
});

describe('dateRange', () => {
    it('renders a stay as a range', () => {
        expect(dateRange('2026-09-09', '2026-09-11')).toMatch(/^9 Sept? – 11 Sept?$/);
    });

    it('renders a single date when there is no end', () => {
        expect(dateRange('2026-09-09')).toMatch(/^9 Sept?$/);
    });

    it('is empty when there is no date', () => {
        expect(dateRange(null)).toBe('');
        expect(dateRange(undefined, '2026-09-11')).toBe('');
    });

    it('is empty rather than "Invalid Date" for junk', () => {
        expect(dateRange('not-a-date')).toBe('');
    });
});

describe('hotelItinerary', () => {
    it('names the property and the nights', () => {
        const it_ = hotelItinerary({
            property_name: 'Hilton Cebu',
            room_name: 'Deluxe Twin',
            check_in: '2026-09-09',
            check_out: '2026-09-11',
            guests_adults: 2,
            guests_children: 1,
        });
        expect(it_.summary).toMatch(/^Hilton Cebu · 9 Sept? – 11 Sept?$/);
        expect(it_.roomName).toBe('Deluxe Twin');
        expect(it_.adults).toBe(2);
        expect(it_.children).toBe(1);
    });

    it('falls back to the room when the property is missing', () => {
        expect(hotelItinerary({ room_name: 'Standard Double', check_in: '2026-09-09' }).summary)
            .toMatch(/^Standard Double · 9 Sept?$/);
    });

    it('never produces an empty summary', () => {
        // A blank cell in the table reads as a loading fault, not as missing data.
        expect(hotelItinerary({}).summary).toBe('Hotel booking');
    });
});

describe('flightItinerary', () => {
    const pax: PassengerSummary[] = [{ name: 'Maria Reyes', type: 'ADT', ticketNumber: '0794' }];

    it('names the carrier, the route and the date', () => {
        expect(flightItinerary([seg()], pax).summary).toMatch(/^PR 431 · MNL→NRT · 9 Sept?$/);
    });

    it('names the whole journey, not the first leg', () => {
        // A connection via Incheon is still a trip to Tokyo. Showing MNL→ICN hides
        // where the traveller is actually going.
        const summary = flightItinerary(
            [seg({ destination: 'ICN' }), seg({ origin: 'ICN', destination: 'NRT', flightNumber: '432' })],
            pax,
        ).summary;
        expect(summary).toContain('MNL→NRT');
        expect(summary).not.toContain('ICN');
    });

    it('keeps every segment for the detail view', () => {
        const result = flightItinerary([seg(), seg({ flightNumber: '432' })], pax);
        expect(result.segments).toHaveLength(2);
        expect(result.passengers).toHaveLength(1);
    });

    it('omits empty segment and passenger lists rather than rendering blanks', () => {
        const result = flightItinerary([], []);
        expect(result.segments).toBeUndefined();
        expect(result.passengers).toBeUndefined();
        expect(result.summary).toBe('Flight booking');
    });

    it('copes with a segment missing its airline', () => {
        expect(flightItinerary([seg({ airline: '' })], pax).summary).toMatch(/^431 · MNL→NRT · 9 Sept?$/);
    });
});
