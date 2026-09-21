/**
 * The key a destination lookup falls back to when the exact one misses.
 *
 * `tgx_destination_cache` is keyed on the city name exactly as it was stored, so a traveller
 * who omits a space pays for it: "Danang" misses the row filed under "da nang", the search
 * spends up to 18 seconds asking TGX for a code it already has, and then works through the
 * Hotel-Code Fallback. Measured at around fifty seconds, for one absent character.
 *
 * These also pin what the fallback deliberately does *not* do. It compares letters, and
 * nothing else — no stemming, no dropping of trailing words. A rule generous enough to let
 * "Hochiminh" reach "ho chi minh city" is also generous enough to answer "Kansas" with Kansas
 * City, and a search that quietly returns the wrong place is worse than a slow one.
 */

import { describe, it, expect } from 'vitest';
import { looseCityKey } from '@/lib/server/search';

describe('looseCityKey', () => {
    it('matches a name typed without its space', () => {
        expect(looseCityKey('Danang')).toBe(looseCityKey('Da Nang'));
        expect(looseCityKey('Danang')).toBe('danang');
    });

    it('matches a name typed without its accents', () => {
        expect(looseCityKey('Malaga')).toBe(looseCityKey('Málaga'));
        expect(looseCityKey('Sao Paulo')).toBe(looseCityKey('São Paulo'));
        expect(looseCityKey('Dusseldorf')).toBe(looseCityKey('Düsseldorf'));
    });

    it('ignores punctuation and case, which suppliers and travellers disagree about', () => {
        expect(looseCityKey('Ho-Chi-Minh-Stadt')).toBe(looseCityKey('ho chi minh stadt'));
        expect(looseCityKey("Xi'an")).toBe(looseCityKey('Xian'));
        expect(looseCityKey('  SEOUL  ')).toBe('seoul');
    });

    it('keeps digits, because some names are mostly digits', () => {
        expect(looseCityKey('District 1')).toBe('district1');
    });

    it('does not reach a name with an extra word in it', () => {
        // The deliberate limit. "Hochiminh" stays a miss rather than becoming a guess.
        expect(looseCityKey('Hochiminh')).not.toBe(looseCityKey('Ho Chi Minh City'));
        expect(looseCityKey('Kansas')).not.toBe(looseCityKey('Kansas City'));
    });

    it('does not collapse two different cities into one key', () => {
        expect(looseCityKey('Santiago')).not.toBe(looseCityKey('Santander'));
        expect(looseCityKey('Naples')).not.toBe(looseCityKey('Napoli'));
    });

    it('returns empty for a name with no letters, so the caller can skip the lookup', () => {
        expect(looseCityKey('')).toBe('');
        expect(looseCityKey('   ---   ')).toBe('');
    });
});
