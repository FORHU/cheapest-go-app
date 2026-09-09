# Support is answered only by people

The Support Chat was built with a language model answering first and an Agent taking over on hand-over: a `ModelClient` port, a responder reasoning in `text | escalate | tool`, a booking-lookup tool, a per-chat and site-wide turn budget, and an OpenAI-compatible adapter — six modules and their tests. The model layer is removed. Every Support Chat goes to an Agent from its first message.

The trigger was finding that the assistant was not running in this environment and had no way to. `AI_API_KEY` held a URL rather than a key, so `AI_BASE_URL` and `AI_MODEL` fell through to their OpenAI defaults and every call returned 401 — which the responder correctly turned into an `assistant_unavailable` notice on every conversation on the site, exactly as CONTEXT.md said it should. The fix was one line of `.env`. We chose not to apply it.

The assistant's value was always contingent on being *right*, and nothing in the design could establish that it was. It could look up a booking and it could decline to answer, but a wrong answer about a cancellation policy is indistinguishable to the customer from a correct one, and it would have been given in the voice of a company that takes money for flights and hotels. The team is currently small enough that an Agent reads every conversation regardless, so the model was saving nobody any work — it was only answering sooner.

## Considered Options

**Point `AI_BASE_URL` at a real provider and keep the assistant.** Rejected. One line of configuration, and the code was already written, tested and reviewed — but "the code exists" is not a reason to run it. Enabling it would have made the first real production traffic the same moment we found out whether it answered well.

**Keep the model but restrict it to triage** — collecting a booking reference and the question before an Agent arrives. Rejected as the worst of both: it still speaks to customers in CheapestGo's voice, it still needs the entire adapter, responder and tool layer, and its output is a form the Agent must re-read anyway.

**Keep the code, stop invoking it.** Rejected. A dormant `responder.ts` with passing tests invites someone to re-enable a thing nobody decided to re-enable, and it keeps six glossary entries alive describing a system nobody runs — the exact failure CONTEXT.md exists to prevent.

## Consequences

- **Six terms leave CONTEXT.md.** Escalation, Turn Budget and Takeover named a hand-over that no longer happens; Support Chat, Support Hours and Agent were each defined in terms of the model. A chat is now **Waiting** from birth.
- **Out of hours, nobody answers at all.** The model previously replied around the clock and Support Hours governed only the promise. A customer writing at 2am now writes into a queue and is told which morning it will be read. The reopen-time UI already existed for escalated chats and simply applies to every chat now.
- **The notice vocabulary survives the deletion.** `SupportNoticeCode` and `noticeMessage` live in `responder.ts` but are imported by the message store; they outlive the responder around them.
- **The team gets far more email.** The doorbell used to ring on Escalation, which happened for three specific reasons and so was rare. Every conversation now reaches the queue, so it rings for every customer who writes in. Its trigger moves to the customer's first message on an unassigned waiting conversation — creation is too early, because the widget opens a conversation before anyone has typed a question. If the volume becomes noise, the fix is to ring only outside Support Hours or after an unanswered interval, not to remove the doorbell: an out-of-hours customer is otherwise invisible until somebody happens to open the admin.
- **`senderType: 'ai'` and `escalation_reason` become residue.** Kept in the schema rather than migrated away, because conversations really did happen that way. CONTEXT.md names them as residue so a reader does not mistake them for a capability.
- **Restoring the assistant means overturning this ADR first.** The code is recoverable from git; the reasoning above is the part that would have to change.
