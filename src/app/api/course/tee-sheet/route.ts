import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkCsrf } from '@/lib/server/csrf';
import { rateLimit } from '@/lib/server/rate-limit';
import { logAdminAction } from '@/lib/server/admin/audit';
import { golfExtrasInputSchema, teeTimeScheduleInputSchema } from '@/lib/schemas/golf';
import { blockInputSchema, noImpact, type Impact } from '@/lib/schemas/golfTeeSheet';
import { isIsoDate } from '@/lib/golf/time';
import { isCourseAuthError, requireCourseStaff, type CourseStaffActor } from '@/lib/server/golf/courseAccess';
import { getTeeSheet } from '@/lib/server/golf/teeSheet';
import { createScheduleCounted, deleteScheduleCounted, updateSchedule } from '@/lib/server/golf/teeTimes';
import { addBlock, removeBlock } from '@/lib/server/golf/blocks';
import { cancelBookingsByCourse } from '@/lib/server/golf/bookings';
import { listCourseExtras, setCourseExtras } from '@/lib/server/golf/extras';
import { recordChange } from '@/lib/server/golf/changes';
import { CourseNotSchedulableError, CourseStaffError, LastScheduleError } from '@/lib/server/golf/errors';

export const dynamic = 'force-dynamic';

/**
 * A course's own tee sheet: schedules, blocks and extras. Every change applies immediately and
 * is recorded in the course's history; `preview: true` returns what it would do and writes
 * nothing. A course that is not the caller's reads as missing.
 */

const uuid = z.string().uuid();

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
    return NextResponse.json({ success: false, error, ...extra }, { status });
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, { limit: 60, windowMs: 60_000, prefix: 'course-tee-sheet' });
    if (!rl.success) return fail(429, 'Too many requests');

    const actor = await requireCourseStaff();
    if (isCourseAuthError(actor)) return actor;

    const params = new URL(req.url).searchParams;
    const courseId = uuid.safeParse(params.get('courseId'));
    if (!courseId.success) return fail(400, 'courseId is required');
    if (!actor.courseIds.includes(courseId.data)) return fail(404, 'Course not found');

    const date = params.get('date');
    if (date && !isIsoDate(date)) return fail(400, 'date must be YYYY-MM-DD');

    const sheet = await getTeeSheet(courseId.data, date ?? undefined);
    if (!sheet) return fail(404, 'Course not found');
    return NextResponse.json({ success: true, data: sheet });
}

export async function POST(req: NextRequest) {
    const csrf = checkCsrf(req);
    if (csrf) return csrf;
    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, prefix: 'course-tee-sheet-post' });
    if (!rl.success) return fail(429, 'Too many requests');

    const actor = await requireCourseStaff();
    if (isCourseAuthError(actor)) return actor;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return fail(400, 'Invalid JSON');
    const courseId = uuid.safeParse(body.courseId);
    if (!courseId.success) return fail(400, 'courseId is required');
    if (!actor.courseIds.includes(courseId.data)) return fail(404, 'Course not found');
    const preview = body.preview === true;

    try {
        return await handle({ actor, courseId: courseId.data, body, preview });
    } catch (err) {
        if (err instanceof CourseNotSchedulableError) return fail(409, 'Ask the team to set the course time zone first.');
        if (err instanceof LastScheduleError) return fail(409, err.message);
        if (err instanceof CourseStaffError) return fail(err.httpStatus, err.message);
        throw err;
    }
}

