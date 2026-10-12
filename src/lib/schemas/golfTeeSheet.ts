import { z } from 'zod';
import { addDays, isIsoDate } from '@/lib/golf/time';

/**
 * Tee-sheet control (CONTEXT.md, "Block"). Client-safe: the portal forms and the routes share
 * these. Queries live in lib/server/golf.
 */

const timeOfDay = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time, e.g. 06:30');
const realDate = z.string().trim().refine(isIsoDate, 'Use a real date');

/**
 * A block: dates, optionally only some weekdays, optionally only between a first and a last tee
 * time (both inclusive). No window means the whole day. Seven weekdays is the same as none.
 */
export const blockInputSchema = z
    .object({
        startsOn: realDate,
        endsOn: realDate,
        weekdays: z
            .array(z.number().int().min(0).max(6))
            .nullish()
            .transform(days => {
                const unique = [...new Set(days ?? [])].sort((a, b) => a - b);
                return unique.length === 0 || unique.length === 7 ? null : unique;
            }),
        fromTime: timeOfDay.nullish().transform(v => v || null),
        toTime: timeOfDay.nullish().transform(v => v || null),
        note: z.string().trim().max(300, 'At most 300 characters').optional().default(''),
    })
    .refine(v => v.endsOn >= v.startsOn, { path: ['endsOn'], message: 'The last date is before the first' })
    .refine(v => v.endsOn <= addDays(v.startsOn, 366), { path: ['endsOn'], message: 'A block can cover at most a year' })
    .refine(v => (v.fromTime === null) === (v.toTime === null), {
        path: ['toTime'], message: 'Give both the first and the last tee time, or neither',
    })
    .refine(v => v.fromTime === null || v.toTime === null || v.toTime >= v.fromTime, {
        path: ['toTime'], message: 'The last tee time is before the first',
    });

export type BlockInputRaw = z.input<typeof blockInputSchema>;
export type BlockInput = z.output<typeof blockInputSchema>;

export interface CourseBlock {
    id: string;
    courseId: string;
    startsOn: string;
    endsOn: string;
    weekdays: number[] | null;
    fromTime: string | null;
    toTime: string | null;
    note: string;
    createdAt: string;
    /** Future tee times this block is closing right now. */
    closedTeeTimes: number;
}

/**
 * What a change does to tee times, counted by the same code that applies it (a preview is the
 * change run inside a transaction that is rolled back).
 */
export interface Impact {
    created: number;
    updated: number;
    /** Stopped being sellable. Existing bookings on them are not cancelled or changed. */
    closed: number;
    reopened: number;
    deleted: number;
    /** Tee times a change left alone because a booking is live on them. */
    leftAlone: number;
    /** References of live bookings sitting on tee times a block just closed. */
    affectedBookings: string[];
}

export const noImpact = (): Impact => ({
    created: 0, updated: 0, closed: 0, reopened: 0, deleted: 0, leftAlone: 0, affectedBookings: [],
});

export type CourseChangeKind =
    | 'schedule_created' | 'schedule_updated' | 'schedule_deleted'
    | 'block_added' | 'block_removed' | 'extras_changed';

export interface CourseChange {
    id: string;
    kind: CourseChangeKind;
    summary: string;
    /** Name or email of who did it; null when that account is gone. */
    by: string | null;
    createdAt: string;
}

/** One tee time as the course sees it on its day sheet. */
export interface SheetTeeTime {
    id: string;
    /** "07:38" on the course's clock. */
    localTime: string;
    pricePerPlayer: number;
    currency: string;
    spots: number;
    spotsLeft: number;
    status: 'open' | 'closed';
    /** Players on live bookings (held, requested or confirmed). */
    booked: number;
    /** Why a closed tee time is closed. */
    closedBy: 'block' | 'schedule' | null;
}
