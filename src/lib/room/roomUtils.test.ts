import { describe, it, expect } from 'vitest';
import { orderPhotosByDistinctiveness, type GroupedRoom } from './roomUtils';

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
