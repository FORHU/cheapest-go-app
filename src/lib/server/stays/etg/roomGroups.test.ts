import { describe, it, expect } from 'vitest';
import { parseRoomGroups } from './roomGroups';

// ── helpers ───────────────────────────────────────────────────────────────────

const rawGroup = (overrides: Record<string, any> = {}) => ({
    name: 'Standard Room',
    images: [],
    room_amenities: null,
    room_group_id: null,
    name_struct: { bedding_type: '', bathroom: '', main_name: 'Standard Room' },
    rg_ext: { bedding: 0, capacity: 0, quality: 0, view: 0, balcony: 0 },
    ...overrides,
});

// ── parseRoomGroups ───────────────────────────────────────────────────────────

describe('parseRoomGroups', () => {
    it('returns [] for empty input', () => {
        expect(parseRoomGroups([])).toEqual([]);
        expect(parseRoomGroups(null as any)).toEqual([]);
    });

    it('filters out entries with no name', () => {
        const result = parseRoomGroups([rawGroup({ name: '' }), rawGroup({ name: 'Deluxe Room' })]);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Deluxe Room');
    });

    it('resolves {size} placeholder in image URLs', () => {
        const result = parseRoomGroups([rawGroup({
            images: ['https://example.com/photo/{size}/img.jpg'],
        })]);
        expect(result[0].images[0]).toBe('https://example.com/photo/1024x768/img.jpg');
    });

    it('caps images at 10', () => {
        const result = parseRoomGroups([rawGroup({
            images: Array.from({ length: 15 }, (_, i) => `https://cdn.example.com/img${i}.jpg`),
        })]);
        expect(result[0].images).toHaveLength(10);
    });

    // ── new structured fields ─────────────────────────────────────────────────

    it('extracts roomGroupId from room_group_id', () => {
        const result = parseRoomGroups([rawGroup({ room_group_id: 20623988 })]);
        expect(result[0].roomGroupId).toBe(20623988);
    });

    it('omits roomGroupId when room_group_id is absent', () => {
        const result = parseRoomGroups([rawGroup({ room_group_id: null })]);
        expect(result[0].roomGroupId).toBeUndefined();
    });

    it('extracts beddingType from name_struct.bedding_type', () => {
        const result = parseRoomGroups([rawGroup({
            name_struct: { bedding_type: 'twin beds', bathroom: '', main_name: 'Deluxe Twin Room' },
        })]);
        expect(result[0].beddingType).toBe('twin beds');
    });

    it('omits beddingType when name_struct.bedding_type is empty string', () => {
        const result = parseRoomGroups([rawGroup({
            name_struct: { bedding_type: '', bathroom: '', main_name: 'Standard Room' },
        })]);
        expect(result[0].beddingType).toBeUndefined();
    });

    it('extracts rgExt numeric attributes', () => {
        const result = parseRoomGroups([rawGroup({
            rg_ext: { bedding: 4, capacity: 2, quality: 6, view: 5, balcony: 0, club: 0, family: 0, floor: 0, class: 3, sex: 0, bedrooms: 0 },
        })]);
        expect(result[0].rgExt).toEqual({ bedding: 4, capacity: 2, quality: 6, view: 5, balcony: 0 });
    });

    it('omits rgExt when rg_ext is absent', () => {
        const result = parseRoomGroups([rawGroup({ rg_ext: null })]);
        expect(result[0].rgExt).toBeUndefined();
    });

    it('handles old-format ETG data (no name_struct / rg_ext) without throwing', () => {
        const oldFormat = { name: 'Standard Room', images: [], room_amenities: null };
        expect(() => parseRoomGroups([oldFormat])).not.toThrow();
        const result = parseRoomGroups([oldFormat]);
        expect(result[0].beddingType).toBeUndefined();
        expect(result[0].roomGroupId).toBeUndefined();
        expect(result[0].rgExt).toBeUndefined();
    });

    it('parses amenities from room_amenities array', () => {
        const result = parseRoomGroups([rawGroup({ room_amenities: ['non-smoking', 'wifi'] })]);
        // amenities are mapped through etgRoomAmenityToLabel — just check it's an array
        expect(Array.isArray(result[0].amenities)).toBe(true);
    });

    // ── Pass 0 scenario: twin vs double should be distinguishable ─────────────

    it('twin and double rooms get distinct beddingType values', () => {
        const groups = parseRoomGroups([
            rawGroup({ name: 'Standard Twin Room', room_group_id: 1, name_struct: { bedding_type: 'twin beds', bathroom: '', main_name: 'Standard Twin Room' } }),
            rawGroup({ name: 'Standard Double Room', room_group_id: 2, name_struct: { bedding_type: 'double bed', bathroom: '', main_name: 'Standard Double Room' } }),
        ]);
        expect(groups[0].beddingType).toBe('twin beds');
        expect(groups[1].beddingType).toBe('double bed');
        // Confirm Pass 0 can now distinguish them: "double" keyword hits only group[1]
        const doubleMatch = groups.filter(g => g.beddingType?.includes('double'));
        expect(doubleMatch).toHaveLength(1);
        expect(doubleMatch[0].name).toBe('Standard Double Room');
    });
});
