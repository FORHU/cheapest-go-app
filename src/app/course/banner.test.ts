import { describe, it, expect } from 'vitest';
import { courseBannerKey } from './banner';

describe('courseBannerKey', () => {
    it('matches each portal section by its path', () => {
        expect(courseBannerKey('/course')).toBe('requests');
        expect(courseBannerKey('/course/tee-sheet')).toBe('tee-sheet');
        expect(courseBannerKey('/course/profile')).toBe('profile');
    });

    it('does not mistake a path that merely starts alike for a section', () => {
        expect(courseBannerKey('/course/profiles-old')).toBe('requests');
    });
});
