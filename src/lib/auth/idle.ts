/**
 * Idle Limit — how long a Session survives without Presence, after which the traveller
 * signs in again. Ten minutes for staff, thirty for travellers — the traveller figure
 * matches the life of a Price Hold, so the two things a traveller can lose lapse on the
 * same scale. See CONTEXT.md ("Idle Limit") and ADR-0027.
 *
 * Deliberately has no idea where `lastActiveAt` came from — session.ts owns the cookie and
 * the Postgres round trip. Keeping the decision here, with no I/O, is what makes every
 * boundary case cheap to write down and fast to run.
 */

import { canStaffSupport, isRole, type Role } from './roles';

/** Minutes a session may go without Presence before it is treated as expired. */
export function idleLimitMinutes(role: Role): number {
    return canStaffSupport(role) ? 10 : 30;
}

export interface IdleCheckInput {
    /** When Presence — a click, keypress, scroll or touch — was last recorded for this session. */
    lastActiveAt: Date;
    role: Role;
    now: Date;
}

/**
 * True once a session has gone longer than its Idle Limit without Presence.
 *
 * A role this build does not recognise gets no limit to look up — same bias as
 * `isRole()`'s callers in roles.ts, which refuse an unrecognised role rather than guess at
 * what it can do. Here that means treating the session as already expired instead of
 * leaving it open indefinitely.
 */
export function hasExceededIdleLimit({ lastActiveAt, role, now }: IdleCheckInput): boolean {
    if (!isRole(role)) return true;
    const limitMs = idleLimitMinutes(role) * 60_000;
    return now.getTime() - lastActiveAt.getTime() > limitMs;
}
