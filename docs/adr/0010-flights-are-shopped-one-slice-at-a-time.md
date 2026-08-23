# Flights are shopped one slice at a time

A round trip is presented as two successive choices — pick the outbound slice, re-price, pick the return — never as a single card carrying both directions. We chose this because CheapestGo sells the ticket rather than referring the traveller elsewhere: the price is not final until every slice is chosen, and a seller has to stand behind the number on screen. It also makes a whole class of defect impossible, because a row now describes exactly one slice and can no longer mix figures from different scopes.

The pattern is not universal among flight sites, and the split is informative. Metasearch — Kayak, Skyscanner — shows the combined round trip on one card with two rows, which is coherent for a business that hands the traveller off and owes only an indicative price. Booking OTAs that place the order — Expedia, Trip.com, Agoda, and Duffel's own order UI — select per slice. We are in the second group.

## Considered Options

- **Slice Selection (chosen)** — each row describes one slice, so every figure on it has one scope. The row can then afford real detail (every flight number, the layover and where it is spent, terminals, a next-day arrival marker, the operating carrier when it differs from the marketing one) because it is describing one journey rather than summarising two.
- **A combined card with a row per slice** — rejected, though it was the working decision until this ADR. It is the metasearch shape, and it forces onto the screen exactly the figures no provider quotes: a duration for the offer as a whole and a stop count spanning both directions. It was on the point of being built.
- **A combined card showing the outbound only** — the status quo being replaced, and the source of the bug that prompted this. The card rendered `+ 3 more` from `offer.segments.length - 1` (offer-wide, both directions) beside a duration and a stop count that were outbound-only, so a CRK–TPE–ICN outbound advertised four flights, one stop and 5h 45m on one line. The duration was correct; the segment count was answering a different question.

## Consequences

- **A re-price step is mandatory between slices.** Duffel prices a whole itinerary as one offer, so an outbound cannot be paired with an arbitrary return by filtering an existing offer list — the second step has to ask the supplier again. Duffel's own UI makes this explicit as a `Fare options` breadcrumb after both slices are chosen. No Duffel SDK is installed here (the API is called directly with `fetch`), so the partial-offer-request contract needs confirming against their docs before this is built.
- **Total Transit Time is retired**, and was removed from `CONTEXT.md` in the same change. It existed only to rank a card that showed both directions at once; with one slice per row, "fastest" sorts on that slice's own duration.
- **`totalStops` survives only as a filter key** for "max stops", never as something displayed. `totalDuration` does not survive at all.
- **`calculateBestScore()` finally has a caller.** It has been defined in `flight-utils.ts` and never once invoked — `bestScore` is hardcoded to `?? 0` — which is why there are no Cheapest / Best / Fastest tabs today despite the scoring already being written.
- **More supplier data reaches the screen than before, and none of it is new.** Terminals are already parsed and never rendered; airport names, `fare_brand_name`, `ngs_shelf`, `cabin_class_marketing_name` and the operating carrier's own flight number are all present in the offer and dropped at parse time.
- **The traveller sees two prices before committing.** Whatever is shown against an outbound slice is provisional until the return is chosen, and the wording has to say so — this is the honesty cost of the pattern, and the reason metasearch avoids it.
