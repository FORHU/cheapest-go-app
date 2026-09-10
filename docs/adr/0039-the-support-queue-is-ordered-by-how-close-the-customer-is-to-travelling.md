# The support queue is ordered by how close the customer is to travelling

The Waiting queue is no longer strictly first-come-first-served. A Support Chat is ordered by the **Urgency** of the trips linked to it — someone travelling today or tomorrow is answered before someone asking about a receipt — and only then by how long they have waited. Urgency is computed at read time from the booking's dates. It is never stored, never asked for, and an Agent can overrule it.

FIFO is the fair rule when nothing distinguishes the people in the queue. In travel something does: a customer at an airport whose flight leaves in three hours and a customer asking how refunds work are not interchangeable, and answering them in the order they happened to write is only defensible if you cannot tell them apart. Since [ADR-0032](0032-a-support-chat-requires-an-account.md) every Support Chat has an account behind it, and with a Linked Booking the departure date is already known — so we can tell them apart, and ordering by arrival time becomes a choice rather than a necessity.

## Considered Options

**Keep strict FIFO.** Rejected, and it is the option with the best claim to fairness — it cannot be gamed, it needs no code, and at one live conversation the queue has no order to get wrong. It was rejected because the case it handles worst is the case that costs a customer most, and that case arrives without warning.

**Ask the customer how urgent it is.** Rejected. It is the obvious design and it is self-defeating: a box marked "urgent" is ticked by everyone who is worried, which is everyone who is writing to support, so the queue ends up sorted by anxiety rather than by need. It also asks the customer to do triage they have no way to perform — they cannot know how their problem compares to the others waiting.

**A priority field an Agent sets.** Rejected as the primary mechanism, kept as an override. The flaw is one of timing: a chat nobody has opened is always at its default, so priority cannot help the person it would help most — the one still waiting to be seen. By the time an Agent has read enough to set it, they are already answering.

**Order by the customer's most recent booking regardless of dates.** Rejected. It is simpler than a date computation, but it promotes the frequent buyer rather than the person in trouble, which is a loyalty programme wearing a queue's clothing.

## Consequences

- **Urgency is derived, never written.** This is the part most likely to look like an oversight later: there is no `urgency` column. A booking three weeks out when the chat opened is three days out a fortnight later, and a stored value would be wrong by then unless something walked the table to refresh it. Computing it in the query keeps it true without a job to run.
- **What *is* stored is the override.** A null priority means "use the computed value", so an Agent's judgement survives and the default keeps moving on its own.
- **A chat with no Linked Booking sorts as ordinary.** Correct in the common case — a question with no trip attached is rarely the one that cannot wait — but it means a customer whose booking we failed to link is treated as unhurried. This is the sharpest edge of the decision, and the reason the customer is offered their bookings when opening a chat rather than left to mention one.
- **A chat with several Linked Bookings takes the most urgent of them.** A trip is often a flight and a hotel; the imminent half is what matters.
- **The queue can now reorder while an Agent is looking at it.** Nothing moves because of anything anyone did — it moves because time passed and a departure got closer. Worth knowing before someone reports it as a bug.
- **Answering order is now a product decision with a rationale**, which means it can be argued with. That is an improvement on FIFO, which was never decided so much as inherited.
