# ADR-0041: Support Chats are assigned by an admin, never taken

## Status

Accepted

## Context

A Support Chat used to belong to whichever Agent replied to it first. The first reply wrote
`assigned_admin_id`, the chat left the queue, and nobody else could take it. It was simple, it
needed no admin, and it meant a chat was never stuck waiting for a decision.

It also made the queue a race. Support Agents are paid according to the chats they handle, so
"first to reply owns it" rewards whoever watches the queue hardest — not whoever the work should
go to, and not whoever is best placed to help. The same rule let any Agent reply in any chat,
which left "who did this work?" to be argued from memory. And nothing recorded who held a chat
over time: `assigned_admin_id` is overwritten on every change, so last month's figures could not
be reconstructed at all.

BoostK, which this was compared against, lets an admin assign and also lets an Agent "take" an
unassigned ticket. That keeps the queue moving without an admin, but a take button is the same
race with a different trigger.

## Decision

**Assignment is given by an admin and never taken.** A new chat stays **Unassigned** until an
admin gives it to a Support Agent — or to themselves. Nothing else assigns: not a reply, not a
timer, not a rota.

- A **Support Agent reads every chat** — the Unassigned queue and colleagues' chats — but
  **writes only in their own**: reply, attach, resolve, change urgency, link trips. Reading is
  how they learn and cover for each other; writing is the work, and the work follows Assignment.
- A Support Agent may **give a chat back**, only back, to Unassigned. Never to a named colleague.
- An **admin writes anywhere without that changing whose it is**. Help from an admin must not
  quietly move a chat, and the pay with it.
- A **resolved chat the customer reopens returns to Unassigned**, not to whoever had it. The
  admin usually gives it back to them — but decides.
- Someone who **stops being a Support Agent** has their open chats returned to Unassigned.
- **Every change is recorded** in `support_assignment_events` — assigned, returned, reopened,
  released, resolved — with who did it. A chat is **Handled** by whoever held it at the moment
  it was resolved, and the admins' tally reads those records, never `assigned_admin_id`.

## Consequences

- **The queue only moves when an admin is there.** A chat that arrives at night waits until an
  admin assigns it; Support Agents cannot answer it meanwhile, however idle. This was chosen over
  auto-assignment deliberately: every hand-out stays a person's decision. It makes admin cover of
  the Support Hours a staffing requirement, and the "someone is waiting" email
  (`SUPPORT_NOTIFY_EMAIL`) must reach whoever assigns.
- **The admins' queue is Unassigned, not unanswered.** Waiting (not answered yet) and Unassigned
  (no owner yet) are now different things: an admin can answer a chat without owning it, and a
  chat can be assigned and still Waiting. The inbox tabs and the sidebar badge follow ownership.
- **Disputes about pay have records.** Who was given what, when, by whom, and who held it at
  resolution are all stored as they happen. History before this decision cannot be recovered.
- **Undoing it is cheap in code, not in data.** Letting Agents take chats again is a small change;
  the event history stays valid either way, which is why it is recorded rather than derived.
