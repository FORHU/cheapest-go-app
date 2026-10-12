import { describe, it, expect, afterAll } from 'vitest';
import type { GolfCourseInput } from '@/lib/schemas/golf';
import { createCourse, deleteCourses } from './courses';
import {
    grantCourseAccess, listCoursesOf, listStaffOf, releaseCourseAccess, revokeCourseAccess, staffCanManage,
} from './staff';
import { CourseStaffError } from './errors';

/** Course staff against a real database. Skips when no database is reachable. */

async function databaseReachable(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin()`SELECT 1 FROM golf_course_staff LIMIT 1`;
        return true;
    } catch {
        return false;
    }
}

const reachable = await databaseReachable();
const run = crypto.randomUUID().slice(0, 8);
const courses: string[] = [];
const users: string[] = [];

async function sql() {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    return getSqlAdmin();
}

async function course(name: string) {
    const input: GolfCourseInput = {
        name: `${name} ${run}`, country: 'Staffland', city: 'Testville', slug: `staff-${name.toLowerCase()}-${run}`,
        address: null, description: '', holes: 18, par: null, greenFeeFrom: null, currency: 'USD', imageUrls: [],
        amenities: [], timezone: 'Asia/Manila', freeCancelHours: 48, bookingWindowDays: 60, weatherPolicy: '',
        yardage: null, yearOpened: null, designer: null, grass: null,
    };
    const c = await createCourse(input);
    courses.push(c.id);
    return c;
}

async function user(role = 'user') {
    const db = await sql();
    const email = `staff-${run}-${users.length}@example.com`;
    const [row] = await db<{ id: string }[]>`
        INSERT INTO users (email, role, first_name, last_name) VALUES (${email}, ${role}, 'Ana', 'Cruz') RETURNING id`;
    users.push(row.id);
    return { id: row.id, email };
}

async function roleOf(id: string) {
    const db = await sql();
    const [row] = await db<{ role: string }[]>`SELECT role FROM users WHERE id = ${id}`;
    return row.role;
}

afterAll(async () => {
    if (!reachable) return;
    const db = await sql();
    if (courses.length) await deleteCourses(courses);
    if (users.length) await db`DELETE FROM users WHERE id IN ${db(users)}`;
});

describe.skipIf(!reachable)('course staff access', () => {
    it('makes a customer course staff for one course, and only that course', async () => {
        const a = await course('Alpha');
        const b = await course('Bravo');
        const person = await user();

        expect(await grantCourseAccess({ userId: person.id, courseId: a.id })).toEqual({ newlyGranted: true });
        expect(await roleOf(person.id)).toBe('course_staff');
        expect(await staffCanManage(person.id, a.id)).toBe(true);
        expect(await staffCanManage(person.id, b.id)).toBe(false);
        expect((await listCoursesOf(person.id)).map(c => c.id)).toEqual([a.id]);
        expect((await listStaffOf(a.id)).map(s => s.email)).toEqual([person.email]);
    });

    it('is idempotent and can attach the same person to a second course', async () => {
        const a = await course('Charlie');
        const b = await course('Delta');
        const person = await user();
        await grantCourseAccess({ userId: person.id, courseId: a.id });
        expect(await grantCourseAccess({ userId: person.id, courseId: a.id })).toEqual({ newlyGranted: false });
        await grantCourseAccess({ userId: person.id, courseId: b.id });
        expect((await listCoursesOf(person.id)).map(c => c.id).sort()).toEqual([a.id, b.id].sort());
    });

    it('returns the account to a customer only when the last course goes', async () => {
        const a = await course('Echo');
        const b = await course('Foxtrot');
        const person = await user();
        await grantCourseAccess({ userId: person.id, courseId: a.id });
        await grantCourseAccess({ userId: person.id, courseId: b.id });

        expect(await revokeCourseAccess({ userId: person.id, courseId: a.id })).toBe(true);
        expect(await roleOf(person.id)).toBe('course_staff');
        expect(await revokeCourseAccess({ userId: person.id, courseId: b.id })).toBe(true);
        expect(await roleOf(person.id)).toBe('user');
        expect(await revokeCourseAccess({ userId: person.id, courseId: b.id })).toBe(false);
    });

    it('refuses to attach an admin or a support agent, leaving their role alone', async () => {
        const a = await course('Golf');
        for (const role of ['admin', 'support_agent']) {
            const staff = await user(role);
            await expect(grantCourseAccess({ userId: staff.id, courseId: a.id }))
                .rejects.toMatchObject({ code: 'not_eligible' });
            expect(await roleOf(staff.id)).toBe(role);
        }
    });

    it('refuses an unknown person or course', async () => {
        const a = await course('Hotel');
        const person = await user();
        const missing = '00000000-0000-4000-8000-000000000000';
        await expect(grantCourseAccess({ userId: missing, courseId: a.id })).rejects.toBeInstanceOf(CourseStaffError);
        await expect(grantCourseAccess({ userId: person.id, courseId: missing })).rejects.toMatchObject({ code: 'course_not_found' });
    });

    it('does not let a stale attachment act once the role has moved on', async () => {
        const a = await course('India');
        const person = await user();
        await grantCourseAccess({ userId: person.id, courseId: a.id });
        const db = await sql();
        await db`UPDATE users SET role = 'user' WHERE id = ${person.id}`;
        expect(await staffCanManage(person.id, a.id)).toBe(false);
        expect(await listCoursesOf(person.id)).toEqual([]);
        expect(await releaseCourseAccess(person.id)).toBe(1);
    });
});
