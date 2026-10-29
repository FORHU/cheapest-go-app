import { describe, it, expect } from 'vitest';
import { isThinDestinationAnswer, hotelsIn, FALLBACK_CODE_LIMIT } from '@/lib/server/stays/travelgatex/search';

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

/**
 * A thin answer is a guess made before the other path has run, and it used to be treated as a
 * verdict: the options were dropped and the fallback's result returned however small it was.
 *
 * Jeju, 2026-10-29. The destination answered 110 hotels — 94 of them on the northern half of
 * the island — and was discarded for being under a third of the 960-row catalog. The fallback
 * then returned 72, almost all southern, and that is what reached the traveller. Both answers
 * had been paid for; the better one was thrown away.
 *
 * The guard still decides which path is *preferred*. What changed is that the loser is kept
 * until the winner has actually produced something to compare against.
 */
describe('choosing between the two answers', () => {
    const opts = (...codes: string[]) => codes.map(hotelCode => ({ hotelCode }));

    it('counts hotels, not options', () => {
        // One generous property quoting six rooms is not six hotels.
        expect(hotelsIn(opts('A', 'A', 'A', 'A', 'A', 'A'))).toBe(1);
        expect(hotelsIn(opts('A', 'B', 'C'))).toBe(3);
    });

    it('counts nothing as nothing', () => {
        expect(hotelsIn([])).toBe(0);
    });

    // Seoul, 2026-10-06: the destination answered 66 against a catalog of 960 and the
    // hotel-code path priced 298. The guard was right there, and still is.
    it('leaves the fallback ahead when the fallback really does see more', () => {
        expect(isThinDestinationAnswer(66, 960)).toBe(true);
        expect(hotelsIn(opts(...Array.from({ length: 298 }, (_, i) => `h${i}`)))).toBeGreaterThan(66);
    });

    // Jeju: thin by the ratio, and still the larger of the two answers.
    it('keeps the destination answer when the fallback sees less of the city', () => {
        expect(isThinDestinationAnswer(110, 960)).toBe(true);
        const dest     = opts(...Array.from({ length: 110 }, (_, i) => `d${i}`));
        const fallback = opts(...Array.from({ length: 72 },  (_, i) => `f${i}`));
        expect(hotelsIn(dest)).toBeGreaterThan(hotelsIn(fallback));
    });
});

/**
 * The check has to measure against the alternative it is choosing between, not against the
 * catalog, because the Hotel-Code Fallback is capped at FALLBACK_CODE_LIMIT codes however
 * large the catalog grows. Measured against the raw catalog it gets stricter the better
 * stocked a city is, and prefers a path that cannot possibly do better.
 *
 * Seoul, 2026-10-29, from the production log:
 *   Dest code "3124" answered thin: 297 hotels against 2125 in the catalog — using the
 *   hotel-code path instead
 *   Hotel-code fallback: querying TGX with 300 IDs in 2 batch(es)
 *   Hotel-code fallback: 44 options
 */
describe('what the thin check measures against', () => {
    const yardstick = (catalogSize: number) => Math.min(catalogSize, FALLBACK_CODE_LIMIT);

    it('does not call Seoul thin for answering 297 when the alternative can ask about 300', () => {
        expect(isThinDestinationAnswer(297, 2125)).toBe(true);            // the old yardstick
        expect(isThinDestinationAnswer(297, yardstick(2125))).toBe(false); // the new one
    });

    it('still calls the original Seoul incident thin — 66 against the same 300', () => {
        expect(isThinDestinationAnswer(66, yardstick(960))).toBe(true);
    });

    it('keeps Jeju out of the fallback', () => {
        expect(isThinDestinationAnswer(150, 960)).toBe(true);             // the old yardstick
        expect(isThinDestinationAnswer(150, yardstick(960))).toBe(false); // the new one
    });

    // A small town whose whole catalog is under the cap is judged against its own size, so a
    // complete answer is still a complete answer.
    it('judges a small town against itself', () => {
        expect(yardstick(11)).toBe(11);
        expect(isThinDestinationAnswer(11, yardstick(11))).toBe(false);
        expect(isThinDestinationAnswer(2, yardstick(11))).toBe(true);
    });
});
