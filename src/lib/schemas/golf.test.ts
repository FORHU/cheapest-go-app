import { describe, it, expect } from 'vitest';
import { golfCourseInputSchema, holdRequestSchema, slugify, teeTimeScheduleInputSchema } from './golf';

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

describe('course time zone and free cancellation', () => {
    it('defaults to no time zone and 48 hours', () => {
        const parsed = golfCourseInputSchema.parse(valid);
        expect(parsed.timezone).toBeNull();
        expect(parsed.freeCancelHours).toBe(48);
    });

    it('accepts an IANA zone and refuses an invented one', () => {
        expect(golfCourseInputSchema.parse({ ...valid, timezone: 'Asia/Manila' }).timezone).toBe('Asia/Manila');
        expect(golfCourseInputSchema.safeParse({ ...valid, timezone: 'Manila time' }).success).toBe(false);
    });
});

describe('teeTimeScheduleInputSchema', () => {
    const schedule = { name: 'Weekday mornings', daysOfWeek: [5, 1, 1, 3], firstTee: '06:00', lastTee: '11:00', intervalMinutes: 10, pricePerPlayer: 2500 };

    it('dedupes and sorts days, defaults to four spots', () => {
        const parsed = teeTimeScheduleInputSchema.parse(schedule);
        expect(parsed.daysOfWeek).toEqual([1, 3, 5]);
        expect(parsed.spots).toBe(4);
    });

    it('refuses a last tee before the first, no days, and a time that is not 24-hour', () => {
        expect(teeTimeScheduleInputSchema.safeParse({ ...schedule, lastTee: '05:00' }).success).toBe(false);
        expect(teeTimeScheduleInputSchema.safeParse({ ...schedule, daysOfWeek: [] }).success).toBe(false);
        expect(teeTimeScheduleInputSchema.safeParse({ ...schedule, firstTee: '6am' }).success).toBe(false);
    });
});

describe('holdRequestSchema', () => {
    it('needs a tee time id, 1–4 players and a lead name', () => {
        const ok = { teeTimeId: '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44', players: 2, leadName: ' Ana Cruz ' };
        expect(holdRequestSchema.parse(ok).leadName).toBe('Ana Cruz');
        expect(holdRequestSchema.safeParse({ ...ok, players: 5 }).success).toBe(false);
        expect(holdRequestSchema.safeParse({ ...ok, leadName: '' }).success).toBe(false);
    });
});
