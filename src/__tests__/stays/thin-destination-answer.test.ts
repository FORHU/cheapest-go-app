import { describe, it, expect } from 'vitest';
import { isThinDestinationAnswer } from '@/lib/server/stays/travelgatex/search';

/**
 * When the supplier's own answer about a city is not worth taking.
 *
 * Search by Destination is supposed to return a *broader* set than `hotel_content` —
 * CONTEXT.md says so, because TGX maps OTV hotels we have never seen. On 2026-10-06 it
 * returned 66 hotels for Seoul against a 960-hotel catalog, and not one of the 66 was in
 * Gangnam, so a district search over them found nothing and the page reported no hotels
 * while holding 319 catalog rows for exactly that district.
 *
 * Nothing checked the premise. This is the check, and it is a ratio rather than a floor:
 * a small town answers completely with a handful, and a fixed minimum would reject its
 * whole catalog while accepting a fraction of a capital's.
 */

describe('isThinDestinationAnswer', () => {
    it('rejects the Seoul answer that started this', () => {
        // 66 of 960 is 7%.
        expect(isThinDestinationAnswer(66, 960)).toBe(true);
    });

    it('accepts a small town answering about all of itself', () => {
        // Eleven hotels is the whole place. A floor of, say, fifty would throw it away.
        expect(isThinDestinationAnswer(11, 11)).toBe(false);
    });

    it('accepts an answer that covers most of what we hold', () => {
        expect(isThinDestinationAnswer(280, 300)).toBe(false);
    });

    it('accepts an answer broader than our own catalog, which is the point of the path', () => {
        expect(isThinDestinationAnswer(1200, 960)).toBe(false);
    });

    it('is decided on the ratio, not the absolute number', () => {
        // The same 50 hotels: ample for a town, derisory for a capital.
        expect(isThinDestinationAnswer(50, 100)).toBe(false);
        expect(isThinDestinationAnswer(50, 5000)).toBe(true);
    });

    it('leaves an empty answer alone — that is a miss, not a thin answer', () => {
        // Handled elsewhere and recorded in tgx_failed_dest_codes. Calling it thin would
        // route around that and the code would never be blacklisted.
        expect(isThinDestinationAnswer(0, 960)).toBe(false);
    });

    it('takes the supplier at its word when we hold nothing to compare against', () => {
        // A city absent from hotel_content gives no yardstick, and the supplier's answer is
        // the only one there is — refusing it would leave the traveller with nothing.
        expect(isThinDestinationAnswer(40, 0)).toBe(false);
    });

    it('does not trip on the boundary', () => {
        // Exactly a third is not under a third.
        expect(isThinDestinationAnswer(100, 300)).toBe(false);
        expect(isThinDestinationAnswer(99, 300)).toBe(true);
    });
});
