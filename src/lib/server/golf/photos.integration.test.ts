import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest';

vi.mock('@/lib/server/storage/s3', () => ({
    attachmentsConfigured: vi.fn(() => true),
    putObject: vi.fn(async () => undefined),
    deleteObject: vi.fn(async () => undefined),
    getObject: vi.fn(async () => Buffer.from('bytes')),
}));

import { putObject, getObject, deleteObject } from '@/lib/server/storage/s3';
import type { GolfCourseInput } from '@/lib/schemas/golf';
import { createCourse, deleteCourses } from './courses';
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_COURSE, readPhoto, storePhoto } from './photos';
import { PhotoRejectedError } from './errors';

/** Course photo storage: the checks on the bytes, the cap, and the order object-then-row. */

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

async function sql() {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    return getSqlAdmin();
}

async function course() {
    const input: GolfCourseInput = {
        name: `Photos ${run} ${courses.length}`, country: 'Photoland', city: 'Testville', slug: `photos-${run}-${courses.length}`,
        address: null, description: '', holes: 18, par: null, greenFeeFrom: null, currency: 'USD', imageUrls: [],
        amenities: [], timezone: 'Asia/Manila', freeCancelHours: 48, bookingWindowDays: 60, weatherPolicy: '',
        yardage: null, yearOpened: null, designer: null, grass: null,
    };
    const c = await createCourse(input);
    courses.push(c.id);
    return c;
}

const pad = (head: number[]) => Buffer.concat([Buffer.from(head), Buffer.alloc(64)]);
const jpeg = () => pad([0xff, 0xd8, 0xff, 0xe0]);
const png = () => pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = () => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(32)]);

const rejection = async (p: Promise<unknown>) => {
    try {
        await p;
    } catch (err) {
        if (err instanceof PhotoRejectedError) return err.code;
        throw err;
    }
    return null;
};

beforeEach(() => vi.clearAllMocks());

afterAll(async () => {
    if (!reachable) return;
    if (courses.length) await deleteCourses(courses);
});

describe.skipIf(!reachable)('storePhoto', () => {
    it('stores a JPEG under golf/<course>/ and returns its app path', async () => {
        const c = await course();
        const stored = await storePhoto({ courseId: c.id, userId: null, bytes: jpeg() });
        expect(stored.url).toBe(`/golf-photos/${stored.id}`);
        expect(putObject).toHaveBeenCalledWith(expect.objectContaining({
            key: `golf/${c.id}/${stored.id}.jpg`, contentType: 'image/jpeg',
        }));
        const db = await sql();
        const [row] = await db<{ type: string; key: string; size: number }[]>`
            SELECT content_type AS type, storage_key AS key, size_bytes AS size FROM golf_course_photos WHERE id = ${stored.id}`;
        expect(row).toEqual({ type: 'image/jpeg', key: `golf/${c.id}/${stored.id}.jpg`, size: jpeg().length });
    });

    it('identifies PNG and WebP by their bytes, whatever the file was called', async () => {
        const c = await course();
        expect((await storePhoto({ courseId: c.id, userId: null, bytes: png() })).url).toBeTruthy();
        expect((await storePhoto({ courseId: c.id, userId: null, bytes: webp() })).url).toBeTruthy();
        expect(vi.mocked(putObject).mock.calls.map(([arg]) => arg.contentType)).toEqual(['image/png', 'image/webp']);
    });

    it('refuses empty, oversize, HTML dressed as an image, GIF and PDF', async () => {
        const c = await course();
        const code = (bytes: Buffer) => rejection(storePhoto({ courseId: c.id, userId: null, bytes }));
        expect(await code(Buffer.alloc(0))).toBe('empty');
        expect(await code(Buffer.concat([jpeg(), Buffer.alloc(MAX_PHOTO_BYTES)]))).toBe('too_large');
        expect(await code(Buffer.from('<html><script>alert(1)</script></html>'))).toBe('unsupported_type');
        expect(await code(Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32)]))).toBe('unsupported_type');
        expect(await code(Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(32)]))).toBe('unsupported_type');
        expect(putObject).not.toHaveBeenCalled();
    });

    it('stops at the per-course cap, counted across everything uploaded', async () => {
        const c = await course();
        const db = await sql();
        await db`
            INSERT INTO golf_course_photos (course_id, storage_key, content_type, size_bytes)
            SELECT ${c.id}, 'golf/' || ${c.id} || '/cap-' || g, 'image/jpeg', 10
              FROM generate_series(1, ${MAX_PHOTOS_PER_COURSE}) g`;
        expect(await rejection(storePhoto({ courseId: c.id, userId: null, bytes: jpeg() }))).toBe('too_many');
        expect(putObject).not.toHaveBeenCalled();
    });

    it('leaves no row behind when the object could not be stored', async () => {
        const c = await course();
        vi.mocked(putObject).mockRejectedValueOnce(new Error('S3 down'));
        await expect(storePhoto({ courseId: c.id, userId: null, bytes: jpeg() })).rejects.toThrow('S3 down');
        const db = await sql();
        const [{ n }] = await db<{ n: number }[]>`SELECT count(*)::int AS n FROM golf_course_photos WHERE course_id = ${c.id}`;
        expect(n).toBe(0);
    });
});

describe.skipIf(!reachable)('readPhoto', () => {
    it('returns the bytes with the type recorded at upload', async () => {
        const c = await course();
        const { id } = await storePhoto({ courseId: c.id, userId: null, bytes: png() });
        const photo = await readPhoto(id);
        expect(photo?.contentType).toBe('image/png');
        expect(photo?.bytes.toString()).toBe('bytes');
        expect(getObject).toHaveBeenCalledWith(`golf/${c.id}/${id}.png`);
    });

    it('is null for an unknown or malformed id, without touching storage', async () => {
        expect(await readPhoto(crypto.randomUUID())).toBeNull();
        expect(await readPhoto('../../etc/passwd')).toBeNull();
        expect(getObject).not.toHaveBeenCalled();
    });

    it('is null when the object has gone missing', async () => {
        const c = await course();
        const { id } = await storePhoto({ courseId: c.id, userId: null, bytes: jpeg() });
        vi.mocked(getObject).mockResolvedValueOnce(null);
        expect(await readPhoto(id)).toBeNull();
        expect(deleteObject).not.toHaveBeenCalled();
    });
});
