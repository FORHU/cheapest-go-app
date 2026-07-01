import { describe, it, expect } from 'vitest';
import { POPULAR_DESTINATIONS } from '@/lib/constants/destinations';

describe('POPULAR_DESTINATIONS', () => {
    it('contains 20 APAC destinations', () => {
        expect(POPULAR_DESTINATIONS).toHaveLength(20);
    });

    it('each entry has id, city, country, and imagePath', () => {
        for (const d of POPULAR_DESTINATIONS) {
            expect(d.id).toBeTruthy();
            expect(d.city.length).toBeGreaterThan(0);
            expect(d.country.length).toBeGreaterThan(0);
            expect(d.imagePath).toMatch(/^\/images\/destinations\//);
        }
    });

    it('no entry has a price field', () => {
        for (const d of POPULAR_DESTINATIONS) {
            expect(d).not.toHaveProperty('price');
            expect(d).not.toHaveProperty('salePrice');
            expect(d).not.toHaveProperty('originalPrice');
        }
    });

    it('all ids are unique', () => {
        const ids = POPULAR_DESTINATIONS.map(d => d.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('all image paths are unique', () => {
        const paths = POPULAR_DESTINATIONS.map(d => d.imagePath);
        expect(new Set(paths).size).toBe(paths.length);
    });

    it('includes key Philippines destinations', () => {
        const cities = POPULAR_DESTINATIONS.map(d => d.city);
        expect(cities).toContain('Boracay');
        expect(cities).toContain('Palawan');
        expect(cities).toContain('Siargao');
    });

    it('includes key SEA and East Asia destinations', () => {
        const cities = POPULAR_DESTINATIONS.map(d => d.city);
        expect(cities).toContain('Bali');
        expect(cities).toContain('Bangkok');
        expect(cities).toContain('Tokyo');
        expect(cities).toContain('Seoul');
    });
});
