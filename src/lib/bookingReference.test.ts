import { describe, expect, it } from 'vitest';
import {
    brandPrefix,
    mintBookingReference,
    isBookingReference,
    mintUniqueBookingReference,
} from './bookingReference';

describe('booking reference', () => {
    it('names the platform, not the company that owns the Stripe account', () => {
        // FORHU- was the old prefix. It identifies the entity every project shares, so it
        // could never answer "which project did this money come from".
        expect(mintBookingReference('CheapestGo')).toMatch(/^CG-/);
        expect(mintBookingReference('GeomeeGo')).toMatch(/^GG-/);
        expect(mintBookingReference('CheapestGo')).not.toMatch(/FORHU/);
    });

    it('derives the prefix from the brand so the two cannot drift apart', () => {
        expect(brandPrefix('CheapestGo')).toBe('CG');
        expect(brandPrefix('GeomeeGo')).toBe('GG');
        // An unknown or missing brand still yields a usable reference rather than throwing
        // mid-checkout — source_brand stays the authority on which brand it really was.
        expect(brandPrefix('Unknown')).toBe('CG');
        expect(brandPrefix(undefined)).toBe('CG');
        expect(brandPrefix(null)).toBe('CG');
    });

    it('omits characters that are misheard when read aloud', () => {
        // Support reads these over the phone. I/1, L/1 and O/0 are the pairs that get
        // transcribed wrong, and U turns random strings into words.
        const refs = Array.from({ length: 300 }, () => mintBookingReference('CheapestGo'));
        for (const r of refs) expect(r.slice(3)).not.toMatch(/[ILOU]/);
    });

    it('is the same length as a PNR, so it fits where a PNR fits', () => {
        expect(mintBookingReference('CheapestGo')).toHaveLength(9); // CG- + 6
    });

    it('does not accept an airline PNR as one of ours', () => {
        // CG2MTN is a real PNR from the bookings table. It begins with CG by coincidence,
        // which is exactly the confusion the hyphen and the anchored pattern prevent.
        expect(isBookingReference('CG2MTN')).toBe(false);
        expect(isBookingReference('CG-7K2M9Q')).toBe(true);
        expect(isBookingReference('GG-7K2M9Q')).toBe(true);
        expect(isBookingReference('CG-7K2M9')).toBe(false);   // too short
        expect(isBookingReference('CG-7K2M9QQ')).toBe(false); // too long
        expect(isBookingReference('CG-7K2M9I')).toBe(false);  // excluded letter
        expect(isBookingReference('FORHU-1786965181655-TOD6S')).toBe(false);
    });

    it('does not repeat itself', () => {
        const seen = new Set(Array.from({ length: 2000 }, () => mintBookingReference('CheapestGo')));
        expect(seen.size).toBe(2000);
    });

    it('retries past a collision', async () => {
        const taken = new Set<string>();
        let first = '';
        const ref = await mintUniqueBookingReference('CheapestGo', async (candidate) => {
            if (!first) { first = candidate; taken.add(candidate); }
            return taken.has(candidate);
        });
        expect(ref).not.toBe(first);
        expect(isBookingReference(ref)).toBe(true);
    });

    it('does not fail a sale because the uniqueness probe is broken', async () => {
        // A charge has already been authorised by this point. Losing the sale over a
        // reference lookup would be a worse outcome than an astronomically unlikely clash.
        const ref = await mintUniqueBookingReference('CheapestGo', async () => {
            throw new Error('db down');
        });
        expect(isBookingReference(ref)).toBe(true);
    });
});
