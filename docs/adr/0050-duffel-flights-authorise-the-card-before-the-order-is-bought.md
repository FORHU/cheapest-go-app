# Duffel flights authorise the card before the order is bought

A Duffel flight is booked by holding the traveller's card, buying the order, and only then
capturing. Until now the order was bought first, from our own Duffel balance, and the card was
asked afterwards. A declined card therefore always arrived after we had spent the money, and every
such case was a cancellation we had to win with the supplier.

**Authorise, buy, capture.** `/book` creates the PaymentIntent with `capture_method: 'manual'` and
buys nothing. When the card is held (`requires_capture`) the Stripe webhook, or `/confirm` as its
fallback, buys the order and captures; a refusal cancels the intent, which releases the hold and
moves no money. Mystifly has always worked this way; this makes Duffel follow it.

**The flow is decided once and stamped on the intent.** `DUFFEL_MANUAL_CAPTURE=on` is read when
the intent is created and recorded as `captureFlow` in its metadata. Everything afterwards routes
by that stamp, so turning the flag off cannot strand a payment already in flight, and intents
created before the flag existed keep the old path with no migration of data.

**A small rise is ours; a large one is the traveller's to accept.** The card is held for a fixed
amount and can be captured for less but never more. A fare that rises by no more than the existing
price tolerance between the hold and the order is absorbed and the traveller is charged what they
saw; above it the hold is released and the new fare is offered. A fare that falls is passed on.

**One claim places one order.** Finalisation is reachable from the webhook, `/confirm` and
auto-recover. The session is claimed atomically (`ordering`), a stale claim can be taken over after
eight minutes, and the order id is written to the session the moment the order exists, so a crash
leaves something the next claimer or the orphan sweep can find. Two authorisations of the same
journey by the same traveller are refused; the second hold is released.

**A hold is never expired under a traveller who is still paying.** Auto-recover looks at sessions
older than five minutes, which is well inside a 3DS challenge. For these intents it waits until the
session has run out, finalises a held card, and releases one that nobody finalised within two hours,
cancelling any order that was bought and never captured.

## Considered options

- **Authorise first (chosen).** Covers every offer, needs no second booking flow, and the failure
  mode of a declined card becomes "nothing was bought".
- **Duffel hold orders.** Measured on test credentials only 15–78% of offers allow them (MNL→ICN
  49%, CRK→LHR 15%, MNL→SIN 78%): a second flow for half the traffic, with its own deadlines, and
  instant orders would still need the same safeguards.
- **Keep ordering first and improve cancellation.** Leaves us paying for every decline and
  depending on the supplier's goodwill to get it back.

## Consequences

- Customers see a pending hold, then a capture. Support should know.
- The offer is older when it is bought, by the length of the card step (3DS included). If it has
  expired the hold is released and the traveller is told they were not charged; the refusal codes
  are logged so the effect on conversion can be measured.
- If the order is bought and capture then fails, we cancel the order and alert the team.
  Cancelling an instant order may not recover the fare; that case is rare because the card was
  already authorised.
- The order-first path stays until the flag has run clean, then is deleted with pre-order reuse.
- `place-duffel-order.ts` is the helper the new path places orders with. It had drifted from the
  inline copy in `/book` and was made equivalent before use; the inline copy goes with the
  order-first path rather than being migrated.
- The mobile routes keep the old flow until their client is checked against `requires_capture`.
