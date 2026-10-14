import { describe, it, expect } from 'vitest';
import {
    courseProfileInputSchema, golfCourseInputSchema, golfExtrasInputSchema, golfPhotoIdOf, golfPhotoPath,
    holdRequestSchema, slugify, teeTimeScheduleInputSchema,
} from './golf';

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

describe('extras in a hold request', () => {
    const ok = { teeTimeId: '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44', players: 2, leadName: 'Ana' };

    it('defaults to none, and refuses an unknown extra or one chosen twice', () => {
        expect(holdRequestSchema.parse(ok).extras).toEqual([]);
        expect(holdRequestSchema.safeParse({ ...ok, extras: [{ code: 'cart', quantity: 1 }, { code: 'cart', quantity: 2 }] }).success).toBe(false);
        expect(holdRequestSchema.safeParse({ ...ok, extras: [{ code: 'jetpack', quantity: 1 }] }).success).toBe(false);
    });
});

describe('golfExtrasInputSchema', () => {
    it('takes one price per offered extra', () => {
        expect(golfExtrasInputSchema.parse([{ code: 'caddie', price: 30 }])).toEqual([{ code: 'caddie', price: 30 }]);
        expect(golfExtrasInputSchema.safeParse([{ code: 'caddie', price: -1 }]).success).toBe(false);
        expect(golfExtrasInputSchema.safeParse([{ code: 'cart', price: 1 }, { code: 'cart', price: 2 }]).success).toBe(false);
    });
});

const photoId = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';

describe('golf photo paths', () => {
    it('round-trips an id through the app path', () => {
        expect(golfPhotoPath(photoId)).toBe(`/golf-photos/${photoId}`);
        expect(golfPhotoIdOf(`/golf-photos/${photoId}`)).toBe(photoId);
    });
    it('reads nothing from a URL that is not one of ours', () => {
        expect(golfPhotoIdOf('https://x.com/a.jpg')).toBeNull();
        expect(golfPhotoIdOf('/golf-photos/not-an-id')).toBeNull();
        expect(golfPhotoIdOf(`/golf-photos/${photoId}/../x`)).toBeNull();
    });
    it('is accepted in a course image list next to https URLs', () => {
        const out = golfCourseInputSchema.parse({ ...valid, imageUrls: [`/golf-photos/${photoId}`, 'https://x.com/a.jpg'] });
        expect(out.imageUrls).toHaveLength(2);
        expect(golfCourseInputSchema.safeParse({ ...valid, imageUrls: ['/elsewhere/a.jpg'] }).success).toBe(false);
    });
});

describe('courseProfileInputSchema', () => {
    const profile = {
        description: ' A links course. ', address: '', amenities: ['cart', 'cart'], imageUrls: [`/golf-photos/${photoId}`],
        par: 72, yardage: null, yearOpened: 1998, designer: '', grass: 'Bermuda',
        weatherPolicy: 'Play on in light rain.', bookingWindowDays: 30, freeCancelHours: 24,
    };

    it('takes the editable fields and normalises them like the admin form does', () => {
        expect(courseProfileInputSchema.parse(profile)).toEqual({
            ...profile, description: 'A links course.', address: null, amenities: ['cart'], designer: null,
        });
    });

    it('refuses what a course may not change, even when it is well-formed', () => {
        for (const extra of [{ slug: 'x' }, { timezone: 'Asia/Manila' }, { status: 'published' }, { currency: 'PHP' }, { name: 'New' }, { holes: 9 }]) {
            expect(courseProfileInputSchema.safeParse({ ...profile, ...extra }).success).toBe(false);
        }
    });

    it('needs every field, so a missing one is never read as "clear it"', () => {
        const { weatherPolicy: _w, ...rest } = profile;
        expect(courseProfileInputSchema.safeParse(rest).success).toBe(false);
    });

    it('applies the same limits as the admin form', () => {
        expect(courseProfileInputSchema.safeParse({ ...profile, bookingWindowDays: 91 }).success).toBe(false);
        expect(courseProfileInputSchema.safeParse({ ...profile, freeCancelHours: -1 }).success).toBe(false);
        expect(courseProfileInputSchema.safeParse({ ...profile, imageUrls: ['http://x.com/a.jpg'] }).success).toBe(false);
        expect(courseProfileInputSchema.safeParse({ ...profile, weatherPolicy: 'x'.repeat(501) }).success).toBe(false);
    });
});
