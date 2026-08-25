import { describe, it, expect } from 'vitest';
import { orderPhotosByDistinctiveness, normalizeRoomName, mergeGroupsByPhotos, type GroupedRoom } from './roomUtils';

/**
 * Regression cover for the Hotel Naru Seoul report: two correctly-matched rooms
 * showed what looked like identical photos because their supplier photo sets
 * overlapped by 70%, and a card only shows the first three.
 */

function room(roomName: string, roomPhotos: string[]): GroupedRoom {
    return {
        roomName,
        roomTypes: [],
        rateOptions: [],
        lowestPrice: 0,
        currency: 'USD',
        roomPhotos,
    } as unknown as GroupedRoom;
}

describe('orderPhotosByDistinctiveness', () => {
    it('leads with the photos unique to each room', () => {
        // Hotel Naru Seoul, hotel_id 10163886: the two rooms from the report share
        // 7 of 10 photos. Shortened here; the shape is what matters.
        const deluxe  = room('Deluxe Double room with river view',  ['dlx-a', 'shared-1', 'shared-2', 'dlx-b']);
        const premier = room('Premier Double room with river view', ['shared-1', 'prm-a', 'shared-2', 'prm-b']);

        const [d, p] = orderPhotosByDistinctiveness([deluxe, premier]);

        expect(d.roomPhotos).toEqual(['dlx-a', 'dlx-b', 'shared-1', 'shared-2']);
        expect(p.roomPhotos).toEqual(['prm-a', 'prm-b', 'shared-1', 'shared-2']);
    });

    it('gives the two rooms different lead photos', () => {
        const deluxe  = room('Deluxe',  ['shared-1', 'shared-2', 'dlx-only']);
        const premier = room('Premier', ['shared-1', 'shared-2', 'prm-only']);

        const [d, p] = orderPhotosByDistinctiveness([deluxe, premier]);

        expect(d.roomPhotos?.[0]).toBe('dlx-only');
        expect(p.roomPhotos?.[0]).toBe('prm-only');
        expect(d.roomPhotos?.[0]).not.toBe(p.roomPhotos?.[0]);
    });

    it('keeps the shared photos rather than discarding them', () => {
        const a = room('A', ['a-only', 'shared']);
        const b = room('B', ['b-only', 'shared']);

        const [ra, rb] = orderPhotosByDistinctiveness([a, b]);

        expect(ra.roomPhotos).toHaveLength(2);
        expect(rb.roomPhotos).toHaveLength(2);
        expect(ra.roomPhotos).toContain('shared');
    });

    it('leaves supplier order alone when a room has no unique photos', () => {
        // Every photo of B also belongs to A, so there is nothing to promote and
        // reordering would only churn the gallery.
        const a = room('A', ['x', 'y', 'a-only']);
        const b = room('B', ['x', 'y']);

        const [, rb] = orderPhotosByDistinctiveness([a, b]);

        expect(rb.roomPhotos).toEqual(['x', 'y']);
    });

    it('leaves supplier order alone when every photo is already unique', () => {
        const a = room('A', ['a1', 'a2']);
        const b = room('B', ['b1', 'b2']);

        const [ra, rb] = orderPhotosByDistinctiveness([a, b]);

        expect(ra.roomPhotos).toEqual(['a1', 'a2']);
        expect(rb.roomPhotos).toEqual(['b1', 'b2']);
    });

    it('passes through rooms with no photos, and single-room pages', () => {
        const none = room('No photos', []);
        expect(orderPhotosByDistinctiveness([none, room('B', ['b'])])[0].roomPhotos).toEqual([]);

        const only = [room('Only', ['x', 'y'])];
        expect(orderPhotosByDistinctiveness(only)).toBe(only);
    });

    it('counts a photo repeated within one room as still unique to it', () => {
        // A duplicate inside one room must not make that photo look shared.
        const a = room('A', ['dup', 'dup', 'a-only']);
        const b = room('B', ['b-only']);

        const [ra] = orderPhotosByDistinctiveness([a, b]);

        expect(ra.roomPhotos).toEqual(['dup', 'dup', 'a-only']);
    });
});

/**
 * A room card titled "U" or "S" was reported from production. The hotel could not be
 * found again, so the cause is unconfirmed — these pin the two paths in this file that
 * can produce such a title, so neither can be the cause in future.
 */
describe('room names that are really supplier codes', () => {
    it('keeps the parenthetical when stripping it would leave a bare code', () => {
        // The reported shape: identity lives inside the parentheses.
        expect(normalizeRoomName('U (Superior Double room)')).toBe('U (Superior Double room)');
        expect(normalizeRoomName('S (Standard Twin)')).toBe('S (Standard Twin)');
    });

    it('still strips qualifiers when a real name remains', () => {
        expect(normalizeRoomName('Deluxe Double room (full double bed)')).toBe('Deluxe Double room');
        expect(normalizeRoomName('Standard Single room (smoking)')).toBe('Standard Single room');
    });

    it('keeps genuinely short room names that are still words', () => {
        expect(normalizeRoomName('Loft (city view)')).toBe('Loft');
        expect(normalizeRoomName('Twin (2 beds)')).toBe('Twin');
    });

    it('still removes rate suffixes', () => {
        expect(normalizeRoomName('Deluxe Room - Non-Refundable')).toBe('Deluxe Room');
        expect(normalizeRoomName('Deluxe Room (river view) - Room Only')).toBe('Deluxe Room');
    });

    it('does not title a merged card with a supplier code', () => {
        const g = (roomName: string): GroupedRoom => ({
            roomName,
            roomPhotos: ['same-photo'],
            amenities: [],
            rateOptions: [{ offerId: roomName, price: 100, currency: 'PHP', refundable: null }],
            lowestPrice: 100,
            currency: 'PHP',
            roomTypes: [],
        } as unknown as GroupedRoom);

        // "U" is the shortest, but it is not a name anyone can book from.
        const merged = mergeGroupsByPhotos([g('U'), g('Superior Double room')]);
        expect(merged).toHaveLength(1);
        expect(merged[0].roomName).toBe('Superior Double room');
    });

    it('falls back to the code when there is nothing else', () => {
        const g = (roomName: string): GroupedRoom => ({
            roomName,
            roomPhotos: ['same-photo'],
            amenities: [],
            rateOptions: [{ offerId: roomName, price: 100, currency: 'PHP', refundable: null }],
            lowestPrice: 100,
            currency: 'PHP',
            roomTypes: [],
        } as unknown as GroupedRoom);

        const merged = mergeGroupsByPhotos([g('U'), g('S')]);
        expect(merged[0].roomName).toBe('U');
    });
});
