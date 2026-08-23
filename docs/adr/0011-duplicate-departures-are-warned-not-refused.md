# A same-day duplicate departure is warned about, not refused

`/api/flights/book` detects when a traveller already holds an active booking departing on the same calendar day and answers `409 DUPLICATE_BOOKING`, but the response now carries `canOverride: true`: the traveller sees the clashing booking, and may proceed by re-submitting with `acknowledgeDuplicate`. The check also runs against **every slice** of the itinerary rather than only the first segment, so a return leg is examined exactly as the outbound is.

We chose this because a second departure on one day is common and legitimate — a positioning flight bought on a separate ticket, a booking made for a family member on a shared account, a deliberate backup on a volatile fare — and refusing it outright was stricter than the OTAs we compete with, which warn and let the traveller decide. The risk the original hard block was defending against is real (airlines run duplicate-PNR checks and cancel dupes), but it is the traveller's risk to take, and they can only weigh it if they are told what they already hold.

## Considered Options

- **Warn, allow an explicit override (chosen)** — the guard keeps its full detection value and gains an escape hatch that is recorded in the logs as `verdict=ACKNOWLEDGED`. Costs a round trip: the first submit is refused, and the acknowledgement travels with the second.
- **Hard block on every slice** — rejected. Extending the original refusal to the return leg would have doubled how often a legitimate booking is blocked, with no way for the traveller to get past it except cancelling a trip they may well want to keep.
- **Warn client-side only, before submitting** — rejected. The clash is a fact about server-side state, and a check the client can skip is not a guard. The server stays authoritative; the client only carries the acknowledgement.
- **Drop the guard** — rejected. Paying twice for the same day is a real and expensive mistake, and the airline may cancel both bookings rather than one.

## Consequences

- **`acknowledgeDuplicate` is a request field the client sets, so it is trivially forgeable.** That is acceptable: it authorises nothing but the traveller's own second booking, which they are paying for. It must never be reused to bypass a guard that protects anything other than the traveller from themselves.
- The acknowledgement is scoped to a single submit — the client clears it after each attempt — so an unrelated later booking is checked afresh.
- The guard now issues one query per slice instead of one per booking. Two for a round trip; still bounded by the itinerary, which is at most four slices.
- `verdict=WARN` in the logs no longer means the booking stopped. `verdict=ACKNOWLEDGED` records that the traveller was shown the clash and continued, which is the line to look for when a customer reports two tickets on one day.
- The modal is now a three-way choice, so its copy has to make the consequence of proceeding clear; the two existing actions (cancel the old booking, keep it and abandon this one) are unchanged.
