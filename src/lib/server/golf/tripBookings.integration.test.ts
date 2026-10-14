import { describe, it, expect, afterAll } from 'vitest';
import type { GolfCourseInput, TeeTimeScheduleInput } from '@/lib/schemas/golf';
import { createCourse, deleteCourses } from './courses';
import { createScheduleCounted } from './teeTimes';
import { listGolfBookingsForUser } from './tripBookings';

/**
 * The golf bookings a customer sees on their bookings page, against a real database. Skips when
 * no database is reachable. Dates are in 2030 so nothing real collides.
 */

async function databaseReachable(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin()`SELECT charge_currency FROM golf_bookings LIMIT 1`;
        return true;
    } catch {
        return false;
    }
}

const reachable = await databaseReachable();
const run = crypto.randomUUID().slice(0, 8);
const courses: string[] = [];
const users: string[] = [];
const NOW = new Date('2030-01-06T00:00:00Z');

async function sql() {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    return getSqlAdmin();
}

async function user() {
    const db = await sql();
    const [row] = await db<{ id: string }[]>`INSERT INTO users (email) VALUES (${`trips-${run}-${users.length}@example.com`}) RETURNING id`;
    users.push(row.id);
    return row.id;
}

const daily: TeeTimeScheduleInput = {
    name: 'Daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], firstTee: '07:00', lastTee: '08:00',
    intervalMinutes: 30, spots: 4, pricePerPlayer: 100,
};

async function course() {
    const input: GolfCourseInput = {
        name: `Trips ${run} ${courses.length}`, country: 'Tripland', city: 'Testville', slug: `trips-${run}-${courses.length}`, address: null, description: '',
        holes: 18, par: null, greenFeeFrom: null, currency: 'USD', imageUrls: [], amenities: [], timezone: 'Asia/Manila',
        freeCancelHours: 48, bookingWindowDays: 60, weatherPolicy: '', yardage: null, yearOpened: null, designer: null, grass: null,
    };
    const c = await createCourse(input);
    courses.push(c.id);
    await createScheduleCounted({ courseId: c.id, input: daily, now: NOW });
    return c;
}

/** A booking on the course's n-th tee time, raw, so every status can be had without Stripe. */
async function book(courseId: string, userId: string, nth: number, status: string, over: { chargeCurrency?: string; charged?: number } = {}) {
    const db = await sql();
    const [tt] = await db<{ id: string }[]>`
        SELECT id FROM golf_tee_times WHERE course_id = ${courseId} ORDER BY starts_at OFFSET ${nth} LIMIT 1`;
    const reference = `CG-T${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
    await db`
        INSERT INTO golf_bookings (reference, user_id, course_id, tee_time_id, players, lead_name, contact_email,
            price_per_player, green_fee_total, service_fee, total, currency, hold_expires_at, free_cancel_until, status,
            charge_currency, charge_rate, charged_green_fee_total, charged_extras_total, charged_service_fee, charged_total)
        VALUES (${reference}, ${userId}, ${courseId}, ${tt.id}, 2, 'Test Player', 'p@example.com',
            100, 200, 10, 210, 'USD', ${NOW}, ${NOW}, ${status},
            ${over.chargeCurrency ?? 'USD'}, 1, 200, 0, 10, ${over.charged ?? 210})`;
    return reference;
}

afterAll(async () => {
    if (!reachable) return;
    const db = await sql();
    if (courses.length) await db`DELETE FROM golf_bookings WHERE course_id IN ${db(courses)}`;
    if (courses.length) await deleteCourses(courses);
    if (users.length) await db`DELETE FROM users WHERE id IN ${db(users)}`;
});

describe.skipIf(!reachable)('listGolfBookingsForUser', () => {
    it('lists the customer\'s bookings, leaving out unpaid holds and expired ones', async () => {
        const c = await course();
        const me = await user();
        const refs = {
            held: await book(c.id, me, 0, 'held'),
            expired: await book(c.id, me, 1, 'expired'),
            requested: await book(c.id, me, 2, 'requested'),
            confirmed: await book(c.id, me, 3, 'confirmed'),
            declined: await book(c.id, me, 4, 'declined'),
            cancelled: await book(c.id, me, 5, 'cancelled'),
        };
        const list = await listGolfBookingsForUser(me);
        expect(list.map(b => b.reference).sort()).toEqual([refs.requested, refs.confirmed, refs.declined, refs.cancelled].sort());
        expect(list.every(b => b.kind === 'golf')).toBe(true);
    });

    it('never lists another customer\'s booking', async () => {
        const c = await course();
        const me = await user();
        const other = await user();
        await book(c.id, other, 0, 'confirmed');
        expect(await listGolfBookingsForUser(me)).toEqual([]);
    });

    it('carries what the card shows: the course, the tee time on its clock, the party and what was paid', async () => {
        const c = await course();
        const me = await user();
        const ref = await book(c.id, me, 0, 'confirmed', { chargeCurrency: 'KRW', charged: 297_000 });
        const [b] = await listGolfBookingsForUser(me);
        expect(b).toMatchObject({
            reference: ref, status: 'confirmed', courseName: c.name, courseSlug: c.slug,
            timezone: 'Asia/Manila', players: 2,
            // What the customer was charged, not what the course is owed.
            total: 297_000, currency: 'KRW',
        });
        expect(new Date(b.startsAt).toISOString()).toBe(b.startsAt);
        expect(new Date(b.created_at).toISOString()).toBe(b.created_at);
    });

    it('lists the newest booking first', async () => {
        const c = await course();
        const me = await user();
        const first = await book(c.id, me, 0, 'confirmed');
        await new Promise(resolve => setTimeout(resolve, 15));
        const second = await book(c.id, me, 1, 'confirmed');
        expect((await listGolfBookingsForUser(me)).map(b => b.reference)).toEqual([second, first]);
    });
});
