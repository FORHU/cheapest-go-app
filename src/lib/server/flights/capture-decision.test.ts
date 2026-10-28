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
});
