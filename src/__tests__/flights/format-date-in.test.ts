import { describe, it, expect } from 'vitest';
import { formatDateIn } from '@/utils/flight-utils';

/**
 * Local Airport Times carry no UTC offset, so any Date built from one is displaced by
 * whatever zone the browser happens to be in. formatDateIn reads the digits the way
 * formatTimeIn reads the clock: the date in the string IS the answer.
 */
describe('formatDateIn', () => {
    it('names the day in the string', () => {
        const formatted = formatDateIn('2026-09-12T08:00:00', 'en');

        expect(formatted).toMatch(/12/);
        expect(formatted).toMatch(/Sep/);
    });

    it('does not shift a just-after-midnight departure to the day before', () => {
        // 00:30 is where a naive Date + UTC formatting loses a day for any browser
        // east of Greenwich — the traveller's boarding pass still says the 12th.
        expect(formatDateIn('2026-09-12T00:30:00', 'en')).toMatch(/12/);
    });

    it('does not shift a late-night departure to the day after', () => {
        expect(formatDateIn('2026-09-12T23:45:00', 'en')).toMatch(/12/);
    });

    it('returns nothing for a missing time rather than a fabricated date', () => {
        expect(formatDateIn(undefined, 'en')).toBe('');
    });
});
