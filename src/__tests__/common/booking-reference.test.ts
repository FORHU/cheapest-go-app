/**
 * Brand attribution runs through the Booking Reference prefix, which is derived from
 * NEXT_PUBLIC_BRAND_NAME at mint time rather than stored beside source_brand, so the two
 * cannot drift apart (see docs/adr/0005-geomeego-white-label-deployment.md).
 *
 * GeomeeGo shares one codebase, one database and one Stripe account with CheapestGo, so
 * the prefix is the only thing that distinguishes a GeomeeGo sale inside Stripe — nothing
 * else in the booking path branches on brand. Nothing covered this until now.
 */
import { describe, it, expect } from 'vitest';
import {
    brandPrefix,
    mintBookingReference,
    isBookingReference,
    BOOKING_REFERENCE_PATTERN,
} from '@/lib/bookingReference';

describe('brandPrefix', () => {
    it('maps each known brand to its own prefix', () => {
        expect(brandPrefix('CheapestGo')).toBe('CG');
        expect(brandPrefix('GeomeeGo')).toBe('GG');
    });

    it('tolerates surrounding whitespace, which env vars pick up easily', () => {
        expect(brandPrefix('  GeomeeGo  ')).toBe('GG');
    });

    it('falls back to CG for an unset or unrecognised brand rather than failing the sale', () => {
        expect(brandPrefix(undefined)).toBe('CG');
        expect(brandPrefix(null)).toBe('CG');
        expect(brandPrefix('')).toBe('CG');
        expect(brandPrefix('Geomeego')).toBe('CG'); // case-sensitive by design
    });
});

describe('mintBookingReference', () => {
    it('prefixes a GeomeeGo sale with GG', () => {
        for (let i = 0; i < 25; i++) {
            expect(mintBookingReference('GeomeeGo')).toMatch(/^GG-[0-9A-HJKMNP-TV-Z]{6}$/);
        }
    });

    it('prefixes a CheapestGo sale with CG', () => {
        for (let i = 0; i < 25; i++) {
            expect(mintBookingReference('CheapestGo')).toMatch(/^CG-[0-9A-HJKMNP-TV-Z]{6}$/);
        }
    });

    it('never emits the ambiguous Crockford characters I, L, O or U', () => {
        const suffixes = Array.from({ length: 200 }, () => mintBookingReference('GeomeeGo').slice(3)).join('');
        expect(suffixes).not.toMatch(/[ILOU]/);
    });

    it('does not collide across a realistic batch', () => {
        const refs = new Set(Array.from({ length: 500 }, () => mintBookingReference('GeomeeGo')));
        expect(refs.size).toBe(500);
    });
});

describe('isBookingReference', () => {
    it('accepts references from both brands', () => {
        expect(isBookingReference(mintBookingReference('GeomeeGo'))).toBe(true);
        expect(isBookingReference(mintBookingReference('CheapestGo'))).toBe(true);
    });

    it('rejects an airline PNR that merely starts with CG', () => {
        // Real case: CG2MTN is a PNR on one of the live flight bookings.
        expect(isBookingReference('CG2MTN')).toBe(false);
    });

    it('rejects the retired FORHU- prefix', () => {
        expect(isBookingReference('FORHU-1786965181655-TOD6S')).toBe(false);
    });

    it('is anchored, so a reference embedded in other text does not match', () => {
        expect(BOOKING_REFERENCE_PATTERN.test('xxGG-7K2M9Q')).toBe(false);
        expect(BOOKING_REFERENCE_PATTERN.test('GG-7K2M9Qxx')).toBe(false);
    });

    it('rejects non-strings', () => {
        expect(isBookingReference(null)).toBe(false);
        expect(isBookingReference(undefined)).toBe(false);
        expect(isBookingReference(123456)).toBe(false);
    });
});
