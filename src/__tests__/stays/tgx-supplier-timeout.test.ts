/**
 * A supplier that ran out of time and a supplier that answered with nothing are opposites,
 * and TravelgateX reports both as `ALL_PROCESSES_FAILED` with the description "See warnings
 * for more information". The warnings are the only thing that separates them.
 *
 * What reading them as one error looked like: a destination where OTV genuinely has no rooms
 * was recorded as an Unanswered Search, so the catalog stayed on screen and the traveller was
 * told "prices could not be loaded" — our outage message for the supplier's correct answer.
 *
 * Measured on one run of two cold cities, 2026-09-18: 3 timeouts against 6 no-results, so the
 * case being mishandled was the more common of the two.
 */

import { describe, it, expect } from 'vitest';
import { isSupplierTimeout } from '@/lib/server/stays/travelgatex/search';

const timeout   = { code: '', type: '104', description: 'Access `38327` returned:  Connection timeout with supplier' };
const noResults = { code: '', type: '204', description: 'Access `38327` returned:  No results found' };

describe('isSupplierTimeout', () => {
    it('recognises a supplier that never answered', () => {
        expect(isSupplierTimeout([timeout])).toBe(true);
    });

    it('does not mistake "no results found" for a timeout', () => {
        expect(isSupplierTimeout([noResults])).toBe(false);
    });

    it('treats a mixed batch as a timeout, because part of the answer is missing', () => {
        expect(isSupplierTimeout([noResults, timeout])).toBe(true);
    });

    it('reads the description when the numeric type is absent', () => {
        // TGX leaves `code` empty and has changed `type` before; the wording is the stable part.
        expect(isSupplierTimeout([{ description: 'Connection timeout with supplier' }])).toBe(true);
    });

    it('treats no warnings as no evidence of a timeout', () => {
        expect(isSupplierTimeout([])).toBe(false);
    });
});
