import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const auth = vi.hoisted(() => ({ result: { user: { id: 'admin-1', email: 'a@x.com' } } as unknown }));

vi.mock('@/lib/server/admin', () => ({
    requireAdmin: vi.fn(async () => auth.result),
    isAuthError: (r: unknown) => r instanceof Response,
}));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/server/golf/extras', () => ({
    listCourseExtras: vi.fn(async () => [{ code: 'caddie', price: 30 }]),
    setCourseExtras: vi.fn(async (_courseId: string, offers: unknown) => offers),
}));

import { GET, POST } from './route';
import { setCourseExtras } from '@/lib/server/golf/extras';

const courseId = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';
const post = (body: unknown) =>
    POST(new Request('http://localhost/api/admin/golf-extras', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }) as never);

beforeEach(() => { auth.result = { user: { id: 'admin-1', email: 'a@x.com' } }; });

describe('/api/admin/golf-extras', () => {
    it('refuses anyone who is not an admin', async () => {
        auth.result = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        expect((await post({ courseId, extras: [] })).status).toBe(403);
    });

    it('lists a course\'s extras, and needs the course id', async () => {
        const res = await GET(new Request(`http://localhost/api/admin/golf-extras?courseId=${courseId}`) as never);
        expect(await res.json()).toEqual({ success: true, data: [{ code: 'caddie', price: 30 }] });
        expect((await GET(new Request('http://localhost/api/admin/golf-extras') as never)).status).toBe(400);
    });

    it('replaces the offer', async () => {
        const extras = [{ code: 'club_rental', price: 45 }, { code: 'cart', price: 25 }];
        const res = await post({ courseId, extras });
        expect(res.status).toBe(200);
        expect(setCourseExtras).toHaveBeenCalledWith(courseId, extras);
    });

    it('refuses a bad offer and an unknown course', async () => {
        expect((await post({ courseId, extras: [{ code: 'jetpack', price: 1 }] })).status).toBe(400);
        vi.mocked(setCourseExtras).mockResolvedValueOnce(null);
        expect((await post({ courseId, extras: [] })).status).toBe(404);
    });
});
