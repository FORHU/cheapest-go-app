# Golf prices are all-in from the first result, and the booking window is per course

A Golf search result, the course page's tee-time buttons and checkout all show the same **all-in price**: green fee plus the service fee, for the party being priced. It is computed by one function, `quoteGolf` in `lib/server/golf/quote.ts`, and `holdTeeTime` charges exactly what it returned. This is written down because the obvious alternative — show the green fee in search and add the fee at checkout, as the tee-time marketplaces do — is cheaper to build and wrong for a product whose promise is a price.

**All-in depends on the party size.** The service fee has a flat component (`GOLF_MARKUP_SPEC`), so the per-player all-in price of a foursome is lower than a single player's. Search therefore prices for a stated number of players (default 2, said on screen) rather than showing one number that is only true for one party size.

**Extras are not in it.** Club rental, caddie and cart are optional and priced at checkout; adding them to the headline would show a price most customers do not pay.

**The booking window is the course's.** `golf_courses.booking_window_days` (1–90, default 60) replaces the global `HORIZON_DAYS` as the limit on generating, listing and selling tee times, because courses differ (the benchmark's municipal course opens 7 and 9 days ahead). Shortening a window deletes nothing; tee times beyond it stop being bookable and listed. `MIN_LEAD_HOURS` stays global: it is the time the team needs to confirm with the course, a platform fact, until courses confirm for themselves.

**The weather rule is displayed, not enforced.** It is text the course gave us, copied onto each booking at the hold like `free_cancel_until`, so a later edit never rewrites what a customer agreed to. What the system does in bad weather is unchanged and stated beside it: if the course closes, the team cancels and the customer is refunded in full. Deposits are not modelled — the card is authorised for the full amount and captured on confirmation.

## Considered options

- **Green fee in search, fee at checkout.** Rejected: the price on the results page would not be the price on the card.
- **A fixed per-player fee.** Rejected: it would misstate the fee the pricing spec actually charges.
- **An enforced weather rule** (refund or not, by course). Deferred: it needs the course to act on it, which is the course-portal work.
