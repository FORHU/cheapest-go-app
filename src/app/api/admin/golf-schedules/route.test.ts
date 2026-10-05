import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const auth = vi.hoisted(() => ({ result: { user: { id: 'admin-1', email: 'a@x.com' } } as unknown }));

vi.mock('@/lib/server/admin', () => ({
    requireAdmin: vi.fn(async () => auth.result),
    isAuthError: (r: unknown) => r instanceof Response,
}));
vi.mock('@/lib/server/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/server/golf/teeTimes', () => ({
    listSchedules: vi.fn(async () => []),
    createSchedule: vi.fn(async (_courseId: string, input: { name: string }) => ({ schedule: { id: 's1', ...input }, generated: 236 })),
    deleteSchedule: vi.fn(async () => true),
}));

import { GET, POST } from './route';
import { createSchedule, deleteSchedule } from '@/lib/server/golf/teeTimes';
import { CourseNotSchedulableError } from '@/lib/server/golf/errors';

const courseId = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';
const schedule = { name: 'Weekday mornings', daysOfWeek: [1, 2, 3, 4, 5], firstTee: '06:00', lastTee: '11:00', intervalMinutes: 10, pricePerPlayer: 2500 };
const post = (body: unknown) =>
    POST(new Request('http://localhost/api/admin/golf-schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }) as never);

beforeEach(() => { auth.result = { user: { id: 'admin-1', email: 'a@x.com' } }; });

describe('/api/admin/golf-schedules', () => {
    it('refuses anyone who is not an admin', async () => {
        auth.result = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        expect((await GET(new Request(`http://localhost/api/admin/golf-schedules?courseId=${courseId}`) as never)).status).toBe(403);
    });

    it('needs a course id to list', async () => {
        expect((await GET(new Request('http://localhost/api/admin/golf-schedules') as never)).status).toBe(400);
    });

    it('creates a schedule and reports how many tee times it made', async () => {
        const res = await post({ action: 'create', courseId, schedule });
        expect(res.status).toBe(201);
        expect(await res.json()).toMatchObject({ success: true, generated: 236 });
        expect(createSchedule).toHaveBeenCalledWith(courseId, expect.objectContaining({ spots: 4, daysOfWeek: [1, 2, 3, 4, 5] }));
    });

    it('answers invalid input with errors per field', async () => {
        const res = await post({ action: 'create', courseId, schedule: { ...schedule, lastTee: '05:00' } });
        expect(res.status).toBe(400);
        expect((await res.json()).fieldErrors.lastTee).toBeDefined();
    });

    it('answers a course without a time zone with 409', async () => {
        vi.mocked(createSchedule).mockRejectedValueOnce(new CourseNotSchedulableError());
        expect((await post({ action: 'create', courseId, schedule })).status).toBe(409);
    });

    it('deletes a schedule, 404 when it is gone', async () => {
        expect((await post({ action: 'delete', id: courseId })).status).toBe(200);
        vi.mocked(deleteSchedule).mockResolvedValueOnce(false);
        expect((await post({ action: 'delete', id: courseId })).status).toBe(404);
    });
});
