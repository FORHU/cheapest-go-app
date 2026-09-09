import { describe, it, expect, beforeEach } from 'vitest';
import { setDestCodeCache, clearDestCodeCache } from './search';

/**
 * The in-process dest-code cache must be clearable.
 *
 * It has no TTL and no eviction, which is correct for a code that never changes and wrong
 * the moment one turns out to be incorrect. On 2026-09-09 `paris:fr` was resolved to a ZONE
 * for Alpine-Casparis Municipal Airport; the database was repaired to the real code 2734
 * and Paris went on returning the wrong hotels, because a repaired row cannot reach a Map
 * inside a running process. Restarting the container was the only way out.
 */
describe('clearing the in-process dest code cache', () => {
    beforeEach(() => { clearDestCodeCache(); });

    it('clears one city across every country it is cached under', () => {
        setDestCodeCache('paris', '143485');
        setDestCodeCache('paris:fr', '2734');
        setDestCodeCache('paris:us', '143485');
        setDestCodeCache('rome:it', '3023');

        expect(clearDestCodeCache('paris')).toBe(3);
        // Another city is untouched — a bad Paris must not cost Rome a re-resolve.
        expect(clearDestCodeCache('rome')).toBe(1);
    });

    it('does not clear a city that merely starts with the same letters', () => {
        // "paris" must not take "parisot" (a real French commune) with it.
        setDestCodeCache('paris:fr', '2734');
        setDestCodeCache('parisot:fr', '999999');

        expect(clearDestCodeCache('paris')).toBe(1);
        expect(clearDestCodeCache('parisot')).toBe(1);
    });

    it('clears everything when given no prefix', () => {
        setDestCodeCache('paris:fr', '2734');
        setDestCodeCache('tokyo:jp', '3593');
        setDestCodeCache('seoul:kr', '3124');
        expect(clearDestCodeCache()).toBe(3);
        expect(clearDestCodeCache()).toBe(0);
    });

    it('is case- and whitespace-insensitive, like the setter', () => {
        setDestCodeCache('  Paris:FR  ', '2734');
        expect(clearDestCodeCache('PARIS')).toBe(1);
    });
});
