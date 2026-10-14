import { describe, it, expect, afterAll } from 'vitest';
import type { CourseProfileInput, GolfCourseInput, TeeTimeScheduleInput } from '@/lib/schemas/golf';
import { golfPhotoPath } from '@/lib/schemas/golf';
import { createCourse, deleteCourses, setCourseStatus } from './courses';
import { createScheduleCounted } from './teeTimes';
import { recordChange } from './changes';
import { diffProfile, PhotoNotOwnedError, updateProfile } from './profile';

/**
 * Course profile editing against a real database. Skips when no database is reachable.
 * Dates are in 2030 so nothing real collides.
 */

async function databaseReachable(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin()`SELECT id FROM golf_course_photos LIMIT 1`;
        return true;
    } catch {
        return false;
    }
}

const reachable = await databaseReachable();
const run = crypto.randomUUID().slice(0, 8);
const courses: string[] = [];
const users: string[] = [];
/** Midnight UTC, Sunday 6 January 2030. */
const NOW = new Date('2030-01-06T00:00:00Z');

async function sql() {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    return getSqlAdmin();
}

async function course(over: Partial<GolfCourseInput> = {}) {
    const input: GolfCourseInput = {
        name: `Profile ${run} ${courses.length}`, country: 'Profileland', city: 'Testville',
        slug: `profile-${run}-${courses.length}`, address: null, description: 'Before.', holes: 18, par: 72,
        greenFeeFrom: 50, currency: 'PHP', imageUrls: [], amenities: [], timezone: 'Asia/Manila',
        freeCancelHours: 48, bookingWindowDays: 60, weatherPolicy: '', yardage: null, yearOpened: null,
        designer: null, grass: null, ...over,
    };
    const c = await createCourse(input);
    courses.push(c.id);
    return c;
}

const daily: TeeTimeScheduleInput = {
    name: 'Daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], firstTee: '07:00', lastTee: '07:30',
    intervalMinutes: 10, spots: 4, pricePerPlayer: 100,
};

async function scheduled(over: Partial<GolfCourseInput> = {}) {
    const c = await course(over);
    await createScheduleCounted({ courseId: c.id, input: daily, now: NOW });
    return c;
}

const profileOf = (c: Awaited<ReturnType<typeof course>>, over: Partial<CourseProfileInput> = {}): CourseProfileInput => ({
    description: c.description, address: c.address, amenities: c.amenities, imageUrls: c.imageUrls, par: c.par,
    yardage: c.yardage, yearOpened: c.yearOpened, designer: c.designer, grass: c.grass,
    weatherPolicy: c.weatherPolicy, bookingWindowDays: c.bookingWindowDays, freeCancelHours: c.freeCancelHours, ...over,
});

async function addPhoto(courseId: string, createdAt: Date = new Date()) {
    const db = await sql();
    const id = crypto.randomUUID();
    await db`
        INSERT INTO golf_course_photos (id, course_id, storage_key, content_type, size_bytes, created_at)
        VALUES (${id}, ${courseId}, ${`golf/${courseId}/${id}.jpg`}, 'image/jpeg', 1000, ${createdAt})`;
    return id;
}

async function photoIds(courseId: string) {
    const db = await sql();
    const rows = await db<{ id: string }[]>`SELECT id FROM golf_course_photos WHERE course_id = ${courseId}`;
    return rows.map(r => r.id).sort();
}

afterAll(async () => {
    if (!reachable) return;
    const db = await sql();
    if (courses.length) await db`DELETE FROM golf_bookings WHERE course_id IN ${db(courses)}`;
    if (courses.length) await deleteCourses(courses);
    if (users.length) await db`DELETE FROM users WHERE id IN ${db(users)}`;
});

