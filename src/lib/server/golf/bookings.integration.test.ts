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

// Fixed "USD per 1 unit" rates, so a conversion in a test is exact and needs no network.
const fx = vi.hoisted(() => ({ rates: { USD: 1, PHP: 0.0175, KRW: 0.0007 } as Record<string, number> }));
vi.mock('@/lib/currency', () => ({
    EXCHANGE_RATES: fx.rates,
    refreshExchangeRates: vi.fn(async () => true),
    convertCurrencyStrict: (amount: number, from: string, to: string) => {
        if (from === to) return amount;
        if (!fx.rates[from] || !fx.rates[to]) throw new Error(`No exchange rate for ${from} or ${to}`);
        return (amount * fx.rates[from]) / fx.rates[to];
    },
}));

import { stripe } from '@/lib/stripe/server';
import { golfServiceFee, roundToCurrency, toStripeAmount } from '@/lib/pricing';
import { toCourseBookingView } from './courseAccess';
import { addDays } from '@/lib/golf/time';
import type { ExtraChoice } from '@/lib/golf/extras';
import type { GolfCourseInput } from '@/lib/schemas/golf';
import { createCourse, deleteCourses, setCourseStatus } from './courses';
import { createSchedule, listAvailableTeeTimes } from './teeTimes';
import { listCourseExtras, setCourseExtras } from './extras';
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
        imageUrls: [], amenities: [], timezone: 'Asia/Manila', freeCancelHours: 48, bookingWindowDays: 60, weatherPolicy: '', yardage: null, yearOpened: null, designer: null, grass: null,
    };
    const course = await createCourse(input);
    courseId = course.id;
    slug = course.slug;
    const db = await sql();
    // Backdated before it is published: courses.integration.test.ts runs in parallel and asks
    // for the newest published courses in the whole database.
    await db`UPDATE golf_courses SET created_at = '2000-01-01' WHERE id = ${courseId}`;
    // One 08:00 tee time a day with two spots; published after, since publishing needs it.
    await createSchedule(courseId, {
        name: 'Daily 08:00', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], firstTee: '08:00', lastTee: '08:00',
        intervalMinutes: 10, spots: 2, pricePerPlayer: 100,
    }, NOW);
    await setCourseStatus(courseId, 'published');
    for (const n of [0, 1]) {
        const [row] = await db<{ id: string }[]>`INSERT INTO users (email) VALUES (${`golf-${run}-${n}@example.com`}) RETURNING id`;
        users.push(row.id);
    }
    await setCourseExtras(courseId, [{ code: 'club_rental', price: 45 }, { code: 'cart', price: 25 }]);
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

const hold = (user: number, teeTimeId: string, players = 1, now = NOW, extras: ExtraChoice[] = []) =>
    holdTeeTime({ userId: users[user], email: `golf-${run}-${user}@example.com`, teeTimeId, players, leadName: 'Test Player', extras }, now);

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

    it('lets the admin replace what a course offers', async () => {
        expect(await listCourseExtras(courseId)).toEqual([{ code: 'club_rental', price: 45 }, { code: 'cart', price: 25 }]);
        expect(await setCourseExtras(courseId, [{ code: 'caddie', price: 30 }])).toEqual([{ code: 'caddie', price: 30 }]);
        await setCourseExtras(courseId, [{ code: 'cart', price: 25 }, { code: 'club_rental', price: 45 }]);
        expect(await setCourseExtras(crypto.randomUUID(), [])).toBeNull();
    });

    it('locks extras into the hold and charges the fee on green fee plus extras', async () => {
        const id = await teeTime(13);
        const { booking } = await hold(0, id, 2, NOW, [{ code: 'cart', quantity: 1 }, { code: 'club_rental', quantity: 2 }]);
        expect(booking.extras).toEqual([
            { code: 'club_rental', quantity: 2, unitPrice: 45, total: 90 },
            { code: 'cart', quantity: 1, unitPrice: 25, total: 25 },
        ]);
        expect(booking.extrasTotal).toBe(115);
        const charged = Math.round(golfServiceFee(315, 'USD', amount => amount).chargedTotal * 100) / 100;
        expect(booking.total).toBe(charged);
        expect(booking.serviceFee).toBe(Math.round((charged - 315) * 100) / 100);
    });

    it('starts a new hold when the extras change, and refuses an extra not on offer', async () => {
        const id = await teeTime(14);
        const first = await hold(0, id, 1, NOW, [{ code: 'cart', quantity: 1 }]);
        expect((await hold(0, id, 1, NOW, [{ code: 'cart', quantity: 1 }])).booking.reference).toBe(first.booking.reference);
        const changed = await hold(0, id, 1, NOW, []);
        expect(changed.booking.reference).not.toBe(first.booking.reference);
        expect((await getBookingById(first.booking.id))?.status).toBe('expired');
        await expect(hold(0, id, 1, NOW, [{ code: 'caddie', quantity: 1 }])).rejects.toMatchObject({ code: 'extras_unavailable' });
    });
});

