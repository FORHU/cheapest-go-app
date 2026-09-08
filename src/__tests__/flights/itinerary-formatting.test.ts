import { describe, it, expect } from 'vitest';
import { formatDurationLong, formatDateTimeIn, formatPriceWithCents } from '@/utils/flight-utils';

/**
 * The itinerary timeline writes durations and datetimes the way the reference does:
 * `08h 50m`, `1d 01h 35m`, `Wed, Sep 23, 2026, 6:40 PM`. Both are zero-padded and
 * both read a Local Airport Time, which carries no UTC offset — so neither may be
 * built from a Date the runtime is free to shift.
 */

describe('formatDurationLong', () => {
    it('pads hours and minutes to two digits', () => {
        expect(formatDurationLong(530)).toBe('08h 50m');
        expect(formatDurationLong(570)).toBe('09h 30m');
    });

    it('breaks out whole days once a journey passes twenty-four hours', () => {
        // 25h 35m — the reference writes this as "1d 01h 35m", not "25h 35m".
        expect(formatDurationLong(1535)).toBe('1d 01h 35m');
    });

    it('shows a day with no remainder as a flat day', () => {
        expect(formatDurationLong(1440)).toBe('1d 00h 00m');
    });

    it('still pads a journey shorter than an hour', () => {
        expect(formatDurationLong(45)).toBe('00h 45m');
    });

    it('treats a missing or negative duration as nothing to show', () => {
        expect(formatDurationLong(0)).toBe('');
        expect(formatDurationLong(-10)).toBe('');
        expect(formatDurationLong(undefined)).toBe('');
    });
});

describe('formatDateTimeIn', () => {
    it('writes the full date and the clock the traveller reads', () => {
        expect(formatDateTimeIn('2026-09-23T18:40:00', 'en')).toBe('Wed, Sep 23, 2026, 6:40 PM');
    });

    it('does not shift a just-after-midnight departure to the day before', () => {
        expect(formatDateTimeIn('2026-09-23T00:30:00', 'en')).toBe('Wed, Sep 23, 2026, 12:30 AM');
    });

    it('does not shift a late-night arrival to the day after', () => {
        expect(formatDateTimeIn('2026-09-23T23:45:00', 'en')).toBe('Wed, Sep 23, 2026, 11:45 PM');
    });

    it('uses the same clock convention as the rest of the app', () => {
        // Japanese renders a 24-hour clock; the date half localises with it.
        expect(formatDateTimeIn('2026-09-23T18:40:00', 'ja')).toBe('2026年9月23日(水), 18:40');
    });

    it('returns nothing for a missing time rather than a fabricated date', () => {
        expect(formatDateTimeIn(undefined, 'en')).toBe('');
    });
});

describe('formatPriceWithCents', () => {
    // The card design states the fare to the cent. `formatPrice` rounds to whole units
    // for every price in the app, hotels included, so this is its own formatter rather
    // than a change to that one.
    it('states the fare to the cent', () => {
        expect(formatPriceWithCents(1038.7, 'USD')).toBe('$1,038.70');
    });

    it('keeps trailing zeroes so a round fare still reads as money', () => {
        expect(formatPriceWithCents(1039, 'USD')).toBe('$1,039.00');
    });

    it('converts before formatting when a display currency is asked for', () => {
        // The rate belongs to the currency table, not to this formatter — what matters
        // here is that conversion happens and the cents survive it.
        const converted = formatPriceWithCents(100, 'USD', 'PHP');
        expect(converted).toMatch(/\.\d{2}$/);
        expect(converted).not.toBe(formatPriceWithCents(100, 'USD'));
    });

    it('leaves an amount alone when the display currency is the fare currency', () => {
        expect(formatPriceWithCents(1038.7, 'USD', 'USD')).toBe('$1,038.70');
    });
});
