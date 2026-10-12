import { describe, it, expect, afterAll } from 'vitest';
import type { GolfCourseInput } from '@/lib/schemas/golf';
import { courseRequestInputSchema } from '@/lib/schemas/golfStaff';
import { createCourse, deleteCourses, setCourseTimezone } from './courses';
import {
    acceptInvitation, createInvitation, describeInvitation, hashToken, listInvitations, newToken, revokeInvitation,
    INVITATION_DAYS,
} from './invitations';
import {
    approveCourseRequest, countPendingCourseRequests, listCourseRequests, rejectCourseRequest, submitCourseRequest,
} from './courseRequests';
import { listCoursesOf, staffCanManage } from './staff';

/**
 * Invitations and requests against a real database. Skips when no database is reachable.
 * Uses its own country so a developer's demo courses never enter an assertion.
 */

async function databaseReachable(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;
    try {
        const { getSqlAdmin } = await import('@/lib/db/postgres');
        await getSqlAdmin()`SELECT 1 FROM golf_course_requests LIMIT 1`;
        return true;
    } catch {
        return false;
    }
}

const reachable = await databaseReachable();
const run = crypto.randomUUID().slice(0, 8);
const country = `Onboardland ${run}`;
const courses: string[] = [];
const users: string[] = [];

async function sql() {
    const { getSqlAdmin } = await import('@/lib/db/postgres');
    return getSqlAdmin();
}

async function course(name: string, over: Partial<GolfCourseInput> = {}) {
    const input: GolfCourseInput = {
        name: `${name} ${run}`, country, city: 'Testville', slug: `onb-${name.toLowerCase()}-${run}`,
        address: null, description: '', holes: 18, par: null, greenFeeFrom: null, currency: 'USD', imageUrls: [],
        amenities: [], timezone: null, freeCancelHours: 48, bookingWindowDays: 60, weatherPolicy: '',
        yardage: null, yearOpened: null, designer: null, grass: null, ...over,
    };
    const c = await createCourse(input);
    courses.push(c.id);
    return c;
}

async function user(role = 'user') {
    const db = await sql();
    const email = `onb-${run}-${users.length}@example.com`;
    const [row] = await db<{ id: string }[]>`INSERT INTO users (email, role) VALUES (${email}, ${role}) RETURNING id`;
    users.push(row.id);
    return { id: row.id, email };
}

afterAll(async () => {
    if (!reachable) return;
    const db = await sql();
    const created = await db<{ id: string }[]>`SELECT id FROM golf_courses WHERE country = ${country}`;
    const ids = [...new Set([...courses, ...created.map(c => c.id)])];
    if (ids.length) await deleteCourses(ids);
    if (users.length) await db`DELETE FROM users WHERE id IN ${db(users)}`;
});

describe('invitation tokens', () => {
    it('are long, random and stored only as a hash', () => {
        const a = newToken();
        const b = newToken();
        expect(a).not.toBe(b);
        expect(a.length).toBeGreaterThanOrEqual(43);
        expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
        expect(hashToken(a)).not.toContain(a);
    });
});

