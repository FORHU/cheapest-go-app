import {
    golfPhotoIdOf, profileOfCourse,
    type CourseProfileInput, type GolfCourse, type ProfileDiff, type WindowImpact,
} from '@/lib/schemas/golf';
import { inTransaction } from './dryRun';
import { lockCourse, writeProfile } from './courses';
import { PhotoNotOwnedError } from './errors';
import { dropObjects } from './photos';
import { generateTeeTimes } from './teeTimes';

export { PhotoNotOwnedError };

/**
 * A course editing how it is described and what it promises (CONTEXT.md, "Course Staff"; ADR-0050).
 * It reaches only the profile columns, so a course cannot rename, re-zone or publish itself.
 */

const PHOTO_GRACE_MS = 60 * 60 * 1000;

const sameList = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** What differs between two profiles, by field, as [before, after]. Amenities have no order. */
export function diffProfile(before: CourseProfileInput, after: CourseProfileInput): ProfileDiff {
    const diff: ProfileDiff = {};
    for (const key of Object.keys(before) as (keyof CourseProfileInput)[]) {
        const a = before[key];
        const b = after[key];
        const same = key === 'amenities'
            ? sameList([...(a as string[])].sort(), [...(b as string[])].sort())
            : Array.isArray(a) ? sameList(a, b as unknown[]) : a === b;
        if (!same) diff[key] = [a, b];
    }
    return diff;
}

export interface ProfileUpdate {
    course: GolfCourse;
    changes: ProfileDiff;
    /** Zero unless the window was shortened. */
    windowImpact: WindowImpact;
    /** Tee times opened right away because the window was widened (0 on a preview). */
    created: number;
}

/**
 * Applies `input` to the course and reports what changed. With `dryRun` the same work runs in a
 * transaction that is rolled back, so a preview cannot disagree with the save. null when there
 * is no such course.
 *
 * A shorter window deletes nothing: tee times beyond it stop being sold and are counted. A wider
 * one generates the extra days now rather than at the next daily run.
 */
export async function updateProfile(
    { courseId, input, now = new Date(), dryRun = false }:
    { courseId: string; input: CourseProfileInput; now?: Date; dryRun?: boolean },
): Promise<ProfileUpdate | null> {
    const done = await inTransaction(dryRun, async tx => {
        const current = await lockCourse(tx, courseId);
        if (!current) return null;

        const ids = [...new Set(input.imageUrls.map(golfPhotoIdOf).filter((id): id is string => id !== null))];
        if (ids.length > 0) {
            const owned = await tx<{ id: string }[]>`
                SELECT id FROM golf_course_photos WHERE course_id = ${courseId} AND id = ANY(${ids}::uuid[])`;
            if (owned.length !== ids.length) throw new PhotoNotOwnedError();
        }

        const before = profileOfCourse(current);
        let windowImpact: WindowImpact = { stopsSelling: 0, withBookings: 0 };
        if (input.bookingWindowDays < before.bookingWindowDays) {
            // Sold while lead <= (window + 1) days, as isBookableStart decides.
            const [row] = await tx<WindowImpact[]>`
                SELECT count(*)::int AS "stopsSelling",
                       count(*) FILTER (WHERE EXISTS (
                           SELECT 1 FROM golf_bookings b
                            WHERE b.tee_time_id = t.id AND b.status IN ('held', 'requested', 'confirmed')))::int AS "withBookings"
                  FROM golf_tee_times t
                 WHERE t.course_id = ${courseId} AND t.status = 'open'
                   AND t.starts_at > ${now}::timestamptz + make_interval(days => ${input.bookingWindowDays + 1})
                   AND t.starts_at <= ${now}::timestamptz + make_interval(days => ${before.bookingWindowDays + 1})`;
            windowImpact = row;
        }

        const course = (await writeProfile(tx, courseId, input))!;

        // A photo taken out of the list goes now; one uploaded and never used goes after an hour,
        // so a second tab's upload in progress is not swept from under it.
        const previous = [...new Set(before.imageUrls.map(golfPhotoIdOf).filter((id): id is string => id !== null))];
        const dropped = await tx<{ storageKey: string }[]>`
            DELETE FROM golf_course_photos
             WHERE course_id = ${courseId}
               AND id <> ALL(${ids}::uuid[])
               AND (id = ANY(${previous}::uuid[]) OR created_at < ${new Date(now.getTime() - PHOTO_GRACE_MS)})
            RETURNING storage_key AS "storageKey"`;

        return {
            course, windowImpact,
            changes: diffProfile(before, profileOfCourse(course)),
            widened: input.bookingWindowDays > before.bookingWindowDays,
            keys: dropped.map(d => d.storageKey),
        };
    });
    if (!done) return null;

    let created = 0;
    if (!dryRun) {
        await dropObjects(done.keys);
        if (done.widened) created = await generateTeeTimes({ courseId, now });
    }
    return { course: done.course, changes: done.changes, windowImpact: done.windowImpact, created };
}
