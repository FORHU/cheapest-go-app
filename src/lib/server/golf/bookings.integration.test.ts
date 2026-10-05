import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/**
 * Golf Bookings against a real database, with Stripe and email mocked: the oversell guard, the
 * live-hold rule and every status transition are SQL. Skips when no database is reachable.
 * Uses dates in 2031 so nothing real collides.
 */

const stripeState = vi.hoisted(() => ({
    intents: new Map<string, { id: string; status: string; client_secret: string; amount: number }>(),
    count: 0,
}));

vi.mock('@/lib/stripe/server', () => ({
    stripe: {
        paymentIntents: {
            create: vi.fn(async (params: { amount: number }) => {
                const id = `pi_golftest_${Date.now()}_${++stripeState.count}`;
                const intent = { id, status: 'requires_payment_method', client_secret: `${id}_secret`, amount: params.amount };
                stripeState.intents.set(id, intent);
                return intent;
            }),
            retrieve: vi.fn(async (id: string) => stripeState.intents.get(id)),
            capture: vi.fn(async (id: string) => Object.assign(stripeState.intents.get(id)!, { status: 'succeeded' })),
            cancel: vi.fn(async (id: string) => Object.assign(stripeState.intents.get(id)!, { status: 'canceled' })),
        },
        refunds: { create: vi.fn(async () => ({ id: 're_golftest' })) },
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
    cancelByCustomer, confirmBooking, declineBooking, getBookingById, holdTeeTime, sweepGolfBookings, syncPayment,
} from './bookings';
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
/** 08:00 on Monday 3 March 2031 in Manila. */
const NOW = new Date('2031-03-03T00:00:00Z');
const MINUTE = 60_000;
const later = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE);

let courseId = '';
let slug = '';
const users: string[] = [];

async function sql() {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    return getSqlAdmin();
}

beforeAll(async () => {
    if (!reachable) return;
    const input: GolfCourseInput = {
        name: `Booking Test ${run}`, country: 'Philippines', city: 'Manila', slug: `booking-test-${run}`,
        address: null, description: '', holes: 18, par: null, greenFeeFrom: null, currency: 'USD',
        imageUrls: [], amenities: [], timezone: 'Asia/Manila', freeCancelHours: 48,
    };
    const course = await createCourse(input);
    courseId = course.id;
    slug = course.slug;
    const db = await sql();
    // Backdated before it is published: courses.integration.test.ts runs in parallel and asks
    // for the newest published courses in the whole database.
    await db`UPDATE golf_courses SET created_at = '2000-01-01' WHERE id = ${courseId}`;
    await setCourseStatus(courseId, 'published');
    // One 08:00 tee time a day with two spots.
    await createSchedule(courseId, {
        name: 'Daily 08:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], firstTee: '08:00', lastTee: '08:00',
        intervalMinutes: 10, spots: 2, pricePerPlayer: 100,
    }, NOW);
    for (const n of [0, 1]) {
        const [row] = await db<{ id: string }[]>`INSERT INTO users (email) VALUES (${`golf-${run}-${n}@example.com`}) RETURNING id`;
        users.push(row.id);
    }
});

afterAll(async () => {
    if (!reachable) return;
    const db = await sql();
    await db`DELETE FROM golf_bookings WHERE course_id = ${courseId}`;
    await deleteCourses([courseId]);
    if (users.length) await db`DELETE FROM users WHERE id IN ${db(users)}`;
});

/** The 08:00 tee time `days` course-local days after NOW. */
async function teeTime(days: number): Promise<string> {
    const day = await listAvailableTeeTimes(slug, addDays('2031-03-03', days), NOW);
    return day!.teeTimes[0].id;
}

async function spotsLeft(teeTimeId: string): Promise<number> {
    const db = await sql();
    const [row] = await db<{ spotsLeft: number }[]>`SELECT spots_left AS "spotsLeft" FROM golf_tee_times WHERE id = ${teeTimeId}`;
    return row.spotsLeft;
}

const hold = (user: number, teeTimeId: string, players = 1, now = NOW) =>
    holdTeeTime({ userId: users[user], email: `golf-${run}-${user}@example.com`, teeTimeId, players, leadName: 'Test Player' }, now);

/** What Stripe does when the customer's card is authorised. */
const authorise = (paymentIntentId: string | null) => {
    stripeState.intents.get(paymentIntentId!)!.status = 'requires_capture';
};

async function requested(user: number, teeTimeId: string, players = 1) {
    const { booking } = await hold(user, teeTimeId, players);
    authorise(booking.paymentIntentId);
    return (await syncPayment(booking.id, later(5)))!;
}

describe.skipIf(!reachable)('golf bookings against a real database', () => {
    it('lets exactly one of two customers take the last spots', async () => {
        const id = await teeTime(2);
        const results = await Promise.allSettled([hold(0, id, 2), hold(1, id, 2)]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        const loser = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
        expect(loser.reason).toBeInstanceOf(GolfBookingError);
        expect(loser.reason.code).toBe('not_enough_spots');
        expect(await spotsLeft(id)).toBe(0);
    });

    it('answers a repeated request with the hold the customer already has', async () => {
        const id = await teeTime(3);
        const first = await hold(0, id);
        const second = await hold(0, id);
        expect(second.booking.reference).toBe(first.booking.reference);
        expect(second.clientSecret).toBe(first.clientSecret);
        expect(await spotsLeft(id)).toBe(1);
    });

    it('ends a customer\'s hold on another tee time when they start a new one', async () => {
        const a = await teeTime(4);
        const b = await teeTime(5);
        const first = await hold(0, a);
        await hold(0, b);
        expect((await getBookingById(first.booking.id))?.status).toBe('expired');
        expect(await spotsLeft(a)).toBe(2);
    });

    it('moves held → requested → confirmed, capturing only at confirmation', async () => {
        const id = await teeTime(6);
        const booking = await requested(0, id, 2);
        expect(booking.status).toBe('requested');
        expect(booking.decideBy).toBe(new Date(later(5).getTime() + 48 * 60 * MINUTE).toISOString());
        expect(stripe.paymentIntents.capture).not.toHaveBeenCalledWith(booking.paymentIntentId, expect.anything(), expect.anything());

        const confirmed = await confirmBooking(booking.id, later(60));
        expect(confirmed.status).toBe('confirmed');
        expect(stripe.paymentIntents.capture).toHaveBeenCalledWith(booking.paymentIntentId, {}, { idempotencyKey: `golf-capture-${booking.id}` });
        expect(await spotsLeft(id)).toBe(0);
    });

    it('sweeps an unpaid hold, freeing its spots and its PaymentIntent', async () => {
        const id = await teeTime(7);
        const { booking } = await hold(0, id, 2);
        const result = await sweepGolfBookings(later(16));
        expect(result.expired).toBeGreaterThanOrEqual(1);
        const swept = await getBookingById(booking.id);
        expect(swept).toMatchObject({ status: 'expired', closeReason: 'hold_expired' });
        expect(await spotsLeft(id)).toBe(2);
        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(booking.paymentIntentId);
    });

    it('sweeps a hold whose payment went through into a request instead', async () => {
        const id = await teeTime(8);
        const { booking } = await hold(0, id);
        authorise(booking.paymentIntentId);
        await sweepGolfBookings(later(16));
        expect((await getBookingById(booking.id))?.status).toBe('requested');
    });

    it('declines a request nobody decided by its deadline, without charging', async () => {
        const id = await teeTime(9);
        const booking = await requested(0, id, 2);
        await sweepGolfBookings(new Date(new Date(booking.decideBy!).getTime() + MINUTE));
        expect(await getBookingById(booking.id)).toMatchObject({ status: 'declined', closeReason: 'not_confirmed_in_time', refundAmount: 0 });
        expect(await spotsLeft(id)).toBe(2);
    });

    it('lets the team decline a request, releasing spots and the authorisation', async () => {
        const id = await teeTime(10);
        const booking = await requested(0, id, 2);
        const declined = await declineBooking(booking.id);
        expect(declined).toMatchObject({ status: 'declined', closeReason: 'declined_by_team' });
        expect(await spotsLeft(id)).toBe(2);
        expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(booking.paymentIntentId);
    });

    it('refunds a confirmed booking in full when the customer cancels before the cutoff', async () => {
        const id = await teeTime(11);
        const booking = await requested(0, id);
        await confirmBooking(booking.id, later(60));
        const cancelled = await cancelByCustomer(booking.reference, users[0], later(120));
        expect(cancelled).toMatchObject({ status: 'cancelled', closeReason: 'cancelled_by_customer', refundAmount: booking.total });
        expect(stripe.refunds.create).toHaveBeenCalledWith(
            { payment_intent: booking.paymentIntentId, amount: toStripeAmount(booking.total, 'USD') },
            { idempotencyKey: `golf-refund-${booking.id}` },
        );
        expect(await spotsLeft(id)).toBe(2);
    });

    it('refuses an online cancellation once free cancellation has ended, and a stranger\'s', async () => {
        const id = await teeTime(12);
        const booking = await requested(0, id);
        await confirmBooking(booking.id, later(60));
        await expect(cancelByCustomer(booking.reference, users[1], later(120))).rejects.toMatchObject({ code: 'not_found' });
        await expect(cancelByCustomer(booking.reference, users[0], new Date(booking.freeCancelUntil)))
            .rejects.toMatchObject({ code: 'free_cancellation_ended' });
    });
});
