# ADR-0043: The widget suggests, only a person answers

## Status

Accepted

## Context

ADR-0031 removed the language model that used to answer a Support Chat first, and the reasoning
was not "the model was broken": it was that the model's value depended on being right, nothing
in the design could establish that it was, and a wrong answer about a cancellation policy reads
to a customer exactly like a correct one — in the voice of a company that took their money for a
flight. It also rejected the obvious middle ground, a model restricted to triage, as the worst of
both: still speaking for CheapestGo, still needing the whole adapter and responder layer.

What that left is a queue where every question waits for a person, including "where is my
confirmation email?", whose answer has been written down, in four languages, on the **Help Page**
since it was built. An Agent retypes it, or pastes it, at 2am the customer does not get it at
all, and the team's doorbell rings for a question nobody needed to think about.

So the request comes back in a different form: can the system answer the easy ones. The corpus it
would answer from already exists and is already curated — `help.sections` in the locale files,
five articles a person wrote and a translator rendered into ko, ja and zh, guarded by the
ratchet test that refuses an untranslated key.

## Decision

**The widget may suggest an answer before the customer sends. Only a person answers inside a
Support Chat.**

- As the customer types their first message, the widget matches it against the Help Page
  articles and offers up to two, **below the composer** — never in the transcript. A suggestion
  is chrome, not a message, and is never attributed to anyone.
- Matching is **deterministic**: each article carries trigger phrases per locale. No model, no
  embeddings, no vendor. A miss shows nothing; silence beats a confident wrong card.
- The customer decides. **"That answered it"** ends it with no chat in the queue; **"Still need
  help"**, or simply sending, is today's flow unchanged — **Waiting**, **Unassigned**, doorbell.
- **Sending is never blocked, delayed or discouraged.** No forced reading, no "are you sure".
- What was shown is **recorded** — shown, opened, solved, sent anyway, per article and locale —
  and a chat that arrives after a suggestion tells the Agent which articles the customer already
  read.

## Considered Options

**A model answering from the Help Page (retrieval-augmented).** Rejected. It is ADR-0031's
argument in newer clothes: retrieval decides which passage, generation still writes the sentence,
and the sentence is the part that can be wrong about somebody's money. It also re-introduces the
vendor, the key, the budget and the outage mode that ADR-0031 was written to be rid of.

**Curated answers posted into the chat automatically.** Rejected *for now*, not on principle —
the answer is human-written, so the risk is a wrong match rather than an invented policy. But it
puts words in the transcript that no person chose to send in that conversation, and ADR-0031's
second argument still stands unmeasured: with a team this size an Agent reads every chat anyway,
so automation may save nobody any work and only answer sooner. The recording above is what turns
that from an opinion into a number. See "the escape hatch".

**A separate FAQ corpus for the widget.** Rejected. Two sets of answers drift, and the drift is
invisible until a customer is told two different things by the same company on the same day. The
Help Page is the corpus; adding an FAQ means adding an article, which the translation ratchet
then guards.

**Blocking the send until an article has been opened.** Rejected outright. It converts "we
answered you" into "we would not listen", and it is the mechanism behind every support experience
anyone complains about.

## Consequences

- **ADR-0031 stands unchanged.** Nothing automated writes in a Support Chat. This ADR draws the
  line it implied but never stated: the difference is not what the text says, it is whether a
  person chose to send it into that conversation.
- **An article's audience doubles.** A change to `help.sections` now reaches the widget as well
  as `/help`, so a badly-worded answer is seen sooner — which is the good direction for a
  mistake to travel.
- **Trigger phrases are code, not data.** Editing them is a deploy, exactly like editing the
  article they belong to. That is deliberate: an admin screen for editing match rules is a
  feature nobody has asked for, and match quality is judged from the recorded counts anyway.
- **A customer can now leave without a chat.** "That answered it" ends the conversation before it
  starts, so a widget open is no longer evidence of a question. The Waiting count is unaffected —
  it was always the first message that put a chat in the queue.
- **The escape hatch is measured, not argued.** If the counts show one question dominating, and
  its answer is one no reasonable customer disputes, a curated reply may later enter the
  transcript — as a **system notice**, marked, never attributed to an Agent, and the chat still
  reaches the queue unless the customer closes it. That supersedes ADR-0031 and must be written
  as such, with the counts in its "why now".
- **The widget gets a way to be annoying.** Two cards is a cap, not a target, and a match that
  fires on "cancel" for a customer writing about a double charge is worse than no card at all.
  The recorded "sent anyway" rate per article is the alarm for that.
