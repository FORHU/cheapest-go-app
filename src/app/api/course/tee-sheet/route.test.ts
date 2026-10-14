import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const guard = vi.hoisted(() => ({
    actor: { id: 'staff-1', email: 'staff@club.test', courseIds: ['6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44'] } as unknown,
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
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/server/golf/changes', () => ({ recordChange: vi.fn(async () => undefined) }));
vi.mock('@/lib/server/golf/teeSheet', () => ({ getTeeSheet: vi.fn() }));
vi.mock('@/lib/server/golf/teeTimes', () => ({
    createScheduleCounted: vi.fn(),
    updateSchedule: vi.fn(),
    deleteScheduleCounted: vi.fn(),
}));
vi.mock('@/lib/server/golf/blocks', () => ({ addBlock: vi.fn(), removeBlock: vi.fn() }));
vi.mock('@/lib/server/golf/bookings', () => ({ cancelBookingsByCourse: vi.fn() }));
vi.mock('@/lib/server/golf/extras', () => ({
    listCourseExtras: vi.fn(async () => [{ code: 'cart', price: 25 }]),
    setCourseExtras: vi.fn(),
}));

import { GET, POST } from './route';
import { getTeeSheet } from '@/lib/server/golf/teeSheet';
import { createScheduleCounted, deleteScheduleCounted, updateSchedule } from '@/lib/server/golf/teeTimes';
import { addBlock, removeBlock } from '@/lib/server/golf/blocks';
import { cancelBookingsByCourse } from '@/lib/server/golf/bookings';
import { setCourseExtras } from '@/lib/server/golf/extras';
import { recordChange } from '@/lib/server/golf/changes';
import { CourseNotSchedulableError, LastScheduleError } from '@/lib/server/golf/errors';
import { noImpact } from '@/lib/schemas/golfTeeSheet';

const mine = '6f1c2e0a-9b7d-4c1e-a2f5-3d8e1b0c7a44';
const theirs = '0a9d3c52-1f4e-4b7a-8c11-5e2d6f7a8b90';
const scheduleId = '1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9';
const schedule = {
    name: 'Daily', daysOfWeek: [1, 2, 3], firstTee: '07:00', lastTee: '09:00', intervalMinutes: 10, spots: 4, pricePerPlayer: 100,
};

const post = (body: unknown) =>
    POST(new Request('http://localhost/api/course/tee-sheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
        body: JSON.stringify(body),
    }) as never);
const get = (query: string) => GET(new Request(`http://localhost/api/course/tee-sheet${query}`) as never);

beforeEach(() => {
    vi.clearAllMocks();
    guard.actor = { id: 'staff-1', email: 'staff@club.test', courseIds: [mine] };
});

describe('GET /api/course/tee-sheet', () => {
    it('refuses anyone who is not course staff', async () => {
        guard.actor = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        expect((await get(`?courseId=${mine}`)).status).toBe(403);
        expect(getTeeSheet).not.toHaveBeenCalled();
    });

    it('reads a course as missing when it is not the caller\'s', async () => {
        expect((await get(`?courseId=${theirs}`)).status).toBe(404);
        expect(getTeeSheet).not.toHaveBeenCalled();
    });

    it('needs a course and a real date', async () => {
        expect((await get('')).status).toBe(400);
        expect((await get(`?courseId=${mine}&date=2030-02-30`)).status).toBe(400);
    });

    it('returns the sheet for the day asked for', async () => {
        vi.mocked(getTeeSheet).mockResolvedValueOnce({ course: { id: mine }, day: { date: '2030-01-10', teeTimes: [] } } as never);
        const res = await get(`?courseId=${mine}&date=2030-01-10`);
        expect(res.status).toBe(200);
        expect(getTeeSheet).toHaveBeenCalledWith(mine, '2030-01-10');
    });
});

describe('POST /api/course/tee-sheet', () => {
    it('refuses a course that is not theirs, whatever the action', async () => {
        for (const action of ['schedule_create', 'block_add', 'extras_set']) {
            expect((await post({ courseId: theirs, action })).status).toBe(404);
        }
        expect(createScheduleCounted).not.toHaveBeenCalled();
        expect(addBlock).not.toHaveBeenCalled();
    });

    it('previews a schedule without recording a change', async () => {
        vi.mocked(createScheduleCounted).mockResolvedValueOnce({
            schedule: { id: scheduleId } as never, impact: { ...noImpact(), created: 120 },
        });
        const res = await post({ courseId: mine, action: 'schedule_create', schedule, preview: true });
        expect(res.status).toBe(200);
        expect(createScheduleCounted).toHaveBeenCalledWith({ courseId: mine, input: expect.objectContaining({ name: 'Daily' }), dryRun: true });
        expect((await res.json()).data).toMatchObject({ preview: true, impact: { created: 120 } });
        expect(recordChange).not.toHaveBeenCalled();
    });

    it('applies a schedule and records who did it', async () => {
        vi.mocked(createScheduleCounted).mockResolvedValueOnce({
            schedule: { id: scheduleId } as never, impact: { ...noImpact(), created: 120 },
        });
        const res = await post({ courseId: mine, action: 'schedule_create', schedule });
        expect(res.status).toBe(201);
        expect(recordChange).toHaveBeenCalledWith(expect.objectContaining({
            courseId: mine, userId: 'staff-1', kind: 'schedule_created', summary: expect.stringContaining('120 tee times'),
        }));
    });

    it('validates a schedule and returns field errors', async () => {
        const res = await post({ courseId: mine, action: 'schedule_create', schedule: { ...schedule, intervalMinutes: 1 } });
        expect(res.status).toBe(400);
        expect((await res.json()).fieldErrors.intervalMinutes).toBeTruthy();
        expect(createScheduleCounted).not.toHaveBeenCalled();
    });

    it('updates a schedule, and says a missing one is missing', async () => {
        vi.mocked(updateSchedule).mockResolvedValueOnce({ schedule: { id: scheduleId } as never, impact: { ...noImpact(), updated: 40 } });
        expect((await post({ courseId: mine, action: 'schedule_update', scheduleId, schedule })).status).toBe(200);
        vi.mocked(updateSchedule).mockResolvedValueOnce(null);
        expect((await post({ courseId: mine, action: 'schedule_update', scheduleId, schedule })).status).toBe(404);
    });

    it('refuses to delete the last schedule of a published course', async () => {
        vi.mocked(deleteScheduleCounted).mockRejectedValueOnce(new LastScheduleError());
        const res = await post({ courseId: mine, action: 'schedule_delete', scheduleId });
        expect(res.status).toBe(409);
        expect(recordChange).not.toHaveBeenCalled();
    });

    it('asks for a time zone rather than failing', async () => {
        vi.mocked(createScheduleCounted).mockRejectedValueOnce(new CourseNotSchedulableError());
        const res = await post({ courseId: mine, action: 'schedule_create', schedule });
        expect(res.status).toBe(409);
        expect((await res.json()).error).toMatch(/time zone/);
    });

    it('adds a block and reports the bookings it sits on', async () => {
        vi.mocked(addBlock).mockResolvedValueOnce({
            block: { id: 'b1' } as never, impact: { ...noImpact(), closed: 4, affectedBookings: ['CG-ABC234'] },
        });
        const res = await post({ courseId: mine, action: 'block_add', block: { startsOn: '2030-01-10', endsOn: '2030-01-10', fromTime: '07:00', toTime: '09:30' } });
        expect(res.status).toBe(200);
        expect((await res.json()).data.impact.affectedBookings).toEqual(['CG-ABC234']);
        expect(addBlock).toHaveBeenCalledWith(expect.objectContaining({ courseId: mine, userId: 'staff-1', dryRun: false }));
    });

    describe('cancelling the bookings a block sits on', () => {
        const block = { startsOn: '2030-01-10', endsOn: '2030-01-10' };
        const affected = { ...noImpact(), closed: 4, affectedBookings: ['CG-AAA111', 'CG-BBB222'] };

        it('leaves the bookings alone unless asked', async () => {
            vi.mocked(addBlock).mockResolvedValueOnce({ block: { id: 'b1' } as never, impact: affected });
            const res = await post({ courseId: mine, action: 'block_add', block });
            expect(res.status).toBe(200);
            expect(cancelBookingsByCourse).not.toHaveBeenCalled();
            expect((await res.json()).data.cancellation).toBeUndefined();
        });

        it('cancels the affected bookings for this course, records it, and says what happened', async () => {
            vi.mocked(addBlock).mockResolvedValueOnce({ block: { id: 'b1' } as never, impact: affected });
            vi.mocked(cancelBookingsByCourse).mockResolvedValueOnce({ cancelled: ['CG-AAA111', 'CG-BBB222'], failed: [] });
            const res = await post({ courseId: mine, action: 'block_add', block, cancelBookings: true });
            expect(res.status).toBe(200);
            expect(cancelBookingsByCourse).toHaveBeenCalledWith({ courseId: mine, references: ['CG-AAA111', 'CG-BBB222'] });
            expect((await res.json()).data.cancellation).toEqual({ cancelled: ['CG-AAA111', 'CG-BBB222'], failed: [] });
            expect(recordChange).toHaveBeenCalledWith(expect.objectContaining({
                kind: 'block_added', summary: expect.stringContaining('2 bookings cancelled and refunded'),
            }));
        });

        it('reports the ones that could not be cancelled, in the history as well', async () => {
            vi.mocked(addBlock).mockResolvedValueOnce({ block: { id: 'b1' } as never, impact: affected });
            vi.mocked(cancelBookingsByCourse).mockResolvedValueOnce({
                cancelled: ['CG-AAA111'], failed: [{ reference: 'CG-BBB222', error: 'card network unavailable' }],
            });
            const res = await post({ courseId: mine, action: 'block_add', block, cancelBookings: true });
            expect(res.status).toBe(200);
            expect((await res.json()).data.cancellation.failed).toEqual([{ reference: 'CG-BBB222', error: 'card network unavailable' }]);
            expect(recordChange).toHaveBeenCalledWith(expect.objectContaining({
                summary: expect.stringMatching(/1 booking cancelled and refunded.*1 could not be cancelled/),
            }));
        });

        it('never cancels in a preview', async () => {
            vi.mocked(addBlock).mockResolvedValueOnce({ block: { id: 'b1' } as never, impact: affected });
            const res = await post({ courseId: mine, action: 'block_add', block, cancelBookings: true, preview: true });
            expect(res.status).toBe(200);
            expect(cancelBookingsByCourse).not.toHaveBeenCalled();
            expect(addBlock).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
        });

        it('does nothing extra when the block touches no booking', async () => {
            vi.mocked(addBlock).mockResolvedValueOnce({ block: { id: 'b1' } as never, impact: { ...noImpact(), closed: 4 } });
            const res = await post({ courseId: mine, action: 'block_add', block, cancelBookings: true });
            expect(res.status).toBe(200);
            expect(cancelBookingsByCourse).not.toHaveBeenCalled();
        });
    });

    it('rejects a block with one end of the window', async () => {
        const res = await post({ courseId: mine, action: 'block_add', block: { startsOn: '2030-01-10', endsOn: '2030-01-10', fromTime: '07:00' } });
        expect(res.status).toBe(400);
        expect(addBlock).not.toHaveBeenCalled();
    });

    it('removes a block, and says a missing one is missing', async () => {
        vi.mocked(removeBlock).mockResolvedValueOnce({ impact: { ...noImpact(), reopened: 4 } });
        expect((await post({ courseId: mine, action: 'block_remove', blockId: scheduleId })).status).toBe(200);
        vi.mocked(removeBlock).mockResolvedValueOnce(null);
        expect((await post({ courseId: mine, action: 'block_remove', blockId: scheduleId })).status).toBe(404);
    });

    it('sets extras, and a preview does not', async () => {
        vi.mocked(setCourseExtras).mockResolvedValueOnce([{ code: 'cart', price: 30 }]);
        expect((await post({ courseId: mine, action: 'extras_set', extras: [{ code: 'cart', price: 30 }] })).status).toBe(200);
        expect(setCourseExtras).toHaveBeenCalledWith(mine, [{ code: 'cart', price: 30 }]);

        vi.mocked(setCourseExtras).mockClear();
        expect((await post({ courseId: mine, action: 'extras_set', extras: [{ code: 'cart', price: 30 }], preview: true })).status).toBe(200);
        expect(setCourseExtras).not.toHaveBeenCalled();
        expect((await post({ courseId: mine, action: 'extras_set', extras: [{ code: 'jetpack', price: 1 }] })).status).toBe(400);
    });

    it('rejects an unknown action', async () => {
        expect((await post({ courseId: mine, action: 'fly' })).status).toBe(400);
    });
});
