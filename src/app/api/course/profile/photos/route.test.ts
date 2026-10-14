import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const guard = vi.hoisted(() => ({
    actor: { id: 'staff-1', email: 'staff@club.test', courseIds: ['6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44'] } as unknown,
    configured: true,
}));

vi.mock('@/lib/server/golf/courseAccess', async importOriginal => {
    const original = await importOriginal<typeof import('@/lib/server/golf/courseAccess')>();
    return {
        ...original,
        requireCourseStaff: vi.fn(async () => guard.actor),
        isCourseAuthError: (r: unknown) => r instanceof Response,
    };
});
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/storage/s3', () => ({ attachmentsConfigured: () => guard.configured }));
vi.mock('@/lib/server/golf/photos', async importOriginal => {
    const original = await importOriginal<typeof import('@/lib/server/golf/photos')>();
    return { ...original, storePhoto: vi.fn() };
});

import { POST } from './route';
import { storePhoto } from '@/lib/server/golf/photos';
import { PhotoRejectedError } from '@/lib/server/golf/errors';

const mine = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';
const theirs = '0a9d3c52-1f4e-4b7a-8c11-5e2d6f7a8b90';

function upload(fields: { courseId?: string; file?: Blob | null } = {}, headers: Record<string, string> = {}) {
    const form = new FormData();
    if (fields.courseId !== undefined) form.set('courseId', fields.courseId);
    if (fields.file !== null) form.set('file', fields.file ?? new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'a.jpg', { type: 'image/jpeg' }));
    return POST(new Request('http://localhost/api/course/profile/photos', {
        method: 'POST', headers: { 'X-Requested-By': 'cheapestgo-client', ...headers }, body: form,
    }) as never);
}

beforeEach(() => {
    vi.clearAllMocks();
    guard.actor = { id: 'staff-1', email: 'staff@club.test', courseIds: [mine] };
    guard.configured = true;
});

describe('POST /api/course/profile/photos', () => {
    it('refuses anyone who is not course staff', async () => {
        guard.actor = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        expect((await upload({ courseId: mine })).status).toBe(403);
        expect(storePhoto).not.toHaveBeenCalled();
    });

    it('refuses a request without the client header', async () => {
        const res = await POST(new Request('http://localhost/api/course/profile/photos', {
            method: 'POST', headers: { Origin: 'https://evil.example' }, body: new FormData(),
        }) as never);
        expect(res.status).toBe(403);
        expect(storePhoto).not.toHaveBeenCalled();
    });

    it('reads a course that is not theirs as missing', async () => {
        expect((await upload({ courseId: theirs })).status).toBe(404);
        expect(storePhoto).not.toHaveBeenCalled();
    });

    it('needs a course and a file', async () => {
        expect((await upload({})).status).toBe(400);
        expect((await upload({ courseId: mine, file: null })).status).toBe(400);
    });

    it('says so when uploads are not configured, so the page can fall back to URLs', async () => {
        guard.configured = false;
        expect((await upload({ courseId: mine })).status).toBe(503);
    });

    it('stores the photo for the caller and returns its path', async () => {
        vi.mocked(storePhoto).mockResolvedValueOnce({ id: 'p1', url: '/golf-photos/p1' });
        const res = await upload({ courseId: mine });
        expect(res.status).toBe(201);
        expect(storePhoto).toHaveBeenCalledWith(expect.objectContaining({ courseId: mine, userId: 'staff-1' }));
        expect((await res.json()).data).toEqual({ id: 'p1', url: '/golf-photos/p1' });
    });

    it('relays why a photo was refused', async () => {
        vi.mocked(storePhoto).mockRejectedValueOnce(new PhotoRejectedError('unsupported_type'));
        const res = await upload({ courseId: mine });
        expect(res.status).toBe(415);
        expect((await res.json()).error).toMatch(/JPEG, PNG or WebP/);
    });

    it('refuses an oversize body before reading it', async () => {
        // A real Request computes its own content-length from the body, so state it on a stub.
        const formData = vi.fn(async () => new FormData());
        const res = await POST({
            method: 'POST',
            headers: new Headers({ 'x-requested-by': 'cheapestgo-client', 'content-length': String(50 * 1024 * 1024) }),
            formData,
        } as never);
        expect(res.status).toBe(413);
        expect(formData).not.toHaveBeenCalled();
        expect(storePhoto).not.toHaveBeenCalled();
    });
});
