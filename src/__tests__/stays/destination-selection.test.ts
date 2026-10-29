import { describe, expect, it } from 'vitest';
import { isRelatedName, selectDestination, type DestinationCandidate } from '@/lib/server/stays/destinationSelection';

const d = (code: string, type: string, name: string, parentCode: string | null = null): DestinationCandidate =>
    ({ code, type, name, parentCode });

/**
 * Jeju as TGX actually files it, taken from `tgx_destination_cache` and from a live
 * `destinationSearcher` call on 2026-10-29 rather than invented.
 *
 * It reads like a hierarchy worth climbing — an island zone with two cities beneath it — and
 * it is a trap. Asked for their portfolios on this access, 6049718, 6052863 and 6052864 return
 * a single hotel each, while the flat city code 850 returns four hundred spanning the whole
 * island, 285 of them on the northern side. Where a destination sits in the supplier's
 * hierarchy says nothing about the inventory behind it.
 */
const JEJU: DestinationCandidate[] = [
    d('850',     'CITY', 'Jeju',          'South Korea#KR'),
    d('6049718', 'ZONE', 'Jeju Island',   '94'),
    d('6052863', 'CITY', 'Jeju City',     '6049718'),
    d('6052864', 'CITY', 'Seogwipo City', '6049718'),
];

describe('isRelatedName', () => {
    it('accepts the name itself and anything beneath it', () => {
        expect(isRelatedName('Jeju', 'jeju')).toBe(true);
        expect(isRelatedName('Jeju Island', 'jeju')).toBe(true);
        expect(isRelatedName('Jeju City', 'jeju')).toBe(true);
    });

    // The word boundary is the whole fix: without it "paris" matches "…Casparis…".
    it('refuses a name that merely contains the query', () => {
        expect(isRelatedName('Alpine-Casparis Municipal Airport', 'paris')).toBe(false);
        expect(isRelatedName('Parisville', 'paris')).toBe(false);
    });

    it('ignores case, accents and spacing', () => {
        expect(isRelatedName('  JEJU   ISLAND ', 'Jeju')).toBe(true);
        expect(isRelatedName('Málaga', 'malaga')).toBe(true);
    });
});

describe('selectDestination', () => {
    it('takes the place that was named over one that merely begins with it', () => {
        expect(selectDestination(JEJU, 'jeju')?.code).toBe('850');
    });

    it('still resolves a narrower name to its own destination', () => {
        expect(selectDestination(JEJU, 'seogwipo city')?.code).toBe('6052864');
    });

    // The failure this replaces: selection fell back to any ZONE when none matched the name.
    it('returns nothing rather than an unrelated place', () => {
        const paris = [d('991', 'ZONE', 'Alpine-Casparis Municipal Airport', 'United States#US')];
        expect(selectDestination(paris, 'paris')).toBeUndefined();
    });

    it('takes the real city when it is there', () => {
        const paris = [
            d('991',  'ZONE', 'Alpine-Casparis Municipal Airport', 'United States#US'),
            d('2734', 'CITY', 'Paris',                             'France#FR'),
        ];
        expect(selectDestination(paris, 'paris')?.code).toBe('2734');
    });

    // Type is never consulted, so a supplier relabelling a destination cannot move a search.
    it('ignores the supplier type label entirely', () => {
        const relabelled = JEJU.map(c => ({ ...c, type: c.type === 'ZONE' ? 'CITY' : 'ZONE' }));
        expect(selectDestination(relabelled, 'jeju')?.code).toBe('850');
    });

    // The hierarchy is stored but never trusted: climbing it would pick 6049718, which holds
    // one hotel, over 850, which holds the island.
    it('does not prefer a parent destination to the one that was named', () => {
        expect(selectDestination(JEJU, 'jeju')?.code).not.toBe('6049718');
    });

    // The old tie-break was "first seen wins", i.e. the supplier's paging order.
    it('is stable however the supplier orders its response', () => {
        expect(selectDestination([...JEJU].reverse(), 'jeju')?.code).toBe(selectDestination(JEJU, 'jeju')?.code);
    });

    it('answers for an ordinary single-match city', () => {
        expect(selectDestination([d('3124', 'CITY', 'Seoul', 'South Korea#KR')], 'seoul')?.code).toBe('3124');
    });

    it('returns nothing for an empty list', () => {
        expect(selectDestination([], 'jeju')).toBeUndefined();
    });
});

/**
 * The live resolver and the nightly sync do not see the same catalog.
 *
 * `destinationSearcher` — the autocomplete endpoint the resolver uses — was asked for "Jeju"
 * on 2026-10-29 and returned exactly two places: the city code 850, and Jeju International
 * Airport. No island, no Jeju City. The bulk `destinations` list the sync reads holds all four.
 *
 * Under the old rule the resolver preferred a ZONE whenever the country was known, and the
 * only zone in that response is the airport. `tgx_destination_cache` still carries the row it
 * wrote: `jeju international airport:kr → 965846151`.
 */
describe('the two catalogs the two callers see', () => {
    // Verbatim from destinationSearcher, duplicates and all.
    const SEARCHER: DestinationCandidate[] = [
        d('850',       'CITY', 'Jeju',                       'South Korea#KR'),
        d('965846151', 'ZONE', 'Jeju International Airport', 'South Korea#KR'),
        d('850',       'CITY', 'Jeju',                       'South Korea#KR'),
        d('965846151', 'ZONE', 'Jeju International Airport', 'South Korea#KR'),
    ];

    it('never resolves Jeju to its airport, however few alternatives there are', () => {
        expect(selectDestination(SEARCHER, 'jeju')?.code).toBe('850');
    });

    // The point of one shared rule: the two callers can see different catalogs and still not
    // contradict each other about a name they both hold.
    it('agrees with the fuller catalog about what Jeju means', () => {
        expect(selectDestination(SEARCHER, 'jeju')?.code).toBe(selectDestination(JEJU, 'jeju')?.code);
    });

    it('is a function of its input alone', () => {
        expect(selectDestination([...SEARCHER].reverse(), 'jeju')?.code).toBe(selectDestination(SEARCHER, 'jeju')?.code);
    });
});
