# A hotel price carries the stay it was quoted for

Suppliers quote a **Stay Total** — one figure for a whole date range — but the storefront advertises a **Nightly Rate**. Converting between the two needs the night count, and the night count must be the one the price was quoted for. So a hotel price and its stay travel together, and `resolveStayDates` is the single place either is decided.

We learned this the expensive way. `RoomList` worked its own night count out of the URL while `fetchRoomAvailability` worked the quote's dates out separately; a link spelling the dates `checkin`/`checkout` left the first with nothing and it fell back to one night, while the second quietly quoted a default Friday→Sunday stay. The two-night total was then rendered as "per night" — every affected room advertised at double its real rate, with no error anywhere. Search said ₱5,767, the property page said ₱11,533, and the guest was left to wonder which was the trick.

Seven components derive nights independently today (`MapPopup`, `MapPropertyCard`, `PropertyDatePicker`, `RoomList`, `SearchMapView`, `PropertyCard`, `usePricingCalculation`). That is the actual defect: three independent derivations — URL parsing, night counting, and price basis — that must agree, with nothing making them agree. Fixing the casing removes today's trigger, not the mechanism.

## Considered options

**Normalise the parameter casing.** Cheapest, and it is part of what shipped, but it only closes the one route that happened to break. A bare `/property/{slug}` link with no dates at all still defaults to a two-night quote, and any future component that counts nights for itself can desync again.

**Make the price a value object.** `{ amount, currency, nights, basis: 'stay' | 'night' }` with `perNight()` and `total()`, so a component cannot receive a number and guess what it covers. This is the durable answer and the intended direction; it is deferred because it reaches into `usePricingCalculation`, which sits on the charge path, and the doubled prices were live.

## Consequences

- **`resolveStayDates` is the authority on which stay is being priced.** The availability call and anything restating its price both read it. Changing the fallback changes both at once, which is the point.
- **A price still crosses component boundaries as a bare number.** The value object is not built yet, so the guarantee is convention plus tests, not the type system. `src/lib/property/resolveStayDates.test.ts` pins the case that broke: missing dates must report the fallback stay's night count, never 1.
- **The browser still computes prices, which CONTEXT.md says it must not.** `RoomCard` both converts currency and divides by nights client-side, and 23 files call `convertCurrency`. **Display Currency** already says the server converts and the browser only renders. Honouring that would move this arithmetic server-side and remove the class outright.
- **Revisit when the v2 port reaches hotel booking.** api-v2 owns domain logic ([ADR-0017](0017-api-v2-owns-all-domain-logic.md)), so v2 should emit both figures already computed rather than reproduce this split.
