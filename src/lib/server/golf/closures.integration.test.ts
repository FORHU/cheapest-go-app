import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * A course that blocks tee times can cancel the bookings on them and refund the customers in full
 * (CONTEXT.md, "Block"; ADR-0052). Real database, Stripe and email mocked. Skips when no database
 * is reachable. Uses dates in 2032 so nothing real collides.
 */

const stripeState = vi.hoisted(() => ({
    intents: new Map<string, { id: string; status: string; client_secret: string; amount: number }>(),
    count: 0,
}));

vi.mock('@/lib/stripe/server', () => ({
    stripe: {
        paymentIntents: {
            create: vi.fn(async (params: { amount: number }) => {
                const id = `pi_closure_${Date.now()}_${++stripeState.count}`;
                const intent = { id, status: 'requires_payment_method', client_secret: `${id}_secret`, amount: params.amount };
                stripeState.intents.set(id, intent);
                return intent;
            }),
            retrieve: vi.fn(async (id: string) => stripeState.intents.get(id)),
            capture: vi.fn(async (id: string) => Object.assign(stripeState.intents.get(id)!, { status: 'succeeded' })),
            cancel: vi.fn(async (id: string) => Object.assign(stripeState.intents.get(id)!, { status: 'canceled' })),
        },
        refunds: { create: vi.fn(async () => ({ id: 're_closure' })) },
    },
}));
vi.mock('./emails', () => ({ sendGolfBookingEmail: vi.fn(async () => undefined) }));

import { stripe } from '@/lib/stripe/server';
import { toStripeAmount } from '@/lib/pricing';
import { addDays } from '@/lib/golf/time';
import type { GolfCourseInput } from '@/lib/schemas/golf';
import { createCourse, deleteCourses, setCourseStatus } from './courses';
import { createSchedule, listAvailableTeeTimes } from './teeTimes';
import {
    cancelBookingsByCourse, cancelByCourse, confirmBooking, getBookingById, holdTeeTime, syncPayment,
} from './bookings';
import { sendGolfBookingEmail } from './emails';
import { GolfBookingError } from './errors';

async function databaseReachable(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin()`SELECT 1 FROM golf_bookings LIMIT 1`;
        return true;
    } catch {
        return false;
    }
}

