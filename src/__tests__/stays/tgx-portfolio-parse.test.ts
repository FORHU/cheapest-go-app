/**
 * Reading the OTV portfolio off a Hotels response.
 *
 * Every one of these guards a failure that reports success. The first version of the sync
 * handed each *edge* to a parser expecting a *node*, so every hotel parsed to null: it ran to
 * completion, logged "0 new, 0 seen", and had it also run to the end of the portfolio it would
 * have concluded that OTV lists nothing and delisted the entire catalogue.
 */

import { describe, it, expect } from 'vitest';
import { parsePortfolioHotel, parsePortfolioPage } from '@/lib/server/stays/travelgatex/portfolio';

const node = (overrides: any = {}) => ({
    hotelData: {
        code: '13149831',
        hotelName: 'Lux Hotel',
        categoryCode: '2',
        location: {
            coordinates: { latitude: 40.758583, longitude: -73.94023 },
            address: '37-25 12th, New York',
            city: 'New York',
            country: 'US',
        },
        giataData: { id: '12345' },
        ...overrides,
    },
});

describe('parsePortfolioHotel', () => {
    it('reads a hotel the supplier described fully', () => {
        expect(parsePortfolioHotel(node())).toEqual({
            code: '13149831',
            name: 'Lux Hotel',
            country: 'US',
            city: 'New York',
            address: '37-25 12th, New York',
            lat: 40.758583,
            lng: -73.94023,
            stars: 2,
            giata: '12345',
        });
    });

    it('refuses a hotel with no code, which nothing downstream could key on', () => {
        expect(parsePortfolioHotel(node({ code: '' }))).toBeNull();
        expect(parsePortfolioHotel(node({ code: undefined }))).toBeNull();
        expect(parsePortfolioHotel(null)).toBeNull();
    });

    it('reports a missing field as null rather than as an empty string', () => {
        // The update COALESCEs on null. An empty string would pass straight through and
        // replace a city we already knew with nothing.
        const h = parsePortfolioHotel(node({
            hotelName: '   ',
            location: { coordinates: {}, address: '', city: null, country: 'US' },
        }))!;
        expect(h.name).toBeNull();
        expect(h.city).toBeNull();
        expect(h.address).toBeNull();
    });

    it('treats a zero coordinate as absent, not as Null Island', () => {
        const h = parsePortfolioHotel(node({
            location: { coordinates: { latitude: 0, longitude: 0 }, city: 'Nowhere' },
        }))!;
        expect(h.lat).toBeNull();
        expect(h.lng).toBeNull();
    });

    it('keeps an unrated hotel at zero stars rather than inventing one', () => {
        expect(parsePortfolioHotel(node({ categoryCode: '0' }))!.stars).toBe(0);
        expect(parsePortfolioHotel(node({ categoryCode: null }))!.stars).toBe(0);
        expect(parsePortfolioHotel(node({ categoryCode: 'DELUXE' }))!.stars).toBe(0);
    });
});

describe('parsePortfolioPage', () => {
    it('unwraps edges, which is the mistake that imported nothing and said it worked', () => {
        const page = parsePortfolioPage([{ node: node() }, { node: node({ code: '999' }) }]);
        expect(page.map(h => h.code)).toEqual(['13149831', '999']);
    });

    it('drops an unusable hotel without dropping the page', () => {
        const page = parsePortfolioPage([{ node: node() }, { node: node({ code: '' }) }, {}]);
        expect(page).toHaveLength(1);
    });

    it('survives a page the supplier sent empty', () => {
        expect(parsePortfolioPage([])).toEqual([]);
        expect(parsePortfolioPage(undefined as any)).toEqual([]);
    });
});
