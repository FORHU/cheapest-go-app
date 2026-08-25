import { describe, expect, it } from 'vitest';
import { resolveStayDates, getDefaultDates } from './fetchPropertyData';

/**
 * The property page asks the supplier for a date range and gets back a price covering
 * the whole of it. Whatever restates that price per night has to divide by the number
 * of nights it was quoted for, so both figures come from resolveStayDates.
 *
 * The bug these tests pin: a request carrying no usable dates was still priced for a
 * default Friday→Sunday stay, while the card that rendered it assumed one night — and
 * showed a two-night total as the nightly rate.
 */
describe('resolveStayDates', () => {
    const future = (days: number) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
    };

    it('counts the nights of the stay it was given', () => {
        const stay = resolveStayDates({ checkIn: future(30), checkOut: future(32) });
        expect(stay.checkIn).toBe(future(30));
        expect(stay.checkOut).toBe(future(32));
        expect(stay.nights).toBe(2);
    });

    it('reports the nights of the fallback stay, never 1, when dates are missing', () => {
        const stay = resolveStayDates({});
        const defaults = getDefaultDates();

        // The quote falls back to Friday→Sunday, so the divisor must follow it there.
        expect(stay.checkIn).toBe(defaults.checkIn);
        expect(stay.checkOut).toBe(defaults.checkOut);
        expect(stay.nights).toBe(2);
    });

    it('falls back rather than quote a stay that has already started', () => {
        const stay = resolveStayDates({ checkIn: future(-3), checkOut: future(-1) });
        expect(stay.checkIn).toBe(getDefaultDates().checkIn);
        expect(stay.nights).toBeGreaterThanOrEqual(1);
    });

    it('agrees with itself, so the quote and the display cannot disagree', () => {
        const params = { checkIn: future(10), checkOut: future(17) };
        expect(resolveStayDates(params)).toEqual(resolveStayDates(params));
        expect(resolveStayDates(params).nights).toBe(7);
    });

    it('never returns fewer than one night', () => {
        const sameDay = future(20);
        expect(resolveStayDates({ checkIn: sameDay, checkOut: sameDay }).nights).toBe(1);
    });
});
