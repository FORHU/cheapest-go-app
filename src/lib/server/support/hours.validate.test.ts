import { describe, it, expect } from 'vitest';
import { validateSupportHours } from './hours';

/**
 * Checking hours on the way *in*, which is the opposite job from reading them.
 *
 * `parseSupportHours` forgives anything, because a typo in a settings row must not take
 * the widget down — it falls back to the published hours and carries on. Saving cannot
 * forgive: silently storing something different from what was typed means an operator sets
 * Saturday cover, sees it accepted, and finds out on Saturday that it was dropped.
 */

const good = {
    timezone: 'Asia/Manila',
    days: {
        mon: { open: '09:00', close: '18:00' },
        sat: null,
    },
};

describe('validateSupportHours', () => {
    it('accepts a well-formed schedule', () => {
        const result = validateSupportHours(good);

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.hours.days.mon).toEqual({ open: '09:00', close: '18:00' });
    });

    it('accepts a desk that is closed every day', () => {
        // A legitimate state: nobody is covering support this week. The widget copes —
        // the model still answers, and escalation still queues.
        const result = validateSupportHours({
            timezone: 'Asia/Manila',
            days: { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null },
        });

        expect(result.ok).toBe(true);
    });

    it('accepts a day that runs past midnight', () => {
        const result = validateSupportHours({
            timezone: 'Asia/Manila',
            days: { mon: { open: '22:00', close: '02:00' } },
        });

        expect(result.ok).toBe(true);
    });

    it('refuses a timezone that is not a real zone', () => {
        // Silently falling back here would close the desk in a place nobody chose.
        const result = validateSupportHours({ ...good, timezone: 'Asia/Manilla' });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/timezone/i);
    });

    it('refuses a time that is not a 24-hour clock', () => {
        const result = validateSupportHours({
            timezone: 'Asia/Manila',
            days: { mon: { open: '9am', close: '6pm' } },
        });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/mon/i);
    });

    it('refuses a window that opens and closes at the same moment', () => {
        // It means "closed" to the reader, and almost certainly means "I mistyped" to the
        // person who entered it. Ask, rather than quietly storing a closed day.
        const result = validateSupportHours({
            timezone: 'Asia/Manila',
            days: { mon: { open: '09:00', close: '09:00' } },
        });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/same|zero|empty/i);
    });

    it('refuses a day name it does not recognise', () => {
        const result = validateSupportHours({
            timezone: 'Asia/Manila',
            days: { monday: { open: '09:00', close: '18:00' } },
        });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/monday/i);
    });

    it('refuses something that is not a schedule at all', () => {
        for (const bad of [null, 'always', 42, { days: {} }, { timezone: 'Asia/Manila' }]) {
            expect(validateSupportHours(bad).ok, JSON.stringify(bad)).toBe(false);
        }
    });
});