describe.skipIf(!reachable)('a hold records the course\'s rules and the all-in price search showed', () => {
    it('copies the weather rule onto the booking and charges exactly the searched price', async () => {
        const db = await sql();
        await db`UPDATE golf_courses SET weather_policy = 'Rain delay under 1 hour: play on.' WHERE id = ${courseId}`;
        const id = await teeTime(40);
        const { searchCourses } = await import('./search');
        const found = await searchCourses({ country: 'Philippines', date: addDays('2031-03-03', 40), players: 2, courseId }, NOW);
        const { booking } = await hold(0, id, 2);
        expect(booking.weatherPolicy).toBe('Rain delay under 1 hour: play on.');

        // A later edit must not rewrite what this customer agreed to.
        await db`UPDATE golf_courses SET weather_policy = 'No refunds.' WHERE id = ${courseId}`;
        expect((await getBookingById(booking.id))?.weatherPolicy).toBe('Rain delay under 1 hour: play on.');

        const { quoteGolf } = await import('./quote');
        const quote = await quoteGolf({ greenFeeTotal: 200, currency: 'USD' });
        expect(booking.total).toBe(quote.total);
        expect(found[0].from?.total).toBe(booking.total);
        await db`UPDATE golf_courses SET weather_policy = '' WHERE id = ${courseId}`;
    });

    it('refuses a tee time past the course\'s booking window', async () => {
        const db = await sql();
        const id = await teeTime(30);
        await db`UPDATE golf_courses SET booking_window_days = 14 WHERE id = ${courseId}`;
        try {
            await expect(hold(0, id, 1)).rejects.toMatchObject({ code: 'tee_time_unavailable' });
        } finally {
            await db`UPDATE golf_courses SET booking_window_days = 60 WHERE id = ${courseId}`;
        }
    });
});

