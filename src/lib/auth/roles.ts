/**
 * What each role may do, in one place.
 *
 * Every guard used to compare against the literal `'admin'`. That was safe with two roles —
 * anything else is denied by default — but it meant the answer to "what can a support agent
 * reach?" was spread across twenty files and could only be got by reading all of them.
 *
 * `users.role` is the authority ([ADR-0003](../../docs/adr/0003-users-role-is-authoritative.md));
 * this module is only the reading of it. Every function refuses a value it does not
 * recognise, so a role invented in a newer deployment, or a typo in a hand-written UPDATE,
 * loses access rather than gaining it.
 */

export const ROLES = ['user', 'admin', 'support_agent', 'course_staff'] as const;

export type Role = (typeof ROLES)[number];

/**
 * The roles an admin may set by hand on the Users page. `course_staff` is deliberately not one:
 * the role only means something together with the courses in `golf_course_staff`, so it is
 * given by adding a person to a course (an invitation or an approved request), never alone.
 */
export const MANUALLY_ASSIGNABLE_ROLES = ['user', 'admin', 'support_agent'] as const;

/** Narrow an unvalidated value — a session field, a request body — to a known role. */
export function isRole(value: unknown): value is Role {
    return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** May reach the back office: bookings, revenue, Stripe, settings, everyone's data. */
export function canAdminister(role: Role | null | undefined): boolean {
    return role === 'admin';
}

/**
 * May staff the Support Desk: answer chats, set the hours, look a booking up read-only.
 *
 * True for admins as well. An admin answering a chat is an **Agent** too — the desk is a
 * narrower workspace, not a place administrators are shut out of.
 */
export function canStaffSupport(role: Role | null | undefined): boolean {
    return role === 'admin' || role === 'support_agent';
}

/**
 * May act for the Golf Courses they have been attached to (confirm or decline their requests).
 *
 * Not true for an admin: an admin works from the back office, which already reaches every
 * course. Which courses a `course_staff` account may act for is `golf_course_staff`, read by
 * `requireCourseStaff()` — this only says the role is the right kind.
 */
export function canStaffCourses(role: Role | null | undefined): boolean {
    return role === 'course_staff';
}

/**
 * Where signing in should put someone, or null to let the caller decide.
 *
 * Null is for customers, where the `next` parameter or wherever they came from is a better
 * answer than anything a role can supply.
 */
export function landingFor(role: Role | null | undefined, returnTo?: string | null): string | null {
    if (role === 'admin') return '/admin/overview';
    if (role === 'support_agent') return '/admin/desk';
    if (role === 'course_staff') {
        // An emailed link (a second invitation) must survive signing in: honour a return path that
        // is inside the portal, and only that.
        return returnTo && (returnTo === '/course' || returnTo.startsWith('/course/') || returnTo.startsWith('/course?'))
            ? returnTo
            : '/course';
    }
    return null;
}

/** How a role is written where a person reads it. */
export function roleLabel(role: Role | null | undefined): string {
    switch (role) {
        case 'admin':
            return 'Administrator';
        case 'support_agent':
            return 'Support Agent';
        case 'course_staff':
            return 'Course staff';
        default:
            return 'Standard User';
    }
}
