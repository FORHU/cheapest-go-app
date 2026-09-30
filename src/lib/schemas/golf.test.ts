import { describe, it, expect } from 'vitest';
import { golfCourseInputSchema, slugify } from './golf';

const valid = { name: 'Wack Wack East', country: 'Philippines', city: 'Mandaluyong', holes: 18 };

describe('slugify', () => {
    it('joins parts, strips accents and punctuation', () => {
        expect(slugify('Club de Golf Alcanada', 'Alcúdia')).toBe('club-de-golf-alcanada-alcudia');
        expect(slugify('  St. Andrews — Old Course ')).toBe('st-andrews-old-course');
    });
    it('is empty for text with no latin letters or digits', () => {
        expect(slugify('남서울')).toBe('');
    });
});

describe('golfCourseInputSchema', () => {
    it('fills defaults and generates the slug from name and city', () => {
        const out = golfCourseInputSchema.parse(valid);
        expect(out).toMatchObject({
            slug: 'wack-wack-east-mandaluyong', address: null, description: '', par: null,
            greenFeeFrom: null, currency: 'USD', imageUrls: [], amenities: [],
        });
    });
    it('normalises a slug the admin typed', () => {
        expect(golfCourseInputSchema.parse({ ...valid, slug: 'My Course!' }).slug).toBe('my-course');
    });
    it('asks for a slug when none can be generated', () => {
        const r = golfCourseInputSchema.safeParse({ ...valid, name: '남서울', city: '성남' });
        expect(r.success).toBe(false);
        expect(r.error?.issues[0].path).toEqual(['slug']);
    });
    it('rejects holes outside 9/18/27/36, non-https images and unknown amenities', () => {
        expect(golfCourseInputSchema.safeParse({ ...valid, holes: 12 }).success).toBe(false);
        expect(golfCourseInputSchema.safeParse({ ...valid, imageUrls: ['http://x.com/a.jpg'] }).success).toBe(false);
        expect(golfCourseInputSchema.safeParse({ ...valid, amenities: ['spa'] }).success).toBe(false);
    });
    it('uppercases currency and de-duplicates amenities', () => {
        const out = golfCourseInputSchema.parse({ ...valid, currency: 'php', amenities: ['cart', 'cart', 'caddie'] });
        expect(out.currency).toBe('PHP');
        expect(out.amenities).toEqual(['cart', 'caddie']);
    });
    it('requires name, country and city', () => {
        const r = golfCourseInputSchema.safeParse({ holes: 18, name: ' ', country: '', city: '' });
        expect(r.success).toBe(false);
        const paths = r.error!.issues.map(i => i.path[0]);
        expect(paths).toEqual(expect.arrayContaining(['name', 'country', 'city']));
    });
});