describe.skipIf(!reachable)('invitations', () => {
    const now = new Date('2026-10-12T00:00:00Z');

    it('lets the invited account accept once, and only for the invited email', async () => {
        const c = await course('Alpha');
        const person = await user();
        const stranger = await user();
        const inv = await createInvitation({ courseId: c.id, email: person.email.toUpperCase(), now });
        expect(inv.expiresAt.getTime() - now.getTime()).toBe(INVITATION_DAYS * 86_400_000);

        expect(await describeInvitation(inv.token, now)).toMatchObject({ state: 'valid', courseName: c.name, email: person.email });

        // Someone else holding the link learns whom it is for, and gets nothing.
        await expect(acceptInvitation({ token: inv.token, userId: stranger.id, userEmail: stranger.email, now }))
            .rejects.toMatchObject({ code: 'wrong_account', detail: { invitedEmail: person.email } });
        expect(await staffCanManage(stranger.id, c.id)).toBe(false);

        const accepted = await acceptInvitation({ token: inv.token, userId: person.id, userEmail: person.email, now });
        expect(accepted).toEqual({ courseId: c.id, courseName: c.name });
        expect(await staffCanManage(person.id, c.id)).toBe(true);

        expect(await describeInvitation(inv.token, now)).toMatchObject({ state: 'used' });
        await expect(acceptInvitation({ token: inv.token, userId: person.id, userEmail: person.email, now }))
            .rejects.toMatchObject({ code: 'invitation_invalid' });
    });

    it('expires, and can be revoked', async () => {
        const c = await course('Bravo');
        const person = await user();
        const expiring = await createInvitation({ courseId: c.id, email: person.email, now });
        const later = new Date(now.getTime() + (INVITATION_DAYS * 86_400_000) + 1000);
        expect(await describeInvitation(expiring.token, later)).toMatchObject({ state: 'expired' });
        await expect(acceptInvitation({ token: expiring.token, userId: person.id, userEmail: person.email, now: later }))
            .rejects.toMatchObject({ code: 'invitation_invalid' });

        const fresh = await createInvitation({ courseId: c.id, email: person.email, now });
        // Inviting again replaced the earlier one.
        expect(await describeInvitation(expiring.token, now)).toMatchObject({ state: 'revoked' });
        expect(await revokeInvitation(fresh.id, now)).toBe(true);
        expect(await revokeInvitation(fresh.id, now)).toBe(false);
        await expect(acceptInvitation({ token: fresh.token, userId: person.id, userEmail: person.email, now }))
            .rejects.toMatchObject({ code: 'invitation_invalid' });

        const history = await listInvitations(c.id, now);
        expect(history.map(h => h.state).sort()).toEqual(['revoked', 'revoked']);
    });

    it('treats an unknown token like any other dead one', async () => {
        expect(await describeInvitation('nope')).toEqual({ state: 'unknown' });
        expect(await describeInvitation('')).toEqual({ state: 'unknown' });
    });

    it('leaves an invitation usable when the account cannot hold course access', async () => {
        const c = await course('Charlie');
        const admin = await user('admin');
        const inv = await createInvitation({ courseId: c.id, email: admin.email, now });
        await expect(acceptInvitation({ token: inv.token, userId: admin.id, userEmail: admin.email, now }))
            .rejects.toMatchObject({ code: 'not_eligible' });
        expect(await describeInvitation(inv.token, now)).toMatchObject({ state: 'valid' });
    });

    it('refuses a bad email and an unknown course', async () => {
        const c = await course('Delta');
        await expect(createInvitation({ courseId: c.id, email: 'not-an-email' })).rejects.toMatchObject({ code: 'invalid_email' });
        await expect(createInvitation({ courseId: '00000000-0000-4000-8000-000000000000', email: 'a@b.co' }))
            .rejects.toMatchObject({ code: 'course_not_found' });
    });
});

