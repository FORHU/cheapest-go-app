import { describe, it, expect } from 'vitest';
import { addDays, dayOfWeek, isIsoDate, isValidTimeZone, localDate, localTime, zonedTimeToUtc } from './time';

describe('isValidTimeZone', () => {
    it('accepts IANA names and refuses anything else', () => {
        expect(isValidTimeZone('Asia/Manila')).toBe(true);
        expect(isValidTimeZone('America/New_York')).toBe(true);
        expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
        expect(isValidTimeZone('')).toBe(false);
    });
});

describe('isIsoDate', () => {
    it('accepts real calendar dates only', () => {
        expect(isIsoDate('2026-10-10')).toBe(true);
        expect(isIsoDate('2026-02-30')).toBe(false);
        expect(isIsoDate('10/10/2026')).toBe(false);
    });
});

describe('zonedTimeToUtc', () => {
    it('reads a wall-clock time in a zone without daylight saving', () => {
        expect(zonedTimeToUtc('2026-10-10', '07:38', 'Asia/Manila').toISOString()).toBe('2026-10-09T23:38:00.000Z');
    });

    it('follows the offset either side of a daylight-saving change', () => {
        expect(zonedTimeToUtc('2026-03-07', '07:00', 'America/New_York').toISOString()).toBe('2026-03-07T12:00:00.000Z');
        expect(zonedTimeToUtc('2026-03-09', '07:00', 'America/New_York').toISOString()).toBe('2026-03-09T11:00:00.000Z');
    });

    it('moves a time the clocks skip to just after the jump', () => {
        // 02:30 does not exist in New York on 8 March 2026; 03:30 EDT does.
        expect(zonedTimeToUtc('2026-03-08', '02:30', 'America/New_York').toISOString()).toBe('2026-03-08T07:30:00.000Z');
    });

    it('takes the first of a time the clocks repeat', () => {
        expect(zonedTimeToUtc('2026-11-01', '01:30', 'America/New_York').toISOString()).toBe('2026-11-01T05:30:00.000Z');
    });
});

describe('localDate / localTime', () => {
    it('reads an instant on the course clock', () => {
        const instant = new Date('2026-10-09T23:38:00Z');
        expect(localDate(instant, 'Asia/Manila')).toBe('2026-10-10');
        expect(localTime(instant, 'Asia/Manila')).toBe('07:38');
    });
});

describe('addDays / dayOfWeek', () => {
    it('does calendar arithmetic across month and year ends', () => {
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });

    it('numbers days from Sunday', () => {
        expect(dayOfWeek('2026-10-10')).toBe(6);
        expect(dayOfWeek('2026-10-11')).toBe(0);
    });
});