const reachable = await databaseReachable();
const run = crypto.randomUUID().slice(0, 8);
const NOW = new Date('2032-03-01T00:00:00Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

let courseId = '';
let otherCourseId = '';
let slug = '';
const users: string[] = [];

async function sql() {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    return getSqlAdmin();
}

const courseInput = (name: string, key: string): GolfCourseInput => ({
    name, country: 'Philippines', city: 'Manila', slug: key,
    address: null, description: '', holes: 18, par: null, greenFeeFrom: null, currency: 'USD',
    imageUrls: [], amenities: [], timezone: 'Asia/Manila', freeCancelHours: 48, bookingWindowDays: 60,
    weatherPolicy: '', yardage: null, yearOpened: null, designer: null, grass: null,
});

beforeAll(async () => {
    if (!reachable) return;
    const db = await sql();
    const course = await createCourse(courseInput(`Closure Test ${run}`, `closure-test-${run}`));
    courseId = course.id;
    slug = course.slug;
    const other = await createCourse(courseInput(`Closure Other ${run}`, `closure-other-${run}`));
    otherCourseId = other.id;
    // Backdated before they are published: other integration tests ask for the newest published courses.
    await db`UPDATE golf_courses SET created_at = '2000-01-01' WHERE id IN ${db([courseId, otherCourseId])}`;
    await createSchedule(courseId, {
        name: 'Daily 08:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], firstTee: '08:00', lastTee: '08:00',
        intervalMinutes: 10, spots: 4, pricePerPlayer: 100,
    }, NOW);
    await setCourseStatus(courseId, 'published');
    for (const n of [0, 1, 2]) {
        const [row] = await db<{ id: string }[]>`INSERT INTO users (email) VALUES (${`closure-${run}-${n}@example.com`}) RETURNING id`;
        users.push(row.id);
    }
});

afterAll(async () => {
    if (!reachable) return;
    const db = await sql();
    await db`DELETE FROM golf_bookings WHERE course_id IN ${db([courseId, otherCourseId])}`;
    await deleteCourses([courseId, otherCourseId]);
    if (users.length) await db`DELETE FROM users WHERE id IN ${db(users)}`;
});

beforeEach(() => {
    vi.mocked(stripe.refunds.create).mockClear();
    vi.mocked(stripe.paymentIntents.cancel).mockClear();
    vi.mocked(sendGolfBookingEmail).mockClear();
});

async function teeTime(days: number): Promise<string> {
    const day = await listAvailableTeeTimes(slug, addDays('2032-03-01', days), NOW);
    return day!.teeTimes[0].id;
}

async function spotsLeft(teeTimeId: string): Promise<number> {
    const db = await sql();
    const [row] = await db<{ spotsLeft: number }[]>`SELECT spots_left AS "spotsLeft" FROM golf_tee_times WHERE id = ${teeTimeId}`;
    return row.spotsLeft;
}

const hold = (user: number, teeTimeId: string, players = 1) =>
    holdTeeTime({ userId: users[user], email: `closure-${run}-${user}@example.com`, teeTimeId, players, leadName: 'Test Player' }, NOW);

async function requested(user: number, teeTimeId: string, players = 1) {
    const { booking } = await hold(user, teeTimeId, players);
    stripeState.intents.get(booking.paymentIntentId!)!.status = 'requires_capture';
    return (await syncPayment(booking.id, later(5)))!;
}

async function confirmed(user: number, teeTimeId: string, players = 1) {
    const booking = await requested(user, teeTimeId, players);
    return confirmBooking(booking.id, later(60));
}

describe.skipIf(!reachable)('cancelling a booking because the course closed the tee time', () => {
    it('refunds a confirmed booking in full and says the course did it', async () => {
        const id = await teeTime(2);
        const booking = await confirmed(0, id, 2);
        const result = await cancelByCourse(booking.id, courseId);
        expect(result).toMatchObject({
            status: 'cancelled', closeReason: 'cancelled_by_course', refundAmount: booking.total,
        });
        expect(stripe.refunds.create).toHaveBeenCalledWith(
            { payment_intent: booking.paymentIntentId, amount: toStripeAmount(booking.total, booking.currency) },
            { idempotencyKey: `golf-refund-${booking.id}` },
        );
        expect(await spotsLeft(id)).toBe(4);
        expect(sendGolfBookingEmail).toHaveBeenCalledWith('cancelled', expect.objectContaining({ id: booking.id }));
    });

    it('releases the card of a request the course had not yet confirmed, charging nothing', async () => {
        const id = await teeTime(3);
        const booking = await requested(0, id);
        const result = await cancelByCourse(booking.id, courseId);
        expect(result).toMatchObject({ status: 'cancelled', closeReason: 'cancelled_by_course', refundAmount: 0 });
        expect(stripe.refunds.create).not.toHaveBeenCalled();
        expect(stripeState.intents.get(booking.paymentIntentId!)!.status).toBe('canceled');
        expect(await spotsLeft(id)).toBe(4);
        expect(sendGolfBookingEmail).toHaveBeenCalledWith('cancelled', expect.objectContaining({ id: booking.id }));
    });

    it('ends a customer\'s unpaid hold without an email', async () => {
        const id = await teeTime(4);
        const { booking } = await hold(0, id);
        const result = await cancelByCourse(booking.id, courseId);
        expect(result).toMatchObject({ status: 'cancelled', closeReason: 'cancelled_by_course', refundAmount: 0 });
        expect(stripeState.intents.get(booking.paymentIntentId!)!.status).toBe('canceled');
        expect(await spotsLeft(id)).toBe(4);
        expect(sendGolfBookingEmail).not.toHaveBeenCalled();
    });

    it('never touches another course\'s booking', async () => {
        const id = await teeTime(5);
        const booking = await confirmed(0, id);
        await expect(cancelByCourse(booking.id, otherCourseId)).rejects.toMatchObject({ code: 'not_found' });
        expect((await getBookingById(booking.id))?.status).toBe('confirmed');
        expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('refuses a booking that is already over', async () => {
        const id = await teeTime(6);
        const booking = await confirmed(0, id);
        await cancelByCourse(booking.id, courseId);
        await expect(cancelByCourse(booking.id, courseId)).rejects.toBeInstanceOf(GolfBookingError);
        expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
    });
});

describe.skipIf(!reachable)('cancelling the bookings a block sits on', () => {
    it('cancels each live booking named, and reports who it did', async () => {
        const a = await confirmed(0, await teeTime(8));
        const b = await requested(1, await teeTime(9));
        const outcome = await cancelBookingsByCourse({ courseId, references: [a.reference, b.reference] });
        expect(outcome.failed).toEqual([]);
        expect([...outcome.cancelled].sort()).toEqual([a.reference, b.reference].sort());
        expect((await getBookingById(a.id))?.closeReason).toBe('cancelled_by_course');
        expect((await getBookingById(b.id))?.closeReason).toBe('cancelled_by_course');
    });

    it('reports a booking whose refund failed and carries on with the rest', async () => {
        const a = await confirmed(0, await teeTime(10));
        const b = await confirmed(1, await teeTime(11));
        // Bookings are cancelled in reference order, so fail the one that is `a`, not the first.
        let networkDown = true;
        vi.mocked(stripe.refunds.create).mockImplementation((async (params: { payment_intent: string }) => {
            if (networkDown && params.payment_intent === a.paymentIntentId) throw new Error('card network unavailable');
            return { id: 're_closure' };
        }) as never);
        try {
            const outcome = await cancelBookingsByCourse({ courseId, references: [a.reference, b.reference] });
            expect(outcome.cancelled).toEqual([b.reference]);
            expect(outcome.failed).toEqual([{ reference: a.reference, error: expect.stringContaining('card network') }]);
            // The failed one is still live and can be retried: nothing was half done.
            expect((await getBookingById(a.id))?.status).toBe('confirmed');
            networkDown = false;
            const retry = await cancelBookingsByCourse({ courseId, references: [a.reference] });
            expect(retry.cancelled).toEqual([a.reference]);
        } finally {
            vi.mocked(stripe.refunds.create).mockImplementation((async () => ({ id: 're_closure' })) as never);
        }
    });

    it('ignores references that are not this course\'s or are no longer live', async () => {
        const mine = await confirmed(0, await teeTime(12));
        await cancelByCourse(mine.id, courseId);
        const outcome = await cancelBookingsByCourse({ courseId: otherCourseId, references: [mine.reference, 'CG-NOPE00'] });
        expect(outcome).toEqual({ cancelled: [], failed: [] });
        expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
    });
});
