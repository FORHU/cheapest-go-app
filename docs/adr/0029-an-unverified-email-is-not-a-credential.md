# An unverified email is not a credential

The support model may look up a customer's bookings only when a Lucia session says who they are. The email a guest types into the Support Chat before asking for a person is a reply-to address and nothing else: it never unlocks a lookup, never confirms whether a booking exists, and never narrows an answer. A guest asking "where is my booking?" is told to sign in, or escalated to an **Agent**.

This is worth writing down because the obvious reading of the feature says otherwise. An Agent taking the same question on the phone *does* look people up by email — that is the normal way support works — and the guest has already typed the address into our own form. Declining to use it looks like an oversight rather than a decision, and the first person to read the responder's tool list will wonder why `get_bookings` is gated on a session when the email is sitting right there in the conversation row.

The reason is that the two situations are not the same one. An Agent reading an email address is a person weighing a claim, with a name, a card's last four digits, a travel date and a voice to weigh it against, and the standing to refuse. A model reading the same address has no way to judge a lie and no notion of having been fooled; it has only a string that arrived in a text field on a public page. Anyone can type anyone's address. Making that string sufficient turns the Support Widget into an oracle that answers "has this person booked with you, and where are they going" for any address a stranger cares to try — from the landing page, with no account, at any hour. [ADR-0027](0027-authorisation-belongs-to-the-resource-not-the-page.md) already holds that authorisation belongs to the resource; a booking's resource is guarded by a session or by a Capability Link, and an address typed into a form is neither.

The same reasoning is why the guest token in the `cg-support` cookie authorises exactly one thing — reading and continuing that one Support Chat — and is not extended to anything the guest merely claims about themselves inside it.

## Considered options

**Gate booking lookup on a session (chosen).** The model's read tools are available when, and only when, the caller is signed in. A guest gets policy answers and an Escalation. The cost is a real one: the guest who booked as a guest, has a confirmation email in front of them, and simply wants to know if their room is confirmed, is told to sign in or wait for an Agent.

**Let the model confirm existence only** — "yes, there is a booking for that address" and nothing more. Rejected. It reads as a small disclosure and is not: it answers the only question an attacker needs to ask, at scale, and the reply is trivially turned into a list of which addresses in a breach dump have travelled with us. The subsequent details are worth less than the fact.

**Email a code to the address and unlock on verification.** Rejected for now, not on principle — it is the correct answer to the underlying problem, and it is what we should build if guest lookups turn out to matter. It was rejected as scope: it is a second authentication path, with its own issuance, expiry, replay and rate-limit questions, sitting beside Lucia and doing a similar job. Building it as a sub-feature of a chat widget is how a weak second way in gets created, which is the specific failure [ADR-0027](0027-authorisation-belongs-to-the-resource-not-the-page.md) warns about.

**Trust the address because the pre-chat form asked for it.** This is the status quo of most support widgets and was never seriously on the table, but it is what the code will drift into if nobody writes this down. The form's purpose is to be able to reply, not to establish identity.

## Consequences

- **The responder's tool list is split by caller, not by conversation.** `get_bookings` is unavailable to a guest even in a conversation where a name and email have been captured at Escalation. The tool layer reads the session, never `support_conversations.guest_email`.
- **"Sign in and I can pull that up" is a first-class answer**, not a failure path, and needs to read as helpful rather than obstructive. It is also the widget's strongest reason for a customer to authenticate.
- **Escalation carries more load than it otherwise would.** Every guest question that turns on a specific booking reaches an Agent. If that volume becomes the dominant cost of running the desk, the verified-code option above is the thing to build — not a relaxation of this rule.
- **`guest_email` exists solely so someone can reply.** Any future code reading it to decide what a customer may see is a defect against this ADR, whether the reader is the model, a route, or an admin screen.
