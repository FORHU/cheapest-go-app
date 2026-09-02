import { describe, it, expect } from 'vitest';
import { formatTimeIn, formatDuration, dayOffset, layoverMinutes, normalizedToFlightOffer } from './flight-utils';

// Values taken from the CRK–TPE–ICN offer in the search results.
const DEP = '2026-08-26T12:00:00';
const TPE_IN = '2026-08-26T14:15:00';
const TPE_OUT = '2026-08-26T15:30:00';
const ARR = '2026-08-26T18:45:00';
const ARR_NEXT_DAY = '2026-08-27T11:00:00';

describe('slice row display', () => {
    it('renders Local Airport Time per locale', () => {
        expect(formatTimeIn(DEP, 'en')).toBe('12:00 PM');
        expect(formatTimeIn(ARR, 'en-US')).toBe('6:45 PM');
        // Japanese and Chinese conventions are 24-hour.
        expect(formatTimeIn(ARR, 'ja')).toBe('18:45');
        expect(formatTimeIn(ARR, 'zh')).toBe('18:45');
    });

    it('marks Korean day periods in Korean, marker first', () => {
        // Node's ICU renders these as "AM 8:45" / "PM 6:45" — the reason the marker is
        // our own string rather than CLDR's. GeomeeGo is locked to this locale.
        expect(formatTimeIn('2026-08-26T08:45:00', 'ko')).toBe('오전 8:45');
        expect(formatTimeIn(ARR, 'ko')).toBe('오후 6:45');
        expect(formatTimeIn(ARR, 'ko-KR')).toBe('오후 6:45');
    });

    it('handles both ends of the 12-hour wrap', () => {
        expect(formatTimeIn('2026-08-26T00:10:00', 'en')).toBe('12:10 AM');
        expect(formatTimeIn('2026-08-26T12:00:00', 'en')).toBe('12:00 PM');
        expect(formatTimeIn('2026-08-26T00:10:00', 'ja')).toBe('00:10');
    });

    it('keeps the wall clock when the string carries an offset', () => {
        // An offset must never shift a Local Airport Time.
        expect(formatTimeIn('2026-08-26T18:45:00+09:00', 'en')).toBe('6:45 PM');
        expect(formatTimeIn('2026-08-26T18:45:00Z', 'ja')).toBe('18:45');
    });

    it('measures a layover exactly, both times being at one airport', () => {
        expect(layoverMinutes(TPE_IN, TPE_OUT)).toBe(75);
        expect(formatDuration(layoverMinutes(TPE_IN, TPE_OUT))).toBe('1h 15m');
    });

    it('measures a layover across midnight', () => {
        expect(layoverMinutes('2026-08-26T23:30:00', '2026-08-27T01:00:00')).toBe(90);
    });

    it('marks an arrival that lands on a later calendar day', () => {
        expect(dayOffset(DEP, ARR)).toBe(0);
        expect(dayOffset(DEP, ARR_NEXT_DAY)).toBe(1);
    });

    it('degrades to a placeholder rather than a wrong time', () => {
        expect(formatTimeIn(undefined, 'en')).toBe('--:--');
        expect(formatTimeIn('not-a-date', 'en')).toBe('--:--');
        expect(layoverMinutes(undefined, TPE_OUT)).toBe(0);
        expect(dayOffset(DEP, undefined)).toBe(0);
    });
});

/**
 * Duffel returns origin_terminal/destination_terminal on most CRK–ICN segments (15 of 17
 * on a live sample), and parseDuffelOffer nests them as departure.terminal. This transform
 * read the flat seg.terminal instead, so the terminal was discarded here — before the
 * client, before the book payload, before flight_segments. Every downstream surface then
 * correctly rendered nothing, which read as "the supplier doesn't send terminals".
 */
describe('normalizedToFlightOffer terminals', () => {
    const duffelSegment = {
        segmentIndex: 0,
        airline: '7C', flightNumber: '7C2108',
        origin: 'CRK', destination: 'ICN',
        departure: { airport: 'CRK', terminal: '2', time: '2026-11-15T10:50:00' },
        arrival: { airport: 'ICN', terminal: '1', time: '2026-11-15T15:48:00' },
        duration: 178, cabinClass: 'economy',
    };

    it('keeps the terminal parseDuffelOffer nested under departure/arrival', () => {
        const offer = normalizedToFlightOffer({ id: 'off_1', segments: [duffelSegment] } as any, 'one-way');
        expect(offer.segments[0].departure.terminal).toBe('2');
        expect(offer.segments[0].arrival.terminal).toBe('1');
    });

    it('still reads Mystifly\'s flat shape', () => {
        const offer = normalizedToFlightOffer({
            id: 'off_2',
            segments: [{ ...duffelSegment, departure: { airport: 'CRK', time: '2026-11-15T10:50:00' },
                         arrival: { airport: 'ICN', time: '2026-11-15T15:48:00' },
                         terminal: '3', arrivalTerminal: '4' }],
        } as any, 'one-way');
        expect(offer.segments[0].departure.terminal).toBe('3');
        expect(offer.segments[0].arrival.terminal).toBe('4');
    });

    it('leaves the terminal undefined when no shape carries one', () => {
        const offer = normalizedToFlightOffer({
            id: 'off_3',
            segments: [{ ...duffelSegment, departure: { airport: 'CRK', time: '2026-11-15T10:50:00' },
                         arrival: { airport: 'ICN', time: '2026-11-15T15:48:00' } }],
        } as any, 'one-way');
        expect(offer.segments[0].departure.terminal).toBeUndefined();
        expect(offer.segments[0].arrival.terminal).toBeUndefined();
    });
});