describe('diffProfile', () => {
    const before: CourseProfileInput = {
        description: 'a', address: null, amenities: ['cart'], imageUrls: ['https://x.com/1.jpg'], par: 72, yardage: null,
        yearOpened: null, designer: null, grass: null, weatherPolicy: '', bookingWindowDays: 60, freeCancelHours: 48,
    };

    it('names only what changed, with the before and after', () => {
        const after: CourseProfileInput = { ...before, description: 'b', amenities: ['cart', 'caddie'] };
        expect(diffProfile(before, after)).toEqual({
            description: ['a', 'b'],
            amenities: [['cart'], ['cart', 'caddie']],
        });
    });

    it('is empty when nothing changed', () => {
        expect(diffProfile(before, { ...before })).toEqual({});
    });

    it('treats a reordered photo list as a change and a reordered amenity list as none', () => {
        const two = { ...before, imageUrls: ['https://x.com/1.jpg', 'https://x.com/2.jpg'] };
        expect(Object.keys(diffProfile(two, { ...two, imageUrls: [...two.imageUrls].reverse() }))).toEqual(['imageUrls']);
        const amen: CourseProfileInput = { ...before, amenities: ['cart', 'caddie'] };
        expect(diffProfile(amen, { ...amen, amenities: ['caddie', 'cart'] })).toEqual({});
    });
});

describe.skipIf(!reachable)('updateProfile', () => {
    it('changes the editable fields and nothing else about the course', async () => {
        const c = await course();
        const result = await updateProfile({
            courseId: c.id,
            input: profileOf(c, { description: 'After.', par: 70, weatherPolicy: 'Play on.', freeCancelHours: 24, amenities: ['cart'] }),
        });
        expect(result!.course).toMatchObject({
            description: 'After.', par: 70, weatherPolicy: 'Play on.', freeCancelHours: 24, amenities: ['cart'],
            // Not the course's to change:
            name: c.name, slug: c.slug, country: c.country, city: c.city, currency: 'PHP',
            timezone: 'Asia/Manila', status: 'draft', holes: 18, greenFeeFrom: 50,
        });
        expect(Object.keys(result!.changes).sort()).toEqual(['amenities', 'description', 'freeCancelHours', 'par', 'weatherPolicy']);
    });

    it('writes nothing on a dry run but reports the same changes', async () => {
        const c = await course();
        const result = await updateProfile({ courseId: c.id, input: profileOf(c, { description: 'Preview.' }), dryRun: true });
        expect(result!.changes).toEqual({ description: ['Before.', 'Preview.'] });
        const db = await sql();
        const [row] = await db<{ description: string }[]>`SELECT description FROM golf_courses WHERE id = ${c.id}`;
        expect(row.description).toBe('Before.');
    });

    it('is null for a course that does not exist', async () => {
        const c = await course();
        expect(await updateProfile({ courseId: crypto.randomUUID(), input: profileOf(c) })).toBeNull();
    });

    it('keeps a published course published', async () => {
        const c = await scheduled();
        await setCourseStatus(c.id, 'published');
        const result = await updateProfile({ courseId: c.id, input: profileOf(c, { description: 'Live edit.' }) });
        expect(result!.course.status).toBe('published');
    });

    it('counts what a shorter window stops selling, and keeps every tee time and booking', async () => {
        const c = await scheduled();
        const db = await sql();
        const [user] = await db<{ id: string }[]>`INSERT INTO users (email) VALUES (${`profile-${run}-u@example.com`}) RETURNING id`;
        users.push(user.id);
        const [tt] = await db<{ id: string }[]>`
            SELECT id FROM golf_tee_times WHERE course_id = ${c.id} AND starts_at >= '2030-02-14T00:00:00Z' ORDER BY starts_at LIMIT 1`;
        await db`
            INSERT INTO golf_bookings (reference, user_id, course_id, tee_time_id, players, lead_name, contact_email,
                price_per_player, green_fee_total, service_fee, total, currency, hold_expires_at, free_cancel_until, status)
            VALUES (${`CG-P${run.slice(0, 5).toUpperCase()}`}, ${user.id}, ${c.id}, ${tt.id}, 2, 'Test', 'p@example.com',
                100, 200, 5, 205, 'PHP', ${NOW}, ${NOW}, 'confirmed')`;
        const [{ total }] = await db<{ total: number }[]>`SELECT count(*)::int AS total FROM golf_tee_times WHERE course_id = ${c.id}`;
        // Sold while lead <= (window + 1) days: shortening to 10 leaves days beyond 11 days out.
        const [{ beyond }] = await db<{ beyond: number }[]>`
            SELECT count(*)::int AS beyond FROM golf_tee_times
             WHERE course_id = ${c.id} AND status = 'open' AND starts_at > ${NOW}::timestamptz + interval '11 days'`;

        const preview = await updateProfile({ courseId: c.id, input: profileOf(c, { bookingWindowDays: 10 }), now: NOW, dryRun: true });
        expect(preview!.windowImpact).toEqual({ stopsSelling: beyond, withBookings: 1 });

        const applied = await updateProfile({ courseId: c.id, input: profileOf(c, { bookingWindowDays: 10 }), now: NOW });
        expect(applied!.windowImpact).toEqual({ stopsSelling: beyond, withBookings: 1 });
        const [{ after }] = await db<{ after: number }[]>`SELECT count(*)::int AS after FROM golf_tee_times WHERE course_id = ${c.id}`;
        expect(after).toBe(total);
        const [{ bookings }] = await db<{ bookings: number }[]>`SELECT count(*)::int AS bookings FROM golf_bookings WHERE course_id = ${c.id}`;
        expect(bookings).toBe(1);
    });

    it('opens more days when the window widens, by generating them now', async () => {
        const c = await scheduled({ bookingWindowDays: 5 });
        const db = await sql();
        const count = async () => (await db<{ n: number }[]>`SELECT count(*)::int AS n FROM golf_tee_times WHERE course_id = ${c.id}`)[0].n;
        const before = await count();
        const result = await updateProfile({ courseId: c.id, input: profileOf(c, { bookingWindowDays: 20 }), now: NOW });
        expect(result!.windowImpact).toEqual({ stopsSelling: 0, withBookings: 0 });
        expect(result!.created).toBeGreaterThan(0);
        expect(await count()).toBe(before + result!.created);
    });

    it('leaves a course\'s own time zone and clock alone when it has no schedule', async () => {
        const c = await course({ timezone: null });
        const result = await updateProfile({ courseId: c.id, input: profileOf(c, { bookingWindowDays: 30 }) });
        expect(result!.created).toBe(0);
        expect(result!.course.timezone).toBeNull();
    });
});

