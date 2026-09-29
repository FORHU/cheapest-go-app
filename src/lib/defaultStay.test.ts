import { describe, it, expect } from 'vitest';
import { asDay, defaultStay, defaultDeparture, resolveStayDates } from './defaultStay';

/** A local-calendar date `offset` days from today, the way the URL writes it. */
const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return asDay(d);
};

describe('defaultStay', () => {
    it('lands on a Friday and leaves on the Sunday', () => {
        const { checkIn, checkOut } = defaultStay();
        expect(new Date(`${checkIn}T00:00:00`).getDay()).toBe(5);
        expect(new Date(`${checkOut}T00:00:00`).getDay()).toBe(0);
    });

    it('is never today and never tomorrow', () => {
        // The window OTV has almost nothing in. A landing card that quoted it returned
        // hotels with no bookable room, which reads as a full city rather than a bad date.
        expect(defaultStay().checkIn > day(1)).toBe(true);
    });
});

describe('resolveStayDates', () => {
    it('keeps a stay the traveller named', () => {
        expect(resolveStayDates(day(10), day(13))).toEqual({
            checkIn: day(10), checkOut: day(13), chosen: true,
        });
    });

    it.each([
        [-7, 'a link that went stale in a chat window'],
        [0, 'today'],
        [1, 'tomorrow'],
    ])('rescues an arrival %i days out (%s)', (offset) => {
        const stay = resolveStayDates(day(offset), day(offset + 1));
        expect(stay.checkIn).toBe(defaultStay().checkIn);
        expect(stay.chosen).toBe(false);
    });

    it('falls back when the link carries no dates at all', () => {
        const stay = resolveStayDates(null, undefined);
        expect(stay).toEqual({ ...defaultStay(), chosen: false });
    });

    it('never returns a checkout on or before the arrival', () => {
        const stay = resolveStayDates(day(20), day(20));
        expect(stay.checkOut > stay.checkIn).toBe(true);
    });

    it('keeps an arrival the traveller chose when only the checkout is unusable', () => {
        const stay = resolveStayDates(day(20), day(18));
        expect(stay.checkIn).toBe(day(20));
        expect(stay.checkOut).toBe(day(22));
    });
});

describe('defaultDeparture', () => {
    it('is a month out, not next weekend', () => {
        // The Default Stay's rule would point every dateless route at the priciest
        // departure window there is. These are different questions.
        expect(defaultDeparture()).toBe(day(30));
        expect(defaultDeparture()).not.toBe(defaultStay().checkIn);
    });
});