describe.skipIf(!reachable)('course requests', () => {
    const input = (over: Record<string, unknown> = {}) => courseRequestInputSchema.parse({
        contactName: 'Ana Cruz', courseName: `New Greens ${run}`, country, city: 'Testville', ...over,
    });

    it('creates a draft course on approval and attaches the requester', async () => {
        const person = await user();
        const admin = await user('admin');
        const request = await submitCourseRequest({ userId: person.id, contactEmail: person.email, input: input() });
        expect(request.status).toBe('pending');
        expect((await listCourseRequests('pending')).map(r => r.id)).toContain(request.id);
        expect(await countPendingCourseRequests()).toBeGreaterThanOrEqual(1);

        const result = await approveCourseRequest({ id: request.id, decidedBy: admin.id, note: 'Welcome.' });
        expect(result.createdCourse).toBe(true);
        expect(result.request).toMatchObject({ status: 'approved', decisionNote: 'Welcome.', courseId: result.courseId });

        const mine = await listCoursesOf(person.id);
        expect(mine).toHaveLength(1);
        expect(mine[0]).toMatchObject({ id: result.courseId, status: 'draft', name: `New Greens ${run}` });
        // It is a draft: nothing on the storefront changed.
        const [row] = await (await sql())<{ timezone: string | null }[]>`SELECT timezone FROM golf_courses WHERE id = ${result.courseId}`;
        expect(row.timezone).toBeNull();
    });

    it('attaches the requester to an existing course when claiming one', async () => {
        const listed = await course('Echo', { name: `Echo Listed ${run}` });
        await setCourseTimezone(listed.id, 'Asia/Manila');
        const db = await sql();
        await db`UPDATE golf_courses SET status = 'published' WHERE id = ${listed.id}`;
        const person = await user();
        const admin = await user('admin');

        const request = await submitCourseRequest({
            userId: person.id, contactEmail: person.email, input: input({ existingCourseId: listed.id }),
        });
        expect(request.existingCourseName).toBe(listed.name);
        const result = await approveCourseRequest({ id: request.id, decidedBy: admin.id });
        expect(result).toMatchObject({ courseId: listed.id, createdCourse: false });
        expect(await staffCanManage(person.id, listed.id)).toBe(true);
    });

    it('allows one open request per person, and a new one after a decision', async () => {
        const person = await user();
        const admin = await user('admin');
        const first = await submitCourseRequest({ userId: person.id, contactEmail: person.email, input: input({ courseName: `Pending ${run}` }) });
        await expect(submitCourseRequest({ userId: person.id, contactEmail: person.email, input: input({ courseName: `Again ${run}` }) }))
            .rejects.toMatchObject({ code: 'request_pending' });

        const rejected = await rejectCourseRequest({ id: first.id, decidedBy: admin.id, note: 'Not verified.' });
        expect(rejected).toMatchObject({ status: 'rejected', decisionNote: 'Not verified.' });
        expect(await listCoursesOf(person.id)).toEqual([]);

        const second = await submitCourseRequest({ userId: person.id, contactEmail: person.email, input: input({ courseName: `Again ${run}` }) });
        expect(second.status).toBe('pending');
    });

    it('cannot be decided twice', async () => {
        const person = await user();
        const admin = await user('admin');
        const request = await submitCourseRequest({ userId: person.id, contactEmail: person.email, input: input({ courseName: `Twice ${run}` }) });
        await approveCourseRequest({ id: request.id, decidedBy: admin.id });
        await expect(approveCourseRequest({ id: request.id, decidedBy: admin.id })).rejects.toMatchObject({ code: 'request_decided' });
        await expect(rejectCourseRequest({ id: request.id, decidedBy: admin.id })).rejects.toMatchObject({ code: 'request_decided' });
    });

    it('refuses staff accounts and unlisted claims', async () => {
        const agent = await user('support_agent');
        await expect(submitCourseRequest({ userId: agent.id, contactEmail: agent.email, input: input() }))
            .rejects.toMatchObject({ code: 'not_eligible' });

        const person = await user();
        await expect(submitCourseRequest({
            userId: person.id, contactEmail: person.email,
            input: input({ existingCourseId: '00000000-0000-4000-8000-000000000000' }),
        })).rejects.toMatchObject({ code: 'course_not_found' });
    });

    it('finds a free address when the obvious one is taken', async () => {
        const taken = await course('Foxtrot', { name: `Same Name ${run}`, slug: `same-name-${run}-testville` });
        expect(taken.slug).toBe(`same-name-${run}-testville`);
        const person = await user();
        const admin = await user('admin');
        const request = await submitCourseRequest({
            userId: person.id, contactEmail: person.email, input: input({ courseName: `Same Name ${run}` }),
        });
        const result = await approveCourseRequest({ id: request.id, decidedBy: admin.id });
        expect(result.createdCourse).toBe(true);
        const [row] = await (await sql())<{ slug: string }[]>`SELECT slug FROM golf_courses WHERE id = ${result.courseId}`;
        expect(row.slug).toBe(`same-name-${run}-testville-2`);
    });
});
