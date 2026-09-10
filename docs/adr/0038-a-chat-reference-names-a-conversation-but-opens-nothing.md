# A Chat Reference names a conversation but opens nothing

Every Support Chat gets a short code — `CS-` and six Crockford characters, e.g. `CS-9QM2K7` — so a customer can cite a conversation and an Agent can name one to a colleague. It is an identifier and nothing more: holding it grants no access, and a Support Chat is still reached only by signing in.

The reference was taken from `boostk-app`, whose helpdesk we reviewed for exactly this. Its reference is a bearer credential, generated from a CSPRNG because, in its own words, it "authorizes reading, posting, rating and closing" — the code *is* the way in, which is what lets a signed-out visitor return to their conversation. That is the opposite of [ADR-0032](0032-a-support-chat-requires-an-account.md), decided a day earlier: a Support Chat requires an account precisely so there is always a verified identity and a reachable person behind it. We took the affordance and left the mechanism.

## Considered Options

**Adopt the bearer reference as boostk has it.** Rejected. It is genuinely useful — it is how a customer with no account resumes a conversation from another device — but it reintroduces the anonymous chat ADR-0032 removed, and it does so quietly, as a property of an identifier rather than as a visible decision about who may open a chat. A guessed or forwarded code would be a stranger reading somebody's trip.

**Reuse the booking prefixes, `CG-` and `GG-`.** Rejected. It would make one convention instead of two, but `isBookingReference()` guards the Stripe metadata path in `booking/confirm/route.ts`, and a chat reference of the same shape would satisfy it. More plainly: a customer who writes "about CG-7K2M9Q" would be naming either a sale or a conversation, and nobody could tell which.

**Scope the prefix per brand, `CGS-` and `GGS-`.** Rejected. It mirrors the booking convention, but the reason bookings carry a brand is that FORHU settles both brands into one Stripe account and the prefix is the only thing that splits the payout — a conversation has no money in it. [ADR-0030](0030-the-support-inbox-ignores-the-brand-switcher.md) also has the inbox deliberately blind to brand, so a brand in the reference would name a boundary the queue does not have.

**No reference at all.** Rejected, though it was the status quo and CONTEXT.md defended it. A conversation with no name can only be pointed at by a link, which means a customer contacting us any other way — a reply to a booking email, a phone call — has no way to say which conversation they mean.

## Consequences

- **The reference is decorative unless the customer sees it**, so it is shown in the widget and copyable. It is deliberately not emailed: support mail today is one-directional, a doorbell to the team, and mailing a customer invites a reply into a mailbox nothing ingests. Email-to-ticket is the missing capability there, and it is not built.
- **A reference proves nothing in a dispute.** If someone quotes `CS-9QM2K7` in an email, that is a claim about which conversation they mean, not evidence they are the customer. Identity still comes from the session.
- **Uniqueness is enforced by the column, not by the generator.** 32^6 ≈ 1.07e9 is ample but not collision-proof, so the insert retries, exactly as `mintUniqueBookingReference` already does.
- **CONTEXT.md's `Avoid: "ticket"` had to be rewritten.** It gave "not numbered" as one of three reasons a Support Chat is not a ticket, and that reason is now false. The other two — not closed by the customer, nothing promised off-line — still hold, and being citable turns out to be independent of being a queue item.
