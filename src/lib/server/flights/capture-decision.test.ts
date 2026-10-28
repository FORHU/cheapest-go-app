import { describe, it, expect } from 'vitest';
import { decideCapture } from './capture-decision';

// A simple markup so the arithmetic is checkable by eye: charged = base * 1.1
const chargedFor = (base: number) => Math.round(base * 1.1 * 100) / 100;
const input = { authorizedMinor: 11_000, quotedBase: 100, tolerance: 0.5, chargedFor };

describe('decideCapture', () => {
    it('captures the whole hold when the order cost what was quoted', () => {
        expect(decideCapture({ ...input, finalBase: 100 })).toEqual({ kind: 'capture', amountMinor: 11_000 });
    });

    it('absorbs a rise within tolerance', () => {
        expect(decideCapture({ ...input, finalBase: 100.4 })).toEqual({ kind: 'capture', amountMinor: 11_000 });
    });

    it('releases when the order cost more than tolerance allows', () => {
        expect(decideCapture({ ...input, finalBase: 101 })).toEqual({ kind: 'release', code: 'price_changed' });
    });

    it('captures proportionally less when the order was cheaper', () => {
        expect(decideCapture({ ...input, finalBase: 90 })).toEqual({ kind: 'capture', amountMinor: 9_900 });
    });

    it('never captures more than was authorised', () => {
        const d = decideCapture({ ...input, finalBase: 100, authorizedMinor: 5_000 });
        expect(d).toEqual({ kind: 'capture', amountMinor: 5_000 });
    });

    it('captures the hold when a price is unknown rather than guessing a smaller number', () => {
        expect(decideCapture({ ...input, finalBase: 0 })).toEqual({ kind: 'capture', amountMinor: 11_000 });
        expect(decideCapture({ ...input, quotedBase: 0, finalBase: 90 })).toEqual({ kind: 'capture', amountMinor: 11_000 });
    });

    describe('tolerance boundary', () => {
        it('captures a rise of exactly the tolerance', () => {
            expect(decideCapture({ ...input, finalBase: 100.5 })).toEqual({ kind: 'capture', amountMinor: 11_000 });
        });

        it('releases a rise just over the tolerance', () => {
            expect(decideCapture({ ...input, finalBase: 100.51 })).toEqual({ kind: 'release', code: 'price_changed' });
        });

        it('with tolerance 0 captures an unchanged price and releases any rise', () => {
            expect(decideCapture({ ...input, tolerance: 0, finalBase: 100 })).toEqual({ kind: 'capture', amountMinor: 11_000 });
            expect(decideCapture({ ...input, tolerance: 0, finalBase: 100.01 })).toEqual({ kind: 'release', code: 'price_changed' });
        });

        it.each([['NaN', NaN], ['negative', -5], ['-Infinity', -Infinity]])('treats a %s tolerance as 0', (_l, tolerance) => {
            expect(decideCapture({ ...input, tolerance, finalBase: 100 })).toEqual({ kind: 'capture', amountMinor: 11_000 });
            expect(decideCapture({ ...input, tolerance, finalBase: 100.01 })).toEqual({ kind: 'release', code: 'price_changed' });
        });
    });

    describe('proportional capture', () => {
        it('captures slightly less for a tiny discount', () => {
            const d = decideCapture({ ...input, finalBase: 99.99 });
            expect(d.kind).toBe('capture');
            if (d.kind === 'capture') {
                expect(d.amountMinor).toBeLessThan(11_000);
                expect(d.amountMinor).toBeGreaterThan(10_990);
            }
        });

        it.each([
            ['zero', () => 0],
            ['NaN', () => NaN],
            ['negative', () => -1],
            ['a zero charge for the quote only', (b: number) => (b === 100 ? 0 : 5)],
        ])('falls back to the full hold when the markup gives %s', (_l, bad) => {
            expect(decideCapture({ ...input, finalBase: 90, chargedFor: bad })).toEqual({ kind: 'capture', amountMinor: 11_000 });
        });

        it('never captures more than a zero hold', () => {
            expect(decideCapture({ ...input, finalBase: 90, authorizedMinor: 0 })).toEqual({ kind: 'capture', amountMinor: 0 });
        });

        it('clamps to the hold when the scaled amount would exceed it', () => {
            // A markup that grows faster than the base: the "cheaper" order scales above the hold.
            const d = decideCapture({ ...input, finalBase: 90, authorizedMinor: 3, chargedFor: b => (b === 90 ? 500 : 100) });
            expect(d).toEqual({ kind: 'capture', amountMinor: 3 });
        });

        it('floors the capture at 1 minor unit for a near-free order', () => {
            const d = decideCapture({ ...input, finalBase: 0.01, authorizedMinor: 11_000, chargedFor: b => b });
            expect(d).toEqual({ kind: 'capture', amountMinor: 1 });
        });
    });
});