describe.skipIf(!reachable)('a booking in the customer\'s currency (ADR-0051)', () => {
    const toPhp = (usd: number) => roundToCurrency((usd * fx.rates.USD) / fx.rates.PHP, 'PHP');
    const feeIn = (base: number, currency: string) =>
        roundToCurrency(golfServiceFee(base, currency, (a, f, t) => (f === t ? a : (a * fx.rates[f]) / fx.rates[t])).chargedTotal, currency);
    const holdIn = (user: number, teeTimeId: string, chargeCurrency: string, over: Record<string, unknown> = {}) =>
        holdTeeTime({
            userId: users[user], email: `golf-${run}-${user}@example.com`, teeTimeId, players: 2,
            leadName: 'Test Player', extras: [], chargeCurrency, ...over,
        } as never, NOW);

    it('charges in the chosen currency and keeps the course\'s own figures in its currency', async () => {
        const id = await teeTime(41);
        const { booking } = await holdIn(0, id, 'PHP');
        const green = toPhp(200);
        const total = feeIn(green, 'PHP');

        expect(booking).toMatchObject({
            currency: 'PHP', greenFeeTotal: green, extrasTotal: 0, total,
            serviceFee: roundToCurrency(total - green, 'PHP'),
            courseCurrency: 'USD', courseGreenFeeTotal: 200,
        });
        expect(booking.chargeRate).toBeCloseTo(1 / 0.0175, 6);
        expect(stripe.paymentIntents.create).toHaveBeenLastCalledWith(
            expect.objectContaining({ amount: toStripeAmount(total, 'PHP'), currency: 'php' }),
            expect.anything(),
        );

        const db = await sql();
        const [row] = await db<{ green: number; total: number; currency: string; charge: string; usd: number | null }[]>`
            SELECT green_fee_total::float8 AS green, total::float8 AS total, currency, charge_currency AS charge, usd_amount::float8 AS usd
              FROM golf_bookings WHERE id = ${booking.id}`;
        // The course-currency columns are what the course is owed, at the locked rate.
        expect(row).toMatchObject({ green: 200, currency: 'USD', charge: 'PHP', usd: null });
        expect(row.total).toBeCloseTo(total * 0.0175, 1);
    });

    it('charges Korean won in whole won, so what is shown is what is sent', async () => {
        const id = await teeTime(42);
        const { booking } = await holdIn(0, id, 'KRW');
        expect(Number.isInteger(booking.total)).toBe(true);
        expect(Number.isInteger(booking.greenFeeTotal)).toBe(true);
        expect(booking.greenFeeTotal + booking.serviceFee).toBe(booking.total);
        expect(stripe.paymentIntents.create).toHaveBeenLastCalledWith(
            expect.objectContaining({ amount: booking.total, currency: 'krw' }), expect.anything(),
        );
    });

    it('converts each extra on its own, so the lines add up in the customer\'s currency', async () => {
        const id = await teeTime(43);
        const { booking } = await holdIn(0, id, 'PHP', { extras: [{ code: 'cart', quantity: 1 }, { code: 'club_rental', quantity: 2 }] });
        const lineSum = booking.extras.reduce((sum, e) => sum + e.total, 0);
        expect(booking.extrasTotal).toBeCloseTo(lineSum, 2);
        expect(booking.greenFeeTotal + booking.extrasTotal + booking.serviceFee).toBeCloseTo(booking.total, 2);
        expect(booking.extras.find(e => e.code === 'cart')).toMatchObject({ quantity: 1, total: toPhp(25), unitPrice: toPhp(25) });
    });

    it('refuses a currency a customer cannot be charged in', async () => {
        const id = await teeTime(44);
        await expect(holdIn(0, id, 'THB')).rejects.toMatchObject({ code: 'currency_unsupported' });
        expect(await spotsLeft(id)).toBe(2);
    });

    it('holds the customer to the total they were shown when the rate has drifted a little', async () => {
        const id = await teeTime(45);
        const quoted = feeIn(toPhp(200), 'PHP');
        const shown = roundToCurrency(quoted * 0.999, 'PHP');
        const { booking } = await holdIn(0, id, 'PHP', { displayedTotal: shown });
        expect(booking.total).toBe(shown);
        expect(booking.greenFeeTotal + booking.serviceFee).toBeCloseTo(shown, 2);
        expect(stripe.paymentIntents.create).toHaveBeenLastCalledWith(
            expect.objectContaining({ amount: toStripeAmount(shown, 'PHP') }), expect.anything(),
        );
    });

    it('asks them to review the new price when it has moved further, and takes no spots', async () => {
        const id = await teeTime(46);
        const quoted = feeIn(toPhp(200), 'PHP');
        const err = await holdIn(0, id, 'PHP', { displayedTotal: roundToCurrency(quoted * 0.9, 'PHP') }).catch(e => e);
        expect(err).toBeInstanceOf(GolfBookingError);
        expect(err).toMatchObject({ code: 'price_changed', httpStatus: 409, detail: { serverPrice: quoted, currency: 'PHP' } });
        expect(await spotsLeft(id)).toBe(2);
    });

    it('starts a new hold when the same customer comes back in another currency', async () => {
        const id = await teeTime(47);
        const first = await holdIn(0, id, 'USD');
        const second = await holdIn(0, id, 'PHP');
        expect(second.booking.reference).not.toBe(first.booking.reference);
        expect(second.booking.currency).toBe('PHP');
        expect((await getBookingById(first.booking.id))?.status).toBe('expired');
        expect(await spotsLeft(id)).toBe(0);
    });

    it('refunds in the currency it was charged in, and locks the USD amount at capture', async () => {
        const id = await teeTime(48);
        const { booking } = await holdIn(0, id, 'PHP', { players: 1 });
        authorise(booking.paymentIntentId);
        await syncPayment(booking.id, later(5));

        const db = await sql();
        const usd = async () => (await db<{ usd: number | null; rate: number | null; source: string | null }[]>`
            SELECT usd_amount::float8 AS usd, fx_rate::float8 AS rate, fx_source AS source FROM golf_bookings WHERE id = ${booking.id}`)[0];
        expect(await usd()).toEqual({ usd: null, rate: null, source: null });

        await confirmBooking(booking.id, later(60));
        const locked = await usd();
        expect(locked.rate).toBe(0.0175);
        expect(locked.source).toBe('live');
        expect(locked.usd).toBeCloseTo(booking.total * 0.0175, 2);

        const cancelled = await cancelByCustomer(booking.reference, users[0], later(120));
        expect(cancelled.refundAmount).toBe(booking.total);
        expect(stripe.refunds.create).toHaveBeenLastCalledWith(
            { payment_intent: booking.paymentIntentId, amount: toStripeAmount(booking.total, 'PHP') },
            expect.anything(),
        );
    });

    it('shows the course its own currency, never the customer\'s', async () => {
        const id = await teeTime(49);
        const { booking } = await holdIn(0, id, 'KRW');
        expect(toCourseBookingView(booking)).toMatchObject({ greenFeeTotal: 200, currency: 'USD' });
    });
});
