# Golf course staff: invitation and self-registration — design

**Date:** 2026-10-12
**Branch:** `feat/golf-courses`
**Status:** approved in conversation (accounts: "implement 2 and 3")
**Builds on:** `2026-10-12-golf-trust-and-search-design.md`; ADR-0003 (`users.role` is authoritative),
ADR-0041 (the Support Agent precedent: a role admitted by its own guard, never by satisfying
`canAdminister`).

## Goal

Courses confirm their own tee-time requests instead of the team doing it. This slice gives a
course's staff an account and the right to act on **their** course only, by two routes:

1. **Invitation** — an admin invites a person to a course by email; they follow a signed link.
2. **Self-registration** — a signed-in customer asks to list or claim a course; an admin approves.

Both end in the same place: `grantCourseAccess(userId, courseId)`.

## Decisions

- **New role `course_staff`**, narrower than a Support Agent: it reaches only the courses it is
  attached to. `users.role` stays authoritative; the courses live in `golf_course_staff`.
- **An account is a customer account first.** Neither route creates a password flow of its own:
  the person signs up or in the normal way, and access is attached to that account.
- **Only `user` and `course_staff` accounts can be given course access.** An admin or Support
  Agent keeps their role; granting one would either demote them or do nothing.
- **An invitation is bound to an email.** It is accepted only by an account with that email.
  The token is 32 random bytes, stored as a SHA-256 hash, valid 7 days, single use, and
  re-inviting the same email to the same course revokes the earlier one.
- **Approval decides the course.** A request may name an existing published course (a claim) or a
  course not yet listed; approving the latter creates a **draft** course from the request.
- **Course staff may confirm or decline requests for their courses.** Cancelling a confirmed
  booking and refunding it stays with the admin: it moves money out.
- **Out of scope (next slices):** staff editing their course's schedules, extras and policies;
  the "still on?" re-check before the round; verified reviews.

## Data — migration `20261013000001_golf_course_staff.sql`

- `users_role_check` gains `'course_staff'`.
- `golf_course_staff (user_id, course_id, granted_by, created_at)` — PK `(user_id, course_id)`,
  both FKs `ON DELETE CASCADE`.
- `golf_course_invitations (id, course_id, email, token_hash UNIQUE, invited_by, expires_at,
  accepted_at, accepted_by, revoked_at, created_at)`.
- `golf_course_requests (id, user_id, status pending|approved|rejected, contact_name,
  contact_email, course_name, country, city, existing_course_id, message, course_id,
  decided_by, decided_at, decision_note, created_at)`; at most one pending request per user
  (partial unique index).
- `email_logs_email_type_check` gains `golf_course_invitation`, `golf_course_request_approved`,
  `golf_course_request_rejected`.

## Server — `src/lib/server/golf/`

- `staff.ts` — `grantCourseAccess`, `revokeCourseAccess`, `listCoursesOf`, `listStaffOf`,
  `staffCanManage(userId, courseId)`. Revoking the last course returns the account to `user`.
- `invitations.ts` — `createInvitation`, `describeInvitation`, `acceptInvitation`,
  `revokeInvitation`, `listInvitations`.
- `courseRequests.ts` — `submitCourseRequest`, `listCourseRequests`, `approveCourseRequest`,
  `rejectCourseRequest`.
- `staffEmails.ts` — the invitation and the approved/rejected emails. Never throws.
- `courseAccess.ts` — `requireCourseStaff()`: the guard on every `/api/course/*` route, and the
  single place the role is admitted.
- `bookings.ts` gains `listBookingsForCourses(courseIds, view)`; confirming and declining reuse
  `confirmBooking` / `declineBooking`, after a scope check.

## Roles — `src/lib/auth/roles.ts`

`ROLES` gains `course_staff`; `landingFor` sends it to `/course`; `roleLabel` names it; the admin
layout sends it to `/course` rather than the marketing site. Every existing guard keeps refusing
it, because none of them asks for it.

## Routes

| Route | Who | What |
|---|---|---|
| `POST /api/admin/golf-staff` | admin | invite, revoke an invitation, remove staff; `GET ?courseId=` lists staff and invitations |
| `GET/POST /api/admin/golf-course-requests` | admin | list pending; approve (optionally choosing the course) or reject with a note |
| `POST /api/golf/course-requests` | signed in | submit a request |
| `POST /api/course/invitations/accept` | signed in | accept an invitation by token |
| `GET/POST /api/course/golf-bookings` | course staff | the queue for their courses; confirm or decline |

## Pages

- `/admin/golf` — a **Staff** action per course (invite by email, pending invitations, current
  staff) and a **Requests** link with the pending count; `/admin/golf/requests` decides them.
- `/golf/list-your-course` — the request form (sign in first).
- `/course/join?token=` — shows the invitation and accepts it on a button press, never on load.
- `/course` — their courses and the booking queue: waiting requests with Confirm and Decline,
  then upcoming and past.

## Errors

Unknown, expired, used or revoked invitations all read as one plain message; a wrong-account
acceptance names the invited email. A booking outside the caller's courses is `404`, never `403`,
so the route does not confirm that it exists.

## Testing

- Pure: token generation and hashing, request and invite validation, role helpers.
- DB integration: grant/revoke including the role transitions, an invitation's whole life
  (valid, expired, used, revoked, wrong email), approval creating a draft course, the one-pending
  rule.
- Routes: auth and scope (an agent of course A cannot confirm a booking of course B).
- Components: the join page states, the request form, the queue's confirm and decline.
