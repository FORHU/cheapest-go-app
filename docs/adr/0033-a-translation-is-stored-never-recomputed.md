# A translation is stored, never recomputed

Each support message carries two texts: the words its author wrote, which stay authoritative, and one machine translation stored beside them. An inbound customer message stores an English rendering for the Agent; an outbound Agent reply stores a rendering in the customer's locale. Neither is recomputed on read.

The obvious alternative is to translate when the inbox renders and store nothing. It needs no migration, always uses the current model, and costs nothing for the conversations that are already in English.

We store instead, because an Agent's reply is a statement made on the basis of a translation. When a customer later disputes what they were promised, the question is not "what does this Korean sentence mean" — it is "what did the Agent read when they wrote that". Machine translation cannot answer it after the fact: the same input yields different output across model versions, and Chatwonder's `/chat` is stateful, so two calls on the same day need not agree either. Translate-on-read does not merely fail to answer the question; it answers confidently and wrongly, by showing today's translation of yesterday's message as though it were what happened.

This is the same instinct as [ADR-0008](0008-fx-locked-at-booking-in-usd.md), which locks an exchange rate at booking rather than recomputing it, and [ADR-0020](0020-a-hotel-price-carries-the-stay-it-was-quoted-for.md), where a price carries the stay it was quoted for. A derived value that a decision was made on gets recorded alongside the decision.

## Considered Options

**Translate on read, store nothing.** Rejected above. It additionally puts a network call to a single EC2 box on the render path of the Agent inbox — the one screen that has to work when everything else is on fire.

**Store the translation and discard the original.** Rejected outright. It destroys the customer's own words, including in the case where the translation was wrong, which is precisely when they matter.

**Store a translation per reader language.** Rejected as premature. English is the staff working language, so one rendering per direction suffices; per-Agent languages would either multiply stored rows or force translate-on-read and reopen this decision.

## Consequences

- **Two texts per message, and a null branch in every reader.** A message with no translation — an English conversation, or one where translation was unavailable — must render the original, and every surface has to handle that.
- **A stored translation can be visibly wrong and stays wrong.** That is intended: it is a record, not a view. Correcting it means an Agent sending another message, not editing history.
- **Translations are marked as machine-made wherever shown.** Storing them makes them look like authored content; the label is what stops a customer reading a mistranslated policy as CheapestGo's considered wording.
