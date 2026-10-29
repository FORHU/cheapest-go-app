import { describe, it, expect } from 'vitest';
import { pickQuote } from './pickQuote';

/** Stand-in for the route's own comparison; exact match is enough to express the rules. */
const matches = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const q = (price: number, roomName: string, order: number) => ({ price, roomName, order });

describe('pickQuote', () => {
    it('books the room the guest picked, not a cheaper different one', () => {
        const chosen = pickQuote(
            [q(40_000, 'Standard Twin', 0), q(62_407, 'Deluxe Double', 1)],
            'Deluxe Double',
            matches,
        );
        expect(chosen?.roomName).toBe('Deluxe Double');
        expect(chosen?.price).toBe(62_407);
    });

    it('takes the cheapest rate plan of that room — the one the card advertised', () => {
        // The Jeju incident: both are "Deluxe Double", different rate plans. The dearer one
        // answered first and `Promise.any` booked it at ₩68,104 against a card showing ₩62,407.
        const chosen = pickQuote(
            [q(68_104, 'Deluxe Double', 0), q(62_407, 'Deluxe Double', 1)],
            'Deluxe Double',
            matches,
        );
        expect(chosen?.price).toBe(62_407);
    });

    it('does not depend on which response arrived first', () => {
        const a = [q(68_104, 'Deluxe Double', 0), q(62_407, 'Deluxe Double', 1)];
        const b = [q(62_407, 'Deluxe Double', 1), q(68_104, 'Deluxe Double', 0)];
        expect(pickQuote(a, 'Deluxe Double', matches)).toEqual(pickQuote(b, 'Deluxe Double', matches));
    });

    it('falls back to other rooms only when none of the picked room survived', () => {
        const chosen = pickQuote(
            [q(80_000, 'Suite', 0), q(55_000, 'Standard Twin', 1)],
            'Deluxe Double',
            matches,
        );
        expect(chosen?.roomName).toBe('Standard Twin');
    });

    it('takes the cheapest when the guest expressed no preference', () => {
        const chosen = pickQuote([q(80_000, 'Suite', 0), q(55_000, 'Twin', 1)], '', matches);
        expect(chosen?.price).toBe(55_000);
    });

    it('breaks ties on candidate order so the result is stable', () => {
        const chosen = pickQuote(
            [q(62_407, 'Deluxe Double', 2), q(62_407, 'Deluxe Double', 1)],
            'Deluxe Double',
            matches,
        );
        expect(chosen?.order).toBe(1);
    });

    it('returns null when nothing landed', () => {
        expect(pickQuote([], 'Deluxe Double', matches)).toBeNull();
    });

    it('still books a quote whose price could not be read rather than nothing', () => {
        const chosen = pickQuote([q(Number.POSITIVE_INFINITY, 'Deluxe Double', 0)], 'Deluxe Double', matches);
        expect(chosen).not.toBeNull();
    });
});
