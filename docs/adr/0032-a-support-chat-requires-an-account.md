# A Support Chat requires an account

Opening a Support Chat requires signing in. Guest chats — a `guest_token_hash` on the conversation, a name and email collected at hand-over, and a widget an anonymous visitor could type into immediately — are removed.

This follows directly from [ADR-0031](0031-support-is-answered-only-by-people.md). While a model answered first, a guest could get a useful reply without identifying themselves at all, and contact details were needed only at the moment a conversation became a person's to answer — what CONTEXT.md called "the one moment a guest is asked for them". With no model, every chat needs an Agent, so every chat needs a way to reach the customer from its first message. The open question was where to put the ask, not whether to make it.

## Considered Options

**Ask after the first message, before queueing.** Rejected. It keeps the low-friction opening — the customer types their question, then is asked how to reach them — but it leaves a written question that is not yet queued, and a customer who abandons the form has told us something we can neither answer nor honestly discard.

**Queue guests with no reply path.** Rejected. Simplest to build and it preserves anonymous chat, but an Agent would be answering into a void: a guest who closes the tab is unreachable, and the queue accumulates conversations that cannot be finished.

**Ask for a name and email up front, without an account.** Rejected. It offers the same guarantee without the registration wall, but it collects an unverified email, and [ADR-0029](0029-an-unverified-email-is-not-a-credential.md) already establishes that this is not a credential. A signed-in customer's booking history is also the thing an Agent most needs.

## Consequences

- **Support now sits behind a registration wall.** On a booking site that has a conversion cost, and it is paid by the customer who has a problem right now. This is the weakest part of the decision and the most likely to be revisited.
- **Every Support Chat has a verified identity and a booking history behind it.** An Agent no longer opens a conversation not knowing who they are talking to, and a Support Agent's read-only booking lookup has something to key on.
- **The widget's job changes for signed-out visitors.** The launcher stays visible — hiding it would make support look absent — and opens a sign-in prompt rather than a composer.
- **Guest columns and the escalation form become dead code.** Left in place rather than migrated away, for the same reason as ADR-0031's residue: past conversations genuinely had guests, and their transcripts still name them.
- **Every existing guest conversation is closed, including ones that left contact details.** This looks harsher than it is, and the reason is not obvious: an Agent's reply lives in the app, and `notify.ts` is a doorbell to the team rather than a copy of the conversation to the customer. There is no email path to a guest. So once the widget requires an account, a queued guest conversation is one nobody can read — the answering-into-the-void this ADR exists to prevent. They are resolved with an `assistant_retired` notice telling them to sign in and write again, which preserves the transcript and gives them a route back. Signed-in conversations are queued normally.

## Enforcement, added 2026-09-10

This decision was documented and acted on in the data, but not enforced in code, and the gap
lasted two days. The migration resolved every guest conversation; `openConversation` went on
minting guest tokens for anyone signed out, and no route or client checked. The reason
nobody noticed is worth recording: the only entry point was the floating launcher, and the
launcher was removed for unrelated reasons — so anonymous support became unreachable rather
than refused. A decision enforced by the absence of a button is not enforced.

What now holds it:

- **`openConversation` throws** for a signed-out caller. The guest `INSERT` is deleted, not
  merely unreachable, and `mintGuestToken` has no callers left.
- **Every customer-side write returns 401** with `authRequired: true` — opening a
  conversation, posting a message, and asking for a person. The flag exists because "sign
  in" and "your session expired mid-sentence" are indistinguishable from a status code, and
  the widget has to tell a customer which happened.
- **Reading stays open to a guest holding the old cookie.** That is deliberate and is the
  route back this ADR promised them: the transcript, and the notice saying to sign in and
  write again. Closing it would strand them with no explanation.
- **`account-required.test.ts` pins all of the above**, so the guard cannot be dropped a
  second time without a test going red.

The escalation form is now dead in fact as well as in name — its name-and-email branch
cannot be entered, because the route refuses before reaching it.
