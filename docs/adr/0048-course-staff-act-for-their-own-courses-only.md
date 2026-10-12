# Course staff act for their own courses only, and arrive by invitation or approved request

A person who runs a Golf Course can confirm or decline tee-time requests for **that course**,
and nothing else, from `/course`. They get there in one of two ways: an admin invites them by
email, or they ask and an admin approves. This records the choices that are easy to get wrong.

**The role is narrow, and its scope is a table.** `users.role = 'course_staff'` (ADR-0003) says
what kind of account it is; `golf_course_staff (user_id, course_id)` says which courses. Both are
read on every request by `requireCourseStaff()`, so a person removed from a course loses it at
once, and a role with no courses can do nothing. Like the Support Agent (ADR-0041), nothing else
in the back office asks for this role: it is refused by `requireAdmin` because it is not `admin`,
and admitted only by its own guard.

**Access is attached to a customer account; there is no second sign-in.** Neither route creates
a password flow. The person signs up or in the ordinary way and access is granted to that
account. This keeps one identity per human and means a course's staff can still book golf as a
customer. The cost is that an admin or a Support Agent cannot also be course staff: giving them
the role would either demote them or do nothing, so `grantCourseAccess` refuses them and says to
use a separate customer account.

**An invitation is a promise to one email address.** The link carries 32 random bytes; only the
SHA-256 hash is stored, so reading the table yields no usable link. It works once, lasts seven
days, and is accepted only by an account with the invited email, so a forwarded link is useless.
Opening it changes nothing: acceptance is a button press on the page, because a GET that mutates
is followed by email scanners and link previews. Re-inviting the same address to the same course
withdraws the earlier invitation.

**A request names a course or asks for a new one, and approval decides.** A signed-in customer
submits it, one open request each. Approving attaches them to the named course, to one the admin
chooses instead, or to a **draft** course created from the request: it is not published, so a
request can never put a course on the storefront by itself.

**Course staff confirm and decline; they do not cancel.** Confirming captures the customer's
payment, which is what the course is vouching for. Cancelling a confirmed booking refunds money
and stays with the team. A course sees who is playing, when and what they asked for, and the green
fee, but not the payer's email, card or our fee: it needs to recognise the booking, not to deal
with the customer around us. A booking of another course reads as missing (404), so the route
does not confirm it exists.

**Role changes release course access.** An admin cannot set `course_staff` by hand from the Users
page, since the role means nothing without courses; changing someone to any other role deletes
their attachments so a later grant starts from nothing.

## Considered options

- **A separate partner login (its own credentials and sessions).** Rejected: a second identity per
  person, a second password reset and a second session policy to maintain, for no gain.
- **Admin promotes an existing account and assigns courses, with no invitation.** Kept as the
  mechanism underneath (`grantCourseAccess`), but not the only door: courses will not ask a
  stranger at the platform to hunt for their account.
- **Accept an invitation on opening the link.** Rejected for the reason above.
- **Let course staff cancel and refund.** Deferred: it needs a policy on who bears a refund the
  course caused.