async function handle(
    { actor, courseId, body, preview }:
    { actor: CourseStaffActor; courseId: string; body: Record<string, unknown>; preview: boolean },
) {
    const done = async (
        impact: Impact,
        change: { kind: Parameters<typeof recordChange>[0]['kind']; summary: string; details?: Record<string, unknown> },
        data: Record<string, unknown> = {},
    ) => {
        if (!preview) {
            await recordChange({ courseId, userId: actor.id, ...change });
            logAdminAction({
                action: `course_${change.kind}`, adminId: actor.id, adminEmail: actor.email,
                targetId: courseId, details: { summary: change.summary },
            });
        }
        return NextResponse.json({ success: true, data: { preview, impact, ...data } }, { status: !preview && change.kind.endsWith('_created') ? 201 : 200 });
    };

    switch (body.action) {
        case 'schedule_create': {
            const parsed = teeTimeScheduleInputSchema.safeParse(body.schedule);
            if (!parsed.success) return fail(400, 'Some fields need attention', { fieldErrors: z.flattenError(parsed.error).fieldErrors });
            const result = await createScheduleCounted({ courseId, input: parsed.data, dryRun: preview });
            if (!result) return fail(404, 'Course not found');
            return done(result.impact, {
                kind: 'schedule_created',
                summary: `Added schedule "${parsed.data.name}" (${plural(result.impact.created, 'tee time', 'tee times')})`,
                details: { scheduleId: result.schedule.id, ...parsed.data },
            }, { schedule: result.schedule });
        }
        case 'schedule_update': {
            const scheduleId = uuid.safeParse(body.scheduleId);
            if (!scheduleId.success) return fail(400, 'scheduleId is required');
            const parsed = teeTimeScheduleInputSchema.safeParse(body.schedule);
            if (!parsed.success) return fail(400, 'Some fields need attention', { fieldErrors: z.flattenError(parsed.error).fieldErrors });
            const result = await updateSchedule({ courseId, scheduleId: scheduleId.data, input: parsed.data, dryRun: preview });
            if (!result) return fail(404, 'Schedule not found');
            const { impact } = result;
            return done(impact, {
                kind: 'schedule_updated',
                summary: `Changed schedule "${parsed.data.name}": ${impact.updated} updated, ${impact.created} added, ${impact.deleted + impact.closed} removed`,
                details: { scheduleId: scheduleId.data, ...parsed.data },
            }, { schedule: result.schedule });
        }
        case 'schedule_delete': {
            const scheduleId = uuid.safeParse(body.scheduleId);
            if (!scheduleId.success) return fail(400, 'scheduleId is required');
            const result = await deleteScheduleCounted({ courseId, scheduleId: scheduleId.data, dryRun: preview });
            if (!result) return fail(404, 'Schedule not found');
            return done(result.impact, {
                kind: 'schedule_deleted',
                summary: `Deleted a schedule (${plural(result.impact.deleted + result.impact.closed, 'tee time', 'tee times')} removed)`,
                details: { scheduleId: scheduleId.data },
            });
        }
        case 'block_add': {
            const parsed = blockInputSchema.safeParse(body.block);
            if (!parsed.success) return fail(400, 'Some fields need attention', { fieldErrors: z.flattenError(parsed.error).fieldErrors });
            const result = await addBlock({ courseId, input: parsed.data, userId: actor.id, dryRun: preview });
            const b = parsed.data;
            const range = b.startsOn === b.endsOn ? b.startsOn : `${b.startsOn} to ${b.endsOn}`;
            const window = b.fromTime ? `, ${b.fromTime}–${b.toTime}` : '';

            // The course chose, in the confirmation, to cancel what was sold on these tee times and
            // refund the customers (ADR-0052). Only ever for a real change, and only this course's.
            const cancellation = !preview && body.cancelBookings === true && result.impact.affectedBookings.length > 0
                ? await cancelBookingsByCourse({ courseId, references: result.impact.affectedBookings })
                : null;
            const outcome = cancellation
                ? [
                    cancellation.cancelled.length > 0 && `${plural(cancellation.cancelled.length, 'booking', 'bookings')} cancelled and refunded`,
                    cancellation.failed.length > 0 && `${cancellation.failed.length} could not be cancelled`,
                ].filter(Boolean)
                : [];
            return done(result.impact, {
                kind: 'block_added',
                summary: `Blocked ${range}${window} (${[`${plural(result.impact.closed, 'tee time', 'tee times')} closed`, ...outcome].join(', ')})`,
                details: {
                    blockId: result.block.id, ...b,
                    ...(cancellation ? { cancelledBookings: cancellation.cancelled, failedBookings: cancellation.failed } : {}),
                },
            }, { block: result.block, ...(cancellation ? { cancellation } : {}) });
        }
        case 'block_remove': {
            const blockId = uuid.safeParse(body.blockId);
            if (!blockId.success) return fail(400, 'blockId is required');
            const result = await removeBlock({ courseId, blockId: blockId.data, dryRun: preview });
            if (!result) return fail(404, 'Block not found');
            return done(result.impact, {
                kind: 'block_removed',
                summary: `Removed a block (${plural(result.impact.reopened, 'tee time', 'tee times')} reopened)`,
                details: { blockId: blockId.data },
            });
        }
        case 'extras_set': {
            const parsed = golfExtrasInputSchema.safeParse(body.extras);
            if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid extras');
            if (preview) return NextResponse.json({ success: true, data: { preview: true, impact: noImpact(), extras: await listCourseExtras(courseId) } });
            const saved = await setCourseExtras(courseId, parsed.data);
            if (!saved) return fail(404, 'Course not found');
            const offered = saved.map(e => `${e.code} ${e.price}`).join(', ') || 'none';
            return done(noImpact(), { kind: 'extras_changed', summary: `Extras now: ${offered}`, details: { extras: saved } }, { extras: saved });
        }
        default:
            return fail(400, `Unknown action: ${String(body.action)}`);
    }
}