describe.skipIf(!reachable)('photos in a profile', () => {
    it('accepts the course\'s own uploaded photos', async () => {
        const c = await course();
        const id = await addPhoto(c.id);
        const result = await updateProfile({ courseId: c.id, input: profileOf(c, { imageUrls: [golfPhotoPath(id), 'https://x.com/a.jpg'] }) });
        expect(result!.course.imageUrls).toEqual([golfPhotoPath(id), 'https://x.com/a.jpg']);
    });

    it('refuses a photo that belongs to another course', async () => {
        const mine = await course();
        const theirs = await course();
        const id = await addPhoto(theirs.id);
        await expect(updateProfile({ courseId: mine.id, input: profileOf(mine, { imageUrls: [golfPhotoPath(id)] }) }))
            .rejects.toBeInstanceOf(PhotoNotOwnedError);
        await expect(updateProfile({ courseId: mine.id, input: profileOf(mine, { imageUrls: [golfPhotoPath(crypto.randomUUID())] }) }))
            .rejects.toBeInstanceOf(PhotoNotOwnedError);
    });

    it('drops a photo taken out of the list and one left unused for over an hour, keeping a fresh upload', async () => {
        const c = await course();
        const kept = await addPhoto(c.id);
        const removed = await addPhoto(c.id);
        await updateProfile({ courseId: c.id, input: profileOf(c, { imageUrls: [golfPhotoPath(kept), golfPhotoPath(removed)] }) });

        const stale = await addPhoto(c.id, new Date(Date.now() - 2 * 3_600_000));
        const fresh = await addPhoto(c.id);
        await updateProfile({ courseId: c.id, input: profileOf(c, { imageUrls: [golfPhotoPath(kept)] }) });

        expect(await photoIds(c.id)).toEqual([kept, fresh].sort());
        expect(await photoIds(c.id)).not.toContain(removed);
        expect(await photoIds(c.id)).not.toContain(stale);
    });
});

describe.skipIf(!reachable)('the course history', () => {
    it('stores a change\'s details as a JSON object, not a string of one', async () => {
        const c = await course();
        await recordChange({ courseId: c.id, userId: null, kind: 'profile_updated', summary: 'Changed description', details: { description: ['a', 'b'] } });
        const db = await sql();
        const [row] = await db<{ type: string; before: string }[]>`
            SELECT jsonb_typeof(details) AS type, details->'description'->>0 AS before
              FROM golf_course_changes WHERE course_id = ${c.id}`;
        expect(row).toEqual({ type: 'object', before: 'a' });
    });
});
