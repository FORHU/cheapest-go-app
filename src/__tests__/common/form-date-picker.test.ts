/**
 * Regression: on the flight-booking passenger form, changing only the birthdate
 * YEAR (or month) didn't update the field — the value only changed when a day
 * was clicked. The picker tracked navigation (currentMonth) separately from the
 * committed value and never synced year/month changes back through onChange.
 *
 * dateForMonthYear is the commit logic the year input, year grid, and month grid
 * now call: re-place the selected day into the chosen year/month.
 */
import { describe, it, expect } from 'vitest';
import { dateForMonthYear } from '@/components/common/FormDatePicker';

describe('dateForMonthYear', () => {
    it('changes the year while keeping month and day', () => {
        const selected = new Date(2022, 6, 21); // 2022-07-21
        expect(dateForMonthYear(selected, 2000, 6)).toBe('2000-07-21');
        expect(dateForMonthYear(selected, 1990, 6)).toBe('1990-07-21');
    });

    it('changes the month while keeping year and day', () => {
        const selected = new Date(2022, 6, 21); // 2022-07-21
        expect(dateForMonthYear(selected, 2022, 0)).toBe('2022-01-21');
    });

    it('clamps the day to the target month length', () => {
        const selected = new Date(2021, 0, 31); // Jan 31
        // Feb 2021 has 28 days -> clamp to 28
        expect(dateForMonthYear(selected, 2021, 1)).toBe('2021-02-28');
        // Feb 2020 is a leap year -> 29
        expect(dateForMonthYear(new Date(2020, 0, 31), 2020, 1)).toBe('2020-02-29');
    });

    it('respects maxDate (e.g. birthdate cannot be in the future)', () => {
        const selected = new Date(2022, 6, 21);
        const maxDate = new Date(2026, 6, 16); // today = 2026-07-16
        // Picking year 2026 with day 21 would be 2026-07-21 > max -> clamp to max
        expect(dateForMonthYear(selected, 2026, 6, undefined, maxDate)).toBe('2026-07-16');
        // A past year is untouched
        expect(dateForMonthYear(selected, 2000, 6, undefined, maxDate)).toBe('2000-07-21');
    });

    it('respects minDate', () => {
        const selected = new Date(2010, 5, 15);
        const minDate = new Date(2005, 0, 1);
        expect(dateForMonthYear(selected, 2000, 5, minDate)).toBe('2005-01-01');
        expect(dateForMonthYear(selected, 2008, 5, minDate)).toBe('2008-06-15');
    });
});
